// Pro Cycling Manager kit -> Biketerra jersey atlas (512², seated pose).
//   node pcm2bt.mjs KIT.png OUT.png
// KIT is a classic-layout PCM kit (<team>_maillot: 455x313 up to PCM12,
// 910x626 from PCM13; any size of that map). The shorts are dropped: the
// Biketerra jersey, longer than PCM's, takes the whole PCM jersey from hem to
// neckline. Correspondence: src/pcm.js. Run ./fetch-pcm.zsh first.
// DEBUG=1 also writes OUT-coords.png (Biketerra's coordinates as colour) and
// OUT-pcmcoords.png (PCM's, in kit space, same colours): converting the latter
// should give the former.
// MAP=project maps by repose and project (src/project.js) instead of the
// canonical body; TWIST then defaults to 0. With DEBUG=1 it also writes
// OUT-reposed.json, the reposed PCM mesh for debug/pcmrender.mjs.
import { readPNG, writePNG } from './src/png.js';
import { rasterTriangle } from './src/view.js';
import { frames, edgesOf, loadPCM, pcmMatch, canon, lerp, sampleKit, kitMask } from './src/pcm.js';
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
// Which part a point is for the lookup: as on PCM, where the upper-arm skin
// weight passes 0.5, not Biketerra's UV islands (whose seam sits elsewhere),
// so both riders split sleeve from torso the same anatomical way. Weights
// rasterised in atlas space at paint()'s 4x4 subsamples.
const names = glb.skinJoints.map((i) => glb.nodes[i].name), wmap = { l: new Float32Array(N * N), r: new Float32Array(N * N) };
const wt = (v, n) => { let s = 0; for (let k = 0; k < 4; k++) if (names[glb.joints[v*4+k]] === n) s += glb.weights[v*4+k]; return s; };
const btw = tris.flat().reduce((m, v) => (m[v] ||= { l: wt(v, 'upperArm.l'), r: wt(v, 'upperArm.r') }, m), []);
bt.surface = { tris, pos: pt, w: (v) => btw[v] };
// Sleeve twist: PCM's front panel covers the inner half of the sleeve, front
// round to back. PCM's game hangs the arms against the body, hiding the
// inner back; Biketerra's riding pose holds them forward and apart, so from
// behind the front panel's colour shows on the inner half. Turning the sleeve content
// TWIST degrees (default 40) round the arm wraps the outer half onto the
// back, as the kit looks in PCM, at the cost of strict placement. 0 maps the
// sleeves as they sit on PCM's mesh.
// SLEEVE shortens Biketerra's sleeves (joint to cuff, 0.20 m) to PCM's
// (`pcm`, ~0.14 m) or to a length in metres; below the new cuff the atlas is
// transparent, which the site shows as the rider's skin.
const MAP = process.env.MAP || 'canon', pcm = loadPCM(R + 'assets/pcm_cyclist.json'), match = MAP === 'project' ? null : pcmMatch(pcm), SLEEVE = process.env.SLEEVE;
if (SLEEVE) bt.sleeveLen = SLEEVE === 'pcm' ? pcm.fr.armLen : { l: Number(SLEEVE), r: Number(SLEEVE) };
const fr = frames(bt), sleeve = fr.sleeve, TWIST = Number(process.env.TWIST ?? (MAP === 'project' ? 0 : 40)) * Math.PI / 180;
fr.sleeve = (s, p) => { const [ph, t] = sleeve(s, p); return [ph + TWIST, t]; };
console.log(`Biketerra: hem ${bt.hem.length}, neck ${bt.neck.length}, cuffs ${bt.cuff.l.length}+${bt.cuff.r.length} edges; PCM: ${pcm.tris.length} jersey triangles`);
for (const t of tris) {
  const w = { l: t.map((v) => wt(v, 'upperArm.l')), r: t.map((v) => wt(v, 'upperArm.r')) };
  rasterTriangle(...t.flatMap((v) => [UV[v*2] * N, UV[v*2+1] * N]), N, N, (x, y, b0, b1, b2) => {
    for (const s of ['l', 'r']) wmap[s][y*N+x] = b0*w[s][0] + b1*w[s][1] + b2*w[s][2]; });
}
const wAt = (x, y) => { const k = Math.min(N - 1, Math.floor(y * 4)) * N + Math.min(N - 1, Math.floor(x * 4)); return { l: wmap.l[k], r: wmap.r[k] }; };
const kit = readPNG(kitPath), mask = kitMask(pcm, kit.width, kit.height);
const bare = (p) => { if (!SLEEVE) return false; const g = fr.weight(p), s = g.l >= g.r ? 'l' : 'r'; return g[s] > 0.5 && sleeve(s, p)[1] > 1; };
const look = MAP === 'project' && projector(pcm, JSON.parse(readFileSync(R + 'assets/pcm_cyclist.json')), bt, TWIST);
paint(({ p, n, x, y }) => bare(p) ? [0, 0, 0, 0] : sampleKit(kit, ...(look ? look(p, n, wAt(x, y)) : match(canon(fr, p, wAt(x, y)))), mask), outPath);
if (look) {
  const t = look.stats.t.sort((a, b) => a - b), q = (f) => (t[Math.floor(f * (t.length - 1))] * 100).toFixed(1);
  console.log(`project: ${look.stats.ray} by ray, ${look.stats.near} nearest; distance cm p50 ${q(0.5)} p90 ${q(0.9)} p99 ${q(0.99)} max ${q(1)}`);
}

if (process.env.DEBUG && look) {
  const d = JSON.parse(readFileSync(R + 'assets/pcm_cyclist.json'));
  writeFileSync(outPath.replace(/\.png$/, '-reposed.json'), JSON.stringify({ ...d, position: look.repose.P }));
}
if (process.env.DEBUG && !look) {
  // Canonical position as colour (red forward, green left, blue up, banded
  // every 3 cm), for each rider: converting OUT-pcmcoords.png should give
  // OUT-coords.png.
  const col = (X) => { const k = X.reduce((a, q) => a * (Math.floor(q / 0.03) % 2 ? 1 : 0.8), 1);
    return [(X[0] / 0.4 + 0.5) * 255 * k, (X[1] / 0.8 + 0.5) * 255 * k, (X[2] / 0.5) * 255 * k]; };
  const base = outPath.replace(/\.png$/, '');
  paint(({ p, x, y }) => col(canon(fr, p, wAt(x, y))), base + '-coords.png');
  const W = kit.width, H = kit.height, im = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  for (const t of pcm.tris) {
    const uv = t.map((v) => [pcm.UV[v][0] * W, (1 - pcm.UV[v][1]) * H]);
    rasterTriangle(...uv.flat(), W, H, (x, y, ...b) => {
      const p = lerp(t, (v) => pcm.P[v], b), w = { l: lerp(t, (v) => pcm.ua[v].l, b), r: lerp(t, (v) => pcm.ua[v].r, b) };
      im.data.set([...col(canon(pcm.fr, p, w)).map(Math.round), 255], (y * W + x) * 4);
    });
  }
  writePNG(base + '-pcmcoords.png', im);
}
