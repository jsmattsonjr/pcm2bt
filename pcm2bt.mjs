// Pro Cycling Manager kit -> Biketerra jersey atlas (512², seated pose).
//   node pcm2bt.mjs KIT.png OUT.png
// KIT is a classic-layout PCM kit (<team>_maillot: 455x313 up to PCM12,
// 910x626 from PCM13; any size of that map). The shorts are dropped. PCM's
// jersey is reposed onto Biketerra's rider and each texel takes the kit
// where a ray along its normal meets it (src/project.js). Run
// ./fetch-pcm.zsh first.
// SLEEVE cuts Biketerra's sleeves (joint to cuff 0.20 m) to PCM's length
// (`pcm`, the default, ~0.14 m) or to a length in metres; `full` keeps
// Biketerra's own, PCM's sleeve stretched to fit. Below the cut the atlas is
// transparent: the site fills the texture with the rider's skin colour
// before drawing the jersey, so that shows as bare arm.
// TWIST (degrees, default 0) turns the sleeve content round the arm, top
// toward the back, from none at the shoulder to all of it at the cuff.
// DEBUG=1 also writes OUT-reposed.json, the reposed PCM mesh for
// debug/pcmrender.mjs, and OUT-hits.png, how each texel found PCM's surface
// (green by ray, darker the further; magenta the nearest point).
import { readPNG } from './src/png.js';
import { rasterTriangle } from './src/view.js';
import { frames, edgesOf, loadPCM, sampleKit, kitMask } from './src/pcm.js';
import { paint, rig, glb, N } from './src/paint.js';
import { at } from './src/pose.js';
import { projector } from './src/project.js';
import { readFileSync, writeFileSync } from 'node:fs';
const R = new URL('./', import.meta.url).pathname;
const [,, kitPath, outPath] = process.argv;
if (!outPath) { console.error('usage: node pcm2bt.mjs KIT.png OUT.png'); process.exit(2); }

// Biketerra's boundaries in the posed rig: hem (open torso edges low down),
// neck and cuffs (open edges, nearest the neck or an upper-arm joint).
// Torso triangles are the ones reaching v > 0.45 (as torsomap.js).
const { position: P } = rig.skin(), T = rig.jerseyTris, UV = glb.uv, tris = [];
for (let t = 0; t < T.length; t += 3) tris.push([T[t], T[t+1], T[t+2]]);
const pt = (i) => [P[i*3], P[i*3+1], P[i*3+2]];
const J = { l: at(rig, 'upperArm.l'), r: at(rig, 'upperArm.r') }, NECK = at(rig, 'neck'), HIP = at(rig, 'spine.1');
const d = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
const bt = { hem: [], neck: [], cuff: { l: [], r: [] }, joint: J, left: J.l.map((q, i) => q - J.r[i]), fwd: [1, 0, 0] };
for (const e of edgesOf(tris, pt, (k) => Math.max(...tris[k].map((v) => UV[v*2+1])) > 0.45)) {
  if (e.n !== 1) continue;
  const m = e.a.map((q, i) => (q + e.b[i]) / 2), near = Math.min(d(m, J.l), d(m, J.r), d(m, NECK), d(m, HIP));
  if (near === d(m, HIP)) bt.hem.push([e.a, e.b]);
  else if (near === d(m, NECK)) bt.neck.push([e.a, e.b]);
  else bt.cuff[near === d(m, J.l) ? 'l' : 'r'].push([e.a, e.b]);
}
// Upper-arm skin weights, rasterised in atlas space at paint()'s 4x4
// subsamples: the projection keeps a point to PCM's matching part with them.
const names = glb.skinJoints.map((i) => glb.nodes[i].name), wmap = { l: new Float32Array(N * N), r: new Float32Array(N * N) };
const wt = (v, n) => { let s = 0; for (let k = 0; k < 4; k++) if (names[glb.joints[v*4+k]] === n) s += glb.weights[v*4+k]; return s; };
const pcmPath = R + 'assets/pcm_cyclist.json', pcm = loadPCM(pcmPath), SLEEVE = process.env.SLEEVE || 'pcm';
if (SLEEVE === 'pcm') bt.sleeveLen = pcm.fr.armLen;
else if (SLEEVE !== 'full') {
  const m = Number(SLEEVE); if (!(m > 0)) { console.error(`SLEEVE=${SLEEVE}: pcm, full or a length in metres`); process.exit(2); }
  bt.sleeveLen = { l: m, r: m };
}
const fr = frames(bt), TWIST = Number(process.env.TWIST ?? 0) * Math.PI / 180;
console.log(`Biketerra: hem ${bt.hem.length}, neck ${bt.neck.length}, cuffs ${bt.cuff.l.length}+${bt.cuff.r.length} edges; PCM: ${pcm.tris.length} jersey triangles`);
for (const t of tris) {
  const w = { l: t.map((v) => wt(v, 'upperArm.l')), r: t.map((v) => wt(v, 'upperArm.r')) };
  rasterTriangle(...t.flatMap((v) => [UV[v*2] * N, UV[v*2+1] * N]), N, N, (x, y, b0, b1, b2) => {
    for (const s of ['l', 'r']) wmap[s][y*N+x] = b0*w[s][0] + b1*w[s][1] + b2*w[s][2]; });
}
const wAt = (x, y) => { const k = Math.min(N - 1, Math.floor(y * 4)) * N + Math.min(N - 1, Math.floor(x * 4)); return { l: wmap.l[k], r: wmap.r[k] }; };
const kit = readPNG(kitPath), mask = kitMask(pcm, kit.width, kit.height);
const bare = (p) => { if (!bt.sleeveLen) return false; const g = fr.weight(p), s = g.l >= g.r ? 'l' : 'r'; return g[s] > 0.5 && fr.beyond(s, p); };
const look = projector(pcm, JSON.parse(readFileSync(pcmPath)), bt, TWIST, fr.cut);
paint(({ p, n, x, y }) => bare(p) ? [0, 0, 0, 0] : sampleKit(kit, ...look(p, n, wAt(x, y)), mask), outPath);
const ts = look.stats.t.sort((a, b) => a - b), q = (f) => (ts[Math.floor(f * (ts.length - 1))] * 100).toFixed(1);
console.log(`project: ${look.stats.ray} by ray, ${look.stats.near} nearest; distance cm p50 ${q(0.5)} p90 ${q(0.9)} p99 ${q(0.99)} max ${q(1)}`);
console.log(`  collar base below the neck loop, cm, front/left/back/right: ${look.repose.target.collarDrop.map((x) => (x * 100).toFixed(1)).join(' ')}`);
const cs = look.repose.target.cuffScale;
for (const k of ['l', 'r']) console.log(`  cuff stretch ${k}, phi -180..135 by 45: ${cs[k].map((x) => x.toFixed(2)).join(' ')}; cuff off the cut by at most ${(look.repose.target.cuffMiss[k] * 100).toFixed(2)} cm`);

if (process.env.DEBUG) {
  const d = JSON.parse(readFileSync(pcmPath));
  writeFileSync(outPath.replace(/\.png$/, '-reposed.json'), JSON.stringify({ ...d, position: look.repose.P }));
  // How each texel was found: green by ray (darker the further), magenta the nearest point.
  paint(({ p, n, x, y }) => { look(p, n, wAt(x, y)); const k = 1 - Math.min(1, look.dist / 0.08) * 0.7;
    return look.how === 'near' ? [255, 0, 255] : [40 * k, 220 * k, 60 * k]; }, outPath.replace(/\.png$/, '-hits.png'));
}
