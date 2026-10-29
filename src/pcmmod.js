// pcmmod.com's web jersey viewer rider (assets/pcmmod/scene.gltf from
// fetch-pcmmod.zsh), the PCM surface pcm2bt projects from by default. It is
// one static mesh, the whole rider already posed (standing, arms forward and
// down), with no skeleton: y up, facing +z, right-handed and unmirrored. Its
// sleeve sits rolled round the arm as the kit was meant to be seen ("Sunweb"
// down the outer arm), where the Jview rider's puts it on the shoulder top.
//
// Its UVs index the viewer's 2048x2048 composite, where the kit (the
// classic map, any size) is drawn into KIT_RECT. The rider has no bones, so
// it borrows the Jview rider's (pcm.js loadPCM): the two share the kit map,
// so each kit vertex here takes the bone weights and bind position of the
// Jview point with the same kit UV, and each bone's pose is the rigid fit
// (weighted Kabsch, after a global similarity fit) of those Jview bind points
// onto this rider's. -> the same shape as loadPCM().
import { readFileSync } from 'node:fs';
import { rasterTriangle } from './view.js';
import { edgesOf, frames, HEM_V, loadPCM } from './pcm.js';

const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]], dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const add = (a, b, s = 1) => [a[0]+b[0]*s, a[1]+b[1]*s, a[2]+b[2]*s];

// Where the viewer draws the kit in its 2048 composite (jersey_viewer_viewer
// bundle, elementsPosition); glTF UVs run from the top left.
export const KIT_RECT = { x: 832, y: 1206, w: 1200, h: 826 }, ATLAS = 2048;
const kitUV = ([u, v]) => [(u * ATLAS - KIT_RECT.x) / KIT_RECT.w, 1 - (v * ATLAS - KIT_RECT.y) / KIT_RECT.h];

function readGLTF(path) {
  const g = JSON.parse(readFileSync(path)), bin = readFileSync(new URL(g.buffers[0].uri, 'file://' + path));
  const acc = (i) => {
    const a = g.accessors[i], v = g.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const T = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
    const flat = new T(bin.buffer.slice(bin.byteOffset + v.byteOffset + (a.byteOffset || 0), bin.byteOffset + v.byteOffset + (a.byteOffset || 0) + a.count * n * T.BYTES_PER_ELEMENT));
    return n === 1 ? [...flat] : Array.from({ length: a.count }, (_, k) => [...flat.subarray(k * n, k * n + n)]);
  };
  const p = g.meshes[0].primitives[0], idx = acc(p.indices), tris = [];
  for (let t = 0; t < idx.length; t += 3) tris.push([idx[t], idx[t + 1], idx[t + 2]]);
  return { P: acc(p.attributes.POSITION), uv: acc(p.attributes.TEXCOORD_0), tris };
}

// The PCM rider to project from: PCM_MESH=pcmmod (the default) or jview
// (pcm.js, posed by PCM_CLIP), or a posed mesh pcm2bt.mjs wrote with DEBUG=1
// (path given). root is the repo root.
export const PCM_MESH = process.env.PCM_MESH || 'pcmmod';
export function loadRider(root, which = PCM_MESH) {
  if (which.endsWith('.json')) {
    const d = JSON.parse(readFileSync(which));
    if (d.kind !== 'posed') return loadPCM(which);
    return { ...d, mesh: { joint: d.joint, fwd: d.fwd }, fr: { C: d.C } };
  }
  const jp = root + 'assets/pcm_cyclist.json';
  if (which === 'jview') return loadPCM(jp);
  if (which !== 'pcmmod') throw new Error(`PCM_MESH=${which}: pcmmod or jview`);
  return loadPCMMod(root + 'assets/pcmmod/scene.gltf', loadPCM(jp, 'bind'), JSON.parse(readFileSync(jp)));
}
// A posed rider as JSON for loadRider (pcm2bt.mjs's DEBUG=1), positions P.
export const posedJSON = (pcm, P) => JSON.stringify({ kind: 'posed', P, UV: pcm.UV, all: pcm.all, other: pcm.other,
  joint: pcm.mesh.joint, fwd: pcm.mesh.fwd, up: pcm.up, mirrored: pcm.mirrored, C: pcm.fr.C });

