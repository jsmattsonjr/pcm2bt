// The PCM rider wearing a kit, rendered in software so it can be set beside
// render.zsh's Biketerra rider: the cyclist_jersey mesh (jersey and shorts)
// in its bind pose, orthographic, z-buffered, flat-shaded, kit sampled
// nearest. The raw mesh is mirrored (README, The PCM rider), so the image is
// flipped back: lettering reads as in the game.
//   node debug/pcmrender.mjs OUT.png FWD LEFT UP [KIT.png] [MESH.json]
// FWD LEFT UP is the direction from the rider to the camera: rider's
// horizontal forward, rider's left, world up (-1 0 0.3 is from behind and a
// little above; 0 1 0.1 the left side). KIT defaults to
// assets/pcm_default.png, MESH to assets/pcm_cyclist.json.
import { readFileSync } from 'node:fs';
import { readPNG, writePNG } from '../src/png.js';
import { rasterTriangle } from '../src/view.js';
import { loadPCM, lerp } from '../src/pcm.js';
const R = new URL('../', import.meta.url).pathname;
const [out, ...rest] = process.argv.slice(2);
if (rest.length < 3) { console.error('usage: node debug/pcmrender.mjs OUT.png FWD LEFT UP [KIT.png] [MESH.json]'); process.exit(2); }
const b = rest.slice(0, 3).map(Number), kitPath = rest[3] || R + 'assets/pcm_default.png', meshPath = rest[4] || R + 'assets/pcm_cyclist.json';
const pcm = loadPCM(meshPath), d = JSON.parse(readFileSync(meshPath)), kit = readPNG(kitPath);

const sub = (a, c) => a.map((q, i) => q - c[i]), dot = (a, c) => a.reduce((s, q, i) => s + q * c[i], 0);
const norm = (a) => { const l = Math.hypot(...a); return a.map((q) => q / l); };
const cross = (a, c) => [a[1]*c[2]-a[2]*c[1], a[2]*c[0]-a[0]*c[2], a[0]*c[1]-a[1]*c[0]];
// Mesh space is z up, the rider facing -y; left is toward the L bones.
const up = [0, 0, 1], L = norm(sub(pcm.mesh.joint.l, pcm.mesh.joint.r));
const Lh = norm(sub(L, up.map((q) => q * dot(L, up)))), Fh = norm(cross(Lh, up)).map((q, _, a) => dot(a, [0, -1, 0]) < 0 ? -q : q);
const cam = norm([0, 1, 2].map((i) => b[0] * Fh[i] + b[1] * Lh[i] + b[2] * up[i]));
const right = norm(cross(up, cam)), vup = norm(cross(cam, right));
const S = 700, scale = 900, C = pcm.fr.C;
// x flipped: the mirror image of the mirrored mesh.
const proj = (p) => { const q = sub(p, C); return [S / 2 - dot(q, right) * scale, S / 2 - dot(q, vup) * scale, dot(q, cam)]; };
const zb = new Float32Array(S * S).fill(-Infinity), im = { width: S, height: S, data: new Uint8ClampedArray(S * S * 4).fill(255) };
const light = norm([0, 1, 2].map((i) => cam[i] + up[i] * 0.5));
for (const t of d.submeshes[0]) {
  const P = t.map((v) => d.position[v]), sh = 0.35 + 0.65 * Math.abs(dot(norm(cross(sub(P[1], P[0]), sub(P[2], P[0]))), light));
  const sp = P.map(proj);
  rasterTriangle(...sp.flatMap((q) => [q[0], q[1]]), S, S, (x, y, ...bc) => {
    const z = bc[0] * sp[0][2] + bc[1] * sp[1][2] + bc[2] * sp[2][2], k = y * S + x; if (z <= zb[k]) return; zb[k] = z;
    const uv = lerp(t, (v) => d.uv[v], bc);
    const kx = Math.min(kit.width - 1, Math.max(0, Math.floor(uv[0] * kit.width))), ky = Math.min(kit.height - 1, Math.max(0, Math.floor((1 - uv[1]) * kit.height)));
    const s = (ky * kit.width + kx) * 4; im.data.set([kit.data[s] * sh, kit.data[s+1] * sh, kit.data[s+2] * sh, 255], k * 4);
  });
}
writePNG(out, im);
