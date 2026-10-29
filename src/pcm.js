// Pro Cycling Manager kit -> Biketerra jersey: the PCM rider, each rider's
// sleeve frames and cut, and kit sampling. The mapping itself is
// project.js (repose and project).
// Every direction is named (left = toward the L bones, forward = a hint),
// never a cross product, so a mirrored mesh can't flip one.
import { readFileSync } from 'node:fs';
import { rasterTriangle } from './view.js';

const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]], dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const add = (a, b, s = 1) => [a[0]+b[0]*s, a[1]+b[1]*s, a[2]+b[2]*s];
const norm = (a) => { const l = Math.hypot(...a); return a.map((q) => q / l); };
const perp = (a, ...bs) => norm(bs.reduce((v, b) => add(v, b, -dot(v, b)), a));
const TAU = 2 * Math.PI, wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Length-weighted centroid of segments [[a, b], ...].
function centroid(segs) {
  let w = 0, c = [0, 0, 0];
  for (const [a, b] of segs) { const l = Math.hypot(...sub(b, a)); c = add(c, add(a, b), l / 2); w += l; }
  return c.map((q) => q / w);
}

// A boundary as a function of angle: f(angle) -> mean value of the loop there,
// from the segments sampled every 2 mm into 1-degree bins, gaps interpolated
// round the circle.
function profile(segs, coord) {
  const sum = new Float64Array(360), n = new Float64Array(360);
  for (const [a, b] of segs) {
    const k = Math.max(1, Math.ceil(Math.hypot(...sub(b, a)) / 0.002));
    for (let i = 0; i <= k; i++) {
      const [ang, val] = coord(add(a, sub(b, a), i / k)), j = Math.floor((wrap(ang) + Math.PI) / TAU * 360) % 360;
      sum[j] += val; n[j]++;
    }
  }
  const known = [...n.keys()].filter((j) => n[j]), f = new Float64Array(360);
  for (let j = 0; j < 360; j++) {
    if (n[j]) { f[j] = sum[j] / n[j]; continue; }
    const p = known.findLast((q) => q < j) ?? known.at(-1) - 360, q = known.find((q) => q > j) ?? known[0] + 360;
    const fp = sum[(p + 360) % 360] / n[(p + 360) % 360], fq = sum[q % 360] / n[q % 360];
    f[j] = fp + (fq - fp) * (j - p) / (q - p);
  }
  return (ang) => { const x = (wrap(ang) + Math.PI) / TAU * 360 - 0.5, j = Math.floor(x), t = x - j;
    return f[(j + 360) % 360] * (1 - t) + f[(j + 1) % 360] * t; };
}

// A triangle cut SUB x SUB: calls fn(corner barycentrics [b, b, b]) for each piece.
export function subdivide(SUB, fn) {
  const bary = (i, j) => [1 - (i + j) / SUB, i / SUB, j / SUB];
  for (let i = 0; i < SUB; i++) for (let j = 0; i + j < SUB; j++) {
    fn([bary(i, j), bary(i + 1, j), bary(i, j + 1)]);
    if (i + j + 1 < SUB) fn([bary(i + 1, j), bary(i + 1, j + 1), bary(i, j + 1)]);
  }
}
export const lerp = (t, f, b) => { const a = f(t[0]), c = f(t[1]), e = f(t[2]); return Array.isArray(a) ? a.map((_, i) => a[i]*b[0] + c[i]*b[1] + e[i]*b[2]) : a*b[0] + c*b[1] + e*b[2]; };