// 3x3 helpers for the fits: SVD-free Kabsch via Horn's quaternion method.
function horn(src, dst, w) {
  let ws = 0, cs = [0, 0, 0], cd = [0, 0, 0];
  src.forEach((s, i) => { ws += w[i]; cs = add(cs, s, w[i]); cd = add(cd, dst[i], w[i]); });
  cs = cs.map((q) => q / ws); cd = cd.map((q) => q / ws);
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  src.forEach((s, i) => { const a = sub(s, cs), b = sub(dst[i], cd); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += w[i] * a[r] * b[c]; });
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]];
  // Largest eigenvector by power iteration on N shifted positive.
  const sh = Math.abs(N.flat().reduce((m, q) => Math.max(m, Math.abs(q)), 0)) * 4 + 1e-12;
  let q = [1, 0, 0, 0];
  for (let it = 0; it < 500; it++) {
    const n = N.map((row, i) => row.reduce((s, x, j) => s + x * q[j], 0) + sh * q[i]), l = Math.hypot(...n); q = n.map((x) => x / l);
  }
  const [w0, x, y, z] = q;
  const R = [[1 - 2*(y*y + z*z), 2*(x*y - z*w0), 2*(x*z + y*w0)], [2*(x*y + z*w0), 1 - 2*(x*x + z*z), 2*(y*z - x*w0)], [2*(x*z - y*w0), 2*(y*z + x*w0), 1 - 2*(x*x + y*y)]];
  let num = 0, den = 0;
  src.forEach((s, i) => { const a = sub(s, cs), ra = R.map((r) => dot(r, a)); num += w[i] * dot(ra, sub(dst[i], cd)); den += w[i] * dot(a, a); });
  return { R, cs, cd, scale: num / den };
}

