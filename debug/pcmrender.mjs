// The PCM rider wearing a kit, rendered in software so it can be set beside
// render.zsh's Biketerra rider: the rider pcm2bt.mjs projects from
// (PCM_MESH: pcmmod, the default, pcmmod.com's viewer rider, body in grey;
// jview, PCM.daily's, posed by PCM_CLIP), orthographic, z-buffered,
// flat-shaded, kit sampled nearest. Jview's mesh is mirrored (README, The
// PCM rider), so its image is flipped back: lettering reads as in the game.
//   node debug/pcmrender.mjs OUT.png FWD LEFT UP [KIT.png] [MESH]
// FWD LEFT UP is the direction from the rider to the camera: rider's
// horizontal forward, rider's left, world up (-1 0 0.3 is from behind and a
// little above; 0 1 0.1 the left side). KIT defaults to
// assets/pcm_default.png; MESH is pcmmod, jview or a posed mesh pcm2bt.mjs
// wrote with DEBUG=1 (OUT-reposed.json), default PCM_MESH.
import { readPNG, writePNG } from '../src/png.js';
import { rasterTriangle } from '../src/view.js';
import { lerp } from '../src/pcm.js';
import { loadRider, PCM_MESH } from '../src/pcmmod.js';
const R = new URL('../', import.meta.url).pathname;
const [out, ...rest] = process.argv.slice(2);
if (rest.length < 3) { console.error('usage: node debug/pcmrender.mjs OUT.png FWD LEFT UP [KIT.png] [MESH]'); process.exit(2); }
const b = rest.slice(0, 3).map(Number), kitPath = rest[3] || R + 'assets/pcm_default.png';
const pcm = loadRider(R, rest[4] || PCM_MESH), kit = readPNG(kitPath);

const sub = (a, c) => a.map((q, i) => q - c[i]), dot = (a, c) => a.reduce((s, q, i) => s + q * c[i], 0);
const norm = (a) => { const l = Math.hypot(...a); return a.map((q) => q / l); };
const cross = (a, c) => [a[1]*c[2]-a[2]*c[1], a[2]*c[0]-a[0]*c[2], a[0]*c[1]-a[1]*c[0]];
// Left is toward the L bones; forward the rider's hint, made horizontal.
const up = pcm.up, L = norm(sub(pcm.mesh.joint.l, pcm.mesh.joint.r));
const Lh = norm(sub(L, up.map((q) => q * dot(L, up)))), Fh = norm(cross(Lh, up)).map((q, _, a) => dot(a, pcm.mesh.fwd) < 0 ? -q : q);
const cam = norm([0, 1, 2].map((i) => b[0] * Fh[i] + b[1] * Lh[i] + b[2] * up[i]));
const right = norm(cross(up, cam)), vup = norm(cross(cam, right));
const S = 700, scale = 900, C = pcm.fr.C, flip = pcm.mirrored ? -1 : 1;
const proj = (p) => { const q = sub(p, C); return [S / 2 + flip * dot(q, right) * scale, S / 2 - dot(q, vup) * scale, dot(q, cam)]; };
const zb = new Float32Array(S * S).fill(-Infinity), im = { width: S, height: S, data: new Uint8ClampedArray(S * S * 4).fill(255) };
const light = norm([0, 1, 2].map((i) => cam[i] + up[i] * 0.5));
const draw = (t, colour) => {
  const P = t.map((v) => pcm.P[v]), sh = 0.35 + 0.65 * Math.abs(dot(norm(cross(sub(P[1], P[0]), sub(P[2], P[0]))), light));
  const sp = P.map(proj);
  rasterTriangle(...sp.flatMap((q) => [q[0], q[1]]), S, S, (x, y, ...bc) => {
    const z = bc[0] * sp[0][2] + bc[1] * sp[1][2] + bc[2] * sp[2][2], k = y * S + x; if (z <= zb[k]) return; zb[k] = z;
    im.data.set([...colour(bc).map((c) => c * sh), 255], k * 4);
  });
};
for (const t of pcm.other) draw(t, () => [200, 200, 200]);
for (const t of pcm.all) draw(t, (bc) => {
  const uv = lerp(t, (v) => pcm.UV[v], bc);
  const kx = Math.min(kit.width - 1, Math.max(0, Math.floor(uv[0] * kit.width))), ky = Math.min(kit.height - 1, Math.max(0, Math.floor((1 - uv[1]) * kit.height)));
  const s = (ky * kit.width + kx) * 4; return [kit.data[s], kit.data[s+1], kit.data[s+2]];
});
writePNG(out, im);