// Each sleeve's frame and cut, measured on a rider's own mesh (Biketerra's;
// PCM's for its arm length): the axis A from the upper-arm joint J to the
// cuff loop's centroid; phi = angle round it by position, 0 at UpArm (the
// top of the shoulder cap: torso up tilted outboard), + toward FwdArm (the
// front), on both sides; t = distance along it. The cut is the cuff loop as
// t = tc(phi), or with mesh.sleeveLen[s] that loop scaled toward the joint
// to that joint-to-cuff length (SLEEVE in pcm2bt.mjs): beyond(s, p) says a
// point is past it, bare arm. weight(p) is a geometric sleeve weight, which
// avoids the two riders' differing skin weights round the deltoid (PCM
// weights its upper sleeve to the torso bones). C is the torso's centre (the
// hem centroid to the neck's).
export function frames(mesh) {
  const H = centroid(mesh.hem), Nk = centroid(mesh.neck), C = add(H, Nk).map((q) => q / 2);
  const U = norm(sub(Nk, H)), L = perp(mesh.left, U), F = perp(mesh.fwd, U, L);

  const armW = {}, armLens = {}, cuts = {}, polar = {};
  for (const s of ['l', 'r']) {
    const sg = s === 'l' ? 1 : -1;
    const J = mesh.joint[s], cuffC = centroid(mesh.cuff[s]);
    const armVec = sub(cuffC, J), armLen = Math.hypot(...armVec), A = armVec.map((q) => q / armLen);

    // Anchor UpArm to the shoulder-top/trapezius direction (torso U tilted slightly
    // outboard) so phi=0 is always the anatomical top of the shoulder cap and
    // phi=+pi/2 is always the anterior bicep regardless of torso/arm pose angle.
    const UpArm = perp(add(U, L, sg * 0.35), A);
    const FwdArm = norm([
      UpArm[1] * A[2] - UpArm[2] * A[1],
      UpArm[2] * A[0] - UpArm[0] * A[2],
      UpArm[0] * A[1] - UpArm[1] * A[0]
    ]);
    if (dot(FwdArm, F) < 0) for (let i = 0; i < 3; i++) FwdArm[i] = -FwdArm[i];

    const raw = (p) => {
      const q = sub(p, J), t = dot(q, A), r = add(q, A, -t);
      return [Math.atan2(dot(r, FwdArm), dot(r, UpArm)), t];
    };
    const tc1 = profile(mesh.cuff[s], raw), k = mesh.sleeveLen ? mesh.sleeveLen[s] / armLen : 1, tc = (ph) => tc1(ph) * k;
    armLens[s] = armLen; polar[s] = raw;
    cuts[s] = { tc, J, A, UpArm, FwdArm };

    // The sleeve starts inboard of J at the top of the shoulder (by 0.22 *
    // armLen, to take in the deltoid) and outboard at the armpit (0.06).
    const t0 = (ph) => (-0.08 - 0.14 * Math.cos(ph)) * armLen;
    armW[s] = (p) => {
      const q = sub(p, J), t0q = dot(q, A), rVec = add(q, A, -t0q), r = Math.hypot(...rVec);
      if (r > 0.11) return 0;
      const [ph, t] = raw(p);
      // Allow the top of the shoulder (cos(ph) > 0) to reach slightly inboard of J,
      // while keeping the front chest and back strictly masked out.
      // The lateral test only holds near the joint: Biketerra's seated arms
      // reach forward, so the front of the upper arm lies no further out than
      // J, and failing it there made that sleeve torso.
      const lat = sg * dot(q, L) + 0.035 * Math.max(0, Math.cos(ph));
      const sNorm = (t - t0(ph)) / (tc(ph) - t0(ph));
      const wRadial = 1 - smooth(0.075, 0.11, r);
      const wLat = Math.max(smooth(-0.015, 0.015, lat), smooth(0.25, 0.45, sNorm));
      return smooth(-0.02, 0.12, sNorm) * wRadial * wLat;
    };
  }

  return {
    C, U, F, L, armLen: armLens, cut: cuts,
    weight: (p) => ({ l: armW.l(p), r: armW.r(p) }),
    beyond: (s, p) => { const [ph, t] = polar[s](p); return t > cuts[s].tc(ph); }
  };
}

// Boundary segments of a triangle set, keyed by position (UV seams split
// vertices): edges used by one triangle, and edges whose two triangles are
// in different classes. pt(i) -> point, cls(t) -> class of triangle t.
export function edgesOf(tris, pt, cls) {
  const key = (i) => pt(i).map((q) => q.toFixed(4)).join(), E = new Map();
  tris.forEach((t, k) => { for (let e = 0; e < 3; e++) {
    const a = t[e], b = t[(e + 1) % 3], ka = key(a), kb = key(b), id = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    const o = E.get(id); if (o) { o.n++; o.cls.add(cls(k)); } else E.set(id, { a: pt(a), b: pt(b), n: 1, cls: new Set([cls(k)]) });
  } });
  return [...E.values()];
}