// pcmmod rider -> loadPCM()'s shape. jv: loadPCM(jview, 'bind'); d: its raw JSON.
export function loadPCMMod(path, jv, d) {
  const m = readGLTF(path), N = m.P.length, UV = m.uv.map(kitUV);
  // Jview's kit triangles (jersey and shorts) rasterised in kit UV, so a UV
  // finds the Jview triangle under it (and whether Jview's kit covers it).
  const GW = 910, GH = 626, cell = new Int32Array(GW * GH).fill(-1), jt = d.submeshes[0];
  jt.forEach((t, k) => rasterTriangle(...t.flatMap((v) => [d.uv[v][0] * GW, (1 - d.uv[v][1]) * GH]), GW, GH, (x, y) => { cell[y * GW + x] = k; }));
  const at = ([u, v]) => { const x = Math.floor(u * GW), y = Math.floor((1 - v) * GH); return x >= 0 && y >= 0 && x < GW && y < GH ? cell[y * GW + x] : -1; };
  const inKit = (t) => t.every((v) => UV[v][0] >= 0 && UV[v][0] <= 1 && UV[v][1] >= 0 && UV[v][1] <= 1);
  const kit = m.tris.filter((t) => inKit(t) && at([0, 1].map((i) => (UV[t[0]][i] + UV[t[1]][i] + UV[t[2]][i]) / 3)) >= 0);
  const kitSet = new Set(kit), other = m.tris.filter((t) => !kitSet.has(t));

  // Per kit vertex: the Jview triangle under its UV (nearest covered cell if
  // it falls in a gap), barycentrics there -> bind position and bone weights.
  const NB = d.bones.length, wts = new Array(N), bind = new Array(N), used = new Set(kit.flat());
  const bary = (p, a, b, c) => { const v0 = sub(b, a), v1 = sub(c, a), v2 = sub(p, a), d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1), den = d00 * d11 - d01 * d01;
    const y = (d11 * d20 - d01 * d21) / den, z = (d00 * d21 - d01 * d20) / den; return [1 - y - z, y, z]; };
  for (const v of used) {
    let k = at(UV[v]);
    for (let r = 1; k < 0 && r < 40; r++) for (let dy = -r; dy <= r && k < 0; dy++) for (let dx = -r; dx <= r && k < 0; dx++)
      k = at([UV[v][0] + dx / GW, UV[v][1] - dy / GH]);
    const t = jt[k], u3 = (i) => [d.uv[i][0], d.uv[i][1], 0], b = bary([...UV[v], 0], u3(t[0]), u3(t[1]), u3(t[2])).map((q) => Math.min(1, Math.max(0, q))), bs = b[0] + b[1] + b[2];
    const w = new Float64Array(NB);
    t.forEach((i, c) => d.boneIndex[i].forEach((bn, s) => { w[bn] += b[c] / bs * d.boneWeight[i][s]; }));
    wts[v] = w; bind[v] = t.reduce((s, i, c) => add(s, jv.P[i], b[c] / bs), [0, 0, 0]);
  }
  // Jview is mirrored (README, The PCM rider) and this rider is not, so the
  // Jview side is mirrored in x before fitting. A global similarity fit sets
  // the scale; then each bone's rigid fit over the vertices it weights most.
  const mir = (p) => [-p[0], p[1], p[2]], vs = [...used];
  const glob = horn(vs.map((v) => mir(bind[v])), vs.map((v) => m.P[v]), vs.map(() => 1)), sc = glob.scale;
  const fit = d.bones.map((_, bn) => {
    const sel = vs.filter((v) => wts[v][bn] > 0.3);
    if (sel.length < 4) return null;
    const f = horn(sel.map((v) => mir(bind[v]).map((q) => q * sc)), sel.map((v) => m.P[v]), sel.map((v) => wts[v][bn] ** 2));
    const map = (p) => { const a = sub(mir(p).map((q) => q * sc), f.cs); return add(f.cd, f.R.map((r) => dot(r, a))); };
    const res = Math.sqrt(sel.reduce((s, v) => s + wts[v][bn] ** 2 * Math.hypot(...sub(map(bind[v]), m.P[v])) ** 2, 0) / sel.reduce((s, v) => s + wts[v][bn] ** 2, 0));
    return { map, n: sel.length, res };
  });
  const boneAt = (n) => { const b = d.bones.findIndex((x) => x.name.endsWith(n)); const f = fit[b] ?? fit[d.bones.findIndex((x) => x.name.endsWith('Spine2'))];
    return f.map(jv.boneAt(d.bones[b].name)); };
  const ua = m.P.map((_, v) => ({ l: wts[v] ? wts[v][d.bones.findIndex((x) => x.name.endsWith('L_UpperArm'))] : 0, r: wts[v] ? wts[v][d.bones.findIndex((x) => x.name.endsWith('R_UpperArm'))] : 0 }));
  const skin = { bones: d.bones, boneIndex: m.P.map((_, v) => wts[v] ? [...wts[v].keys()].filter((b) => wts[v][b] > 0) : []),
    boneWeight: null };
  skin.boneWeight = skin.boneIndex.map((bs, v) => bs.map((b) => wts[v][b]));

  // Boundaries: the hem where jersey meets shorts, and the jersey's open
  // edges chained into loops, each loop the neck, a cuff or (if the shorts
  // don't meet it) the hem by the landmark nearest its centroid. Edge by
  // edge, the front of the neckline lay nearer the fitted shoulder joints
  // than the neck (no vertex is mostly Neck-weighted, so its origin comes
  // from Spine2's fit).
  const below = (t) => t.reduce((s, v) => s + UV[v][1], 0) / 3 <= HEM_V, tris = kit.filter((t) => !below(t));
  const edges = edgesOf(kit, (i) => m.P[i], (k) => below(kit[k]) ? 'shorts' : 'jersey');
  const hem = [], neck = [], cuff = { l: [], r: [] }, J = { l: boneAt('L_UpperArm'), r: boneAt('R_UpperArm') }, NK = boneAt('Neck'), HIP = boneAt('Pelvis');
  const dd = (a, b) => Math.hypot(...sub(a, b)), key = (p) => p.map((q) => q.toFixed(4)).join(), root = new Map();
  const find = (k) => { while (root.get(k) !== k) { root.set(k, root.get(root.get(k))); k = root.get(k); } return k; };
  const open = edges.filter((e) => e.n === 1 && e.cls.has('jersey'));
  for (const e of open) for (const p of [e.a, e.b]) if (!root.has(key(p))) root.set(key(p), key(p));
  for (const e of open) root.set(find(key(e.a)), find(key(e.b)));
  const loops = new Map();
  for (const e of open) { const r = find(key(e.a)); (loops.get(r) || loops.set(r, []).get(r)).push([e.a, e.b]); }
  for (const e of edges) if (e.n === 2 && e.cls.size === 2) hem.push([e.a, e.b]);
  for (const segs of loops.values()) {
    const c = segs.reduce((s, [a, b]) => add(s, add(a, b), 0.5 / segs.length), [0, 0, 0]);
    const ds = { hem: dd(c, HIP), neck: dd(c, NK), l: dd(c, J.l), r: dd(c, J.r) }, k = Object.keys(ds).reduce((a, b) => ds[a] <= ds[b] ? a : b);
    (k === 'hem' ? hem : k === 'neck' ? neck : cuff[k]).push(...segs);
  }
  const mesh = { hem, neck, cuff, joint: J, left: sub(J.l, J.r), fwd: [0, 0, 1] };
  return { P: m.P, UV, ua, tris, all: kit, other, mesh, fr: frames(mesh), boneAt, skin, up: [0, 1, 0], mirrored: false,
    fitStats: { scale: sc, bones: d.bones.map((b, i) => [b.name.replace('Bip_RR_cyclist_', ''), fit[i] && fit[i].n, fit[i] && fit[i].res]) } };
}