// The PCM rider (assets/pcm_cyclist.json from pcm-extract.py). The kit mesh
// is jersey and shorts in one: the jersey is everything above the hem's edge
// loop, kit row 341.5 of 626 (v > HEM_V).
export const HEM_V = 1 - 341.5 / 626;
export function loadPCM(path) {
  const d = JSON.parse(readFileSync(path));
  const P = d.position, UV = d.uv, bone = (n) => d.bones.findIndex((b) => b.name.endsWith(n));
  const at = (n) => { const m = d.bones[bone(n)].toMesh; return [m[0][3], m[1][3], m[2][3]]; };
  const wt = (v, n) => { const b = bone(n); return d.boneIndex[v].reduce((s, i, k) => s + (i === b ? d.boneWeight[v][k] : 0), 0); };
  const ua = P.map((_, v) => ({ l: wt(v, 'L_UpperArm'), r: wt(v, 'R_UpperArm') }));
  const tris = d.submeshes[0].filter((t) => t.reduce((s, v) => s + UV[v][1], 0) / 3 > HEM_V);
  const all = d.submeshes[0], below = (t) => t.reduce((s, v) => s + UV[v][1], 0) / 3 <= HEM_V;
  const edges = edgesOf(all, (i) => P[i], (k) => below(all[k]) ? 'shorts' : 'jersey');
  const hem = [], neck = [], cuff = { l: [], r: [] };
  const lJ = at('L_UpperArm'), rJ = at('R_UpperArm'), neckJ = at('Neck');
  for (const e of edges) {
    if (e.n === 2 && e.cls.size === 2) hem.push([e.a, e.b]);
    else if (e.n === 1 && e.cls.has('jersey')) {
      const m = add(e.a, e.b).map((q) => q / 2), dn = Math.hypot(...sub(m, neckJ)), dl = Math.hypot(...sub(m, lJ)), dr = Math.hypot(...sub(m, rJ));
      if (dn < Math.min(dl, dr)) neck.push([e.a, e.b]); else cuff[dl < dr ? 'l' : 'r'].push([e.a, e.b]);
    }
  }
  // Mesh space is z up with the rider facing -y (the head is forward of the
  // pelvis), torso leaning about 58 degrees, so forward is the chest, facing down.
  const mesh = { hem, neck, cuff, joint: { l: lJ, r: rJ }, left: sub(lJ, rJ), fwd: [0, -1, 0] };
  return { P, UV, ua, tris, mesh, fr: frames(mesh) };
}

// The kit pixels PCM's jersey triangles touch (rasterised at 4x, so edge
// pixels count): sampleKit never blends in the gutters between islands.
export function kitMask(pcm, W, H) {
  const m = new Uint8Array(W * H), Q = 4;
  for (const t of pcm.tris) {
    const uv = t.map((v) => [pcm.UV[v][0] * W * Q, (1 - pcm.UV[v][1]) * H * Q]);
    rasterTriangle(...uv.flat(), W * Q, H * Q, (x, y) => { m[Math.floor(y / Q) * W + Math.floor(x / Q)] = 1; });
    for (const [x, y] of uv) { const i = Math.min(H - 1, Math.floor(y / Q)) * W + Math.min(W - 1, Math.floor(x / Q)); m[i] = 1; }
  }
  return m;
}

// Bilinear sample of an image (readPNG) at UV (v up) -> [r, g, b], over the
// pixels in mask (all if none) only.
export function sampleKit(im, u, v, mask) {
  const W = im.width, H = im.height;
  const x = Math.min(W - 1, Math.max(0, u * W - 0.5)), y = Math.min(H - 1, Math.max(0, (1 - v) * H - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, out = [0, 0, 0];
  let wsum = 0;
  for (const [xx, yy, w] of [[x0, y0, (1-fx)*(1-fy)], [x0+1, y0, fx*(1-fy)], [x0, y0+1, (1-fx)*fy], [x0+1, y0+1, fx*fy]]) {
    const k = Math.min(H - 1, yy) * W + Math.min(W - 1, xx);
    if (mask && !mask[k]) continue;
    for (let c = 0; c < 3; c++) out[c] += im.data[k*4+c] * w;
    wsum += w;
  }
  if (!wsum) return sampleKit(im, u, v);
  return out.map((q) => q / wsum);
}
