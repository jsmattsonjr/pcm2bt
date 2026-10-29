// Pro Cycling Manager kit -> Biketerra jersey: the correspondence between the
// two riders. The UV maps are unrelated and the bodies differ in proportion
// and pose, so each mesh gets the same normalised coordinates per part,
// measured on its own geometry (frames()). Both are then laid on one
// canonical body (canon()), and a Biketerra point takes the PCM kit's UV at
// the closest point of PCM's (pcmMatch()).
//
// Torso: a centre line from the hem loop's centroid to the neck loop's, C its
// midpoint. theta = angle round it, 0 at centre front, + toward the rider's
// left; e = elevation angle seen from C, scaled per theta so the hem is 0 and
// the neckline 1. Elevation, not height, keeps shoulder tops one-to-one.
// Sleeves: where the upper-arm skin weight passes 0.5 on both meshes (their
// UV islands split elsewhere), on the axis from the upper-arm joint to the
// cuff loop's centroid. phi = angle round it, 0 straight out from the body,
// + toward the front, on both sides; s = distance along it, scaled per phi
// from the sleeve's own floor (0) to the cuff (1). The floor is a low
// percentile of the distance over the sleeve's surface at that phi: the 0.5
// contour itself is too ragged on PCM's low-poly mesh to normalise against,
// and without a floor PCM's underarm, weighted to the torso further down
// the arm than Biketerra's, leaves the sleeves' ranges unmatched.
// Every direction is named (left = toward the L bones, forward = a hint),
// never a cross product, so a mirrored mesh can't flip one.
import { readFileSync } from 'node:fs';
import { rasterTriangle } from './view.js';

const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]], dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const add = (a, b, s = 1) => [a[0]+b[0]*s, a[1]+b[1]*s, a[2]+b[2]*s];
const norm = (a) => { const l = Math.hypot(...a); return a.map((q) => q / l); };
const perp = (a, ...bs) => norm(bs.reduce((v, b) => add(v, b, -dot(v, b)), a));
const TAU = 2 * Math.PI, wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

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

// Triangle t of a surface { tris, pos(v), w(v) -> { l, r } upper-arm weights }
// cut SUB x SUB: calls fn(corner barycentrics [b, b, b]) for each piece.
export function subdivide(SUB, fn) {
  const bary = (i, j) => [1 - (i + j) / SUB, i / SUB, j / SUB];
  for (let i = 0; i < SUB; i++) for (let j = 0; i + j < SUB; j++) {
    fn([bary(i, j), bary(i + 1, j), bary(i, j + 1)]);
    if (i + j + 1 < SUB) fn([bary(i + 1, j), bary(i + 1, j + 1), bary(i, j + 1)]);
  }
}
export const lerp = (t, f, b) => { const a = f(t[0]), c = f(t[1]), e = f(t[2]); return Array.isArray(a) ? a.map((_, i) => a[i]*b[0] + c[i]*b[1] + e[i]*b[2]) : a*b[0] + c*b[1] + e*b[2]; };
export const partOf = (w) => w.l > 0.5 ? 'l' : w.r > 0.5 ? 'r' : 't';

// The 10th percentile of t over a side's sleeve surface, area weighted, per
// 10 degrees of phi, smoothed round the circle -> f(phi).
const FLOOR_Q = 0.1;
function floorProfile(surface, side, raw) {
  const bins = Array.from({ length: 36 }, () => []);
  for (const t of surface.tris) subdivide(4, (sb) => {
    const c = [0, 1, 2].map((i) => (sb[0][i] + sb[1][i] + sb[2][i]) / 3);
    if (partOf({ l: lerp(t, (v) => surface.w(v).l, c), r: lerp(t, (v) => surface.w(v).r, c) }) !== side) return;
    const ps = sb.map((b) => lerp(t, surface.pos, b)), a = sub(ps[1], ps[0]), b = sub(ps[2], ps[0]);
    const area = Math.hypot(a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]);
    const [ph, tt] = raw(lerp(t, surface.pos, c)); bins[Math.floor((wrap(ph) + Math.PI) / TAU * 36) % 36].push([tt, area]);
  });
  const q = bins.map((b) => { if (!b.length) return null; b.sort((x, y) => x[0] - y[0]);
    const tot = b.reduce((s, x) => s + x[1], 0); let acc = 0; for (const [tt, w] of b) if ((acc += w) >= FLOOR_Q * tot) return tt; return b.at(-1)[0]; });
  const known = q.map((v, i) => v === null ? -1 : i).filter((i) => i >= 0);
  const f = q.map((v, i) => { if (v !== null) return v; const p = known.findLast((k) => k < i) ?? known.at(-1) - 36, n = known.find((k) => k > i) ?? known[0] + 36;
    return q[(p + 36) % 36] + (q[n % 36] - q[(p + 36) % 36]) * (i - p) / (n - p); });
  const sm = f.map((_, i) => [-2, -1, 0, 1, 2].reduce((s, d) => s + f[(i + d + 36) % 36], 0) / 5);
  return (ang) => { const x = (wrap(ang) + Math.PI) / TAU * 36 - 0.5, j = Math.floor(x), t = x - j; return sm[(j + 36) % 36] * (1 - t) + sm[(j + 1) % 36] * t; };
}

// phi by the way the sleeve faces instead of where it lies: f(phi) -> the
// angle round the arm of the surface's outward normal there (same UpArm /
// FwdArm basis), the mean per 10 degrees of phi over the side's sleeve
// surface (skin weight) between s 0.3 and 0.95, gaps interpolated, smoothed,
// and kept increasing so it stays one-to-one. Biketerra's sleeve sits off
// its joint-to-cuff axis (7.8 cm below it, 4.7 cm above at mid sleeve, where
// PCM's is round at ~5 cm), so by position angle the strip of PCM's front
// panel along the underside spread up the back of Biketerra's sleeve; by
// arc length it still reached its outward-facing slope (16% of that area,
// PCM 0%). Matched by facing, each panel faces the camera as it does on PCM.
function facingProfile(surface, side, raw, basis, sOf) {
  const cs = new Float64Array(36), sn = new Float64Array(36), n = new Float64Array(36);
  for (const t of surface.tris) subdivide(4, (sb) => {
    const c = [0, 1, 2].map((i) => (sb[0][i] + sb[1][i] + sb[2][i]) / 3);
    if (partOf({ l: lerp(t, (v) => surface.w(v).l, c), r: lerp(t, (v) => surface.w(v).r, c) }) !== side) return;
    const p = lerp(t, surface.pos, c), s = sOf(p); if (s < 0.3 || s > 0.95) return;
    const ps = sb.map((b) => lerp(t, surface.pos, b)), a = sub(ps[1], ps[0]), b = sub(ps[2], ps[0]);
    const cr = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]], area = Math.hypot(...cr); if (!area) return;
    const q = sub(p, basis.J), r = add(q, basis.A, -dot(q, basis.A)), o = dot(cr, r) < 0 ? -1 : 1;   // outward, whatever the winding
    const j = Math.floor((wrap(raw(p)[0]) + Math.PI) / TAU * 36) % 36;
    cs[j] += o * dot(cr, basis.UpArm); sn[j] += o * dot(cr, basis.FwdArm); n[j]++;
  });
  // Offset of the facing from each bin's centre, interpolated round the circle where empty.
  const mid = (j) => (j + 0.5) / 36 * TAU - Math.PI, known = [...n.keys()].filter((j) => n[j]);
  const off = (j) => wrap(Math.atan2(sn[j], cs[j]) - mid(j));
  const d = [...n.keys()].map((j) => { if (n[j]) return off(j);
    const p = known.findLast((k) => k < j) ?? known.at(-1) - 36, q = known.find((k) => k > j) ?? known[0] + 36;
    const dp = off((p + 36) % 36), dq = off(q % 36); return dp + wrap(dq - dp) * (j - p) / (q - p); });
  const sm = d.map((_, i) => [-1, 0, 1].reduce((a, k) => a + d[(i + k + 36) % 36], 0) / 3);
  const psi = sm.map((v, j) => mid(j) + v);
  for (let j = 1; j < 36; j++) psi[j] = Math.max(psi[j], psi[j - 1] + 0.01);
  const at = [psi[35] - TAU, ...psi, psi[0] + TAU];   // bin centres -1..36
  return (ang) => { const x = (wrap(ang) + Math.PI) / TAU * 36 - 0.5, j = Math.floor(x), t = x - j;
    return wrap(at[j + 1] + (at[j + 2] - at[j + 1]) * t); };
}

// Geometric sleeve weight & coordinates from the shoulder joint J to cuff:
// avoids the PCM vs Biketerra deltoid skin-weight mismatch where PCM weights
// the upper sleeve ("Sunweb"/"PROJOB") to the torso bones.
export function frames(mesh) {
  const H = centroid(mesh.hem), Nk = centroid(mesh.neck), C = add(H, Nk).map((q) => q / 2);
  const axis = sub(Nk, H), torsoLen = Math.hypot(...axis);
  const U = axis.map((q) => q / torsoLen), L = perp(mesh.left, U), F = perp(mesh.fwd, U, L);

  const arm = {}, armW = {};
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
    const tc = profile(mesh.cuff[s], raw);

    // phi = 0 is top of shoulder (starts inboard of J by 0.22 * armLen to capture full deltoid logo);
    // phi = +-pi is armpit (starts outboard of J by +0.06 * armLen).
    const t0 = (ph) => (-0.08 - 0.14 * Math.cos(ph)) * armLen;
    const sOf = (p) => { const [ph, t] = raw(p), a = t0(ph); return (t - a) / (tc(ph) - a); };
    const facing = facingProfile(mesh.surface, s, raw, { J, A, UpArm, FwdArm }, sOf);
    arm[s] = (p) => [facing(raw(p)[0]), sOf(p)];

    armW[s] = (p) => {
      const q = sub(p, J), t = dot(q, A), rVec = add(q, A, -t), r = Math.hypot(...rVec);
      if (r > 0.11) return 0;
      const [ph] = raw(p);
      // Allow the top of the shoulder (cos(ph) > 0) to reach slightly inboard of J,
      // while keeping the front chest and back strictly masked out.
      // The lateral test only holds near the joint: Biketerra's seated arms
      // reach forward, so the front of the upper arm lies no further out than
      // J, and failing it there made that sleeve torso (and, counted in the
      // torso slices below, pushed the upper chest's theta round to the side).
      const lat = sg * dot(q, L) + 0.035 * Math.max(0, Math.cos(ph));
      const sNorm = (t - t0(ph)) / (tc(ph) - t0(ph));
      const wRadial = 1 - smooth(0.075, 0.11, r);
      const wLat = Math.max(smooth(-0.015, 0.015, lat), smooth(0.25, 0.45, sNorm));
      return smooth(-0.02, 0.12, sNorm) * wRadial * wLat;
    };
  }

  // Measure the torso's actual front/back depth and lateral width in 20 height slices
  const NB = 20, xMinB = new Float64Array(NB).fill(Infinity), xMaxB = new Float64Array(NB).fill(-Infinity), yMaxB = new Float64Array(NB).fill(0);
  for (const t of mesh.surface.tris) subdivide(3, (sb) => {
    const c = [0, 1, 2].map((i) => (sb[0][i] + sb[1][i] + sb[2][i]) / 3);
    const p = lerp(t, mesh.surface.pos, c);
    if (Math.max(armW.l(p), armW.r(p)) > 0.25) return;
    const q = sub(p, H), zNorm = dot(q, U) / torsoLen;
    const b = Math.min(NB - 1, Math.max(0, Math.floor(zNorm * NB)));
    const x = dot(q, F), y = Math.abs(dot(q, L));
    if (x < xMinB[b]) xMinB[b] = x;
    if (x > xMaxB[b]) xMaxB[b] = x;
    if (y > yMaxB[b]) yMaxB[b] = y;
  });

  const fill = (arr, def) => arr.map((v, i) => {
    if (Number.isFinite(v) && v !== 0) return v;
    for (let d = 1; d < NB; d++) {
      if (i - d >= 0 && Number.isFinite(arr[i - d]) && arr[i - d] !== 0) return arr[i - d];
      if (i + d < NB && Number.isFinite(arr[i + d]) && arr[i + d] !== 0) return arr[i + d];
    }
    return def;
  });
  const sm = (arr) => arr.map((_, i) => {
    let s = 0, n = 0;
    for (let d = -2; d <= 2; d++) { const k = Math.min(NB - 1, Math.max(0, i + d)); s += arr[k]; n++; }
    return s / n;
  });
  const xMinS = sm(fill(xMinB, -0.12)), xMaxS = sm(fill(xMaxB, 0.12)), yMaxS = sm(fill(yMaxB, 0.15));
  const interp = (arr, zNorm) => {
    const u = Math.min(NB - 1, Math.max(0, zNorm * NB - 0.5)), i = Math.floor(u), f = u - i;
    return arr[i] * (1 - f) + arr[Math.min(NB - 1, i + 1)] * f;
  };

  const torsoRaw = (p) => {
    const q = sub(p, H), z = dot(q, U), zNorm = z / torsoLen;
    const x0 = 0.5 * (interp(xMinS, zNorm) + interp(xMaxS, zNorm));
    const rx = Math.max(0.05, 0.5 * (interp(xMaxS, zNorm) - interp(xMinS, zNorm)));
    const ry = Math.max(0.06, interp(yMaxS, zNorm));
    const xn = (dot(q, F) - x0) / rx, yn = dot(q, L) / ry;

    // Elliptical angle (equalizes front/back depth vs lateral width at every height)
    const thEll = Math.atan2(yn, xn);
    // Planar front/back angle (prevents upper chest graphic from condensing toward the collar)
    const ynClamped = Math.max(-1, Math.min(1, yn * 0.96));
    const thPlanar = xn >= 0 ? Math.asin(ynClamped) : wrap(Math.PI - Math.asin(ynClamped));
    const wPlanar = 0.55 * smooth(0.25, 0.85, zNorm) * smooth(0.0, 0.35, Math.abs(xn));
    const th = wrap(thEll + wPlanar * wrap(thPlanar - thEll));

    const r = Math.hypot(dot(q, F) - x0, dot(q, L));
    const zc = z - 0.5 * torsoLen;
    return [th, zc - 0.20 * Math.max(0, zc) * (r / torsoLen)];
  };
  const eh = profile(mesh.hem, torsoRaw), en = profile(mesh.neck, torsoRaw);
  const torso = (p) => { const [th, e] = torsoRaw(p), a = eh(th); return [th, (e - a) / (en(th) - a)]; };

  return {
    C, U, F, L, torso,
    sleeve: (s, p) => arm[s](p),
    weight: (p) => ({ l: armW.l(p), r: armW.r(p) }),
    side: (p) => dot(sub(p, C), L) > 0 ? 'l' : 'r'
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
  const surface = { tris, pos: (v) => P[v], w: (v) => ua[v] };
  const mesh = { hem, neck, cuff, surface, joint: { l: lJ, r: rJ }, left: sub(lJ, rJ), fwd: [0, -1, 0] };
  return { P, UV, ua, tris, mesh, fr: frames(mesh) };
}

// The canonical body both riders are mapped onto: the torso coordinates on
// an upright cylinder (forward +x, left +y, up +z), each sleeve's on an arm
// held straight out sideways (a T pose, so the outside of the arm faces up),
// blended by the upper-arm skin weight across the armhole. The same
// coordinates on either rider give the same canonical point, so a Biketerra
// point takes the PCM UV of the closest point on PCM's canonical surface,
// continuous across the armhole however differently the two meshes split
// sleeve from torso there.
const RT = 0.15, HT = 0.45, RA = 0.05, LA = 0.15, SH = 0.85 * HT;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function canon(fr, p, w) {
  const gw = fr.weight ? fr.weight(p) : w;
  const [th, e0] = fr.torso(p), e = Math.min(1, Math.max(0, e0));
  const T = [RT * Math.cos(th), RT * Math.sin(th), HT * e];
  const side = gw.l >= gw.r ? 'l' : 'r', b = smooth(0.25, 0.75, gw[side]);
  if (!b) return T;
  const [ph, s0] = fr.sleeve(side, p), s = Math.min(1, Math.max(0, s0)), sg = side === 'l' ? 1 : -1;
  const A = [RA * Math.sin(ph), sg * (RT + 0.08 + LA * s), SH + RA * Math.cos(ph)];
  return T.map((q, i) => q * (1 - b) + A[i] * b);
}

// Closest point of triangle abc to p -> barycentrics (Ericson, Real-Time
// Collision Detection 5.1.5).
function closest(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [0, 1 - w, w]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [1 - v - w, v, w];
}

// PCM's jersey on the canonical body, cut SUB x SUB, in a 4 cm voxel hash.
// match(X) -> [u, v] of the closest point to canonical point X.
export function pcmMatch(pcm, SUB = 3) {
  const { P, UV, ua, tris, fr } = pcm, V = 0.04, cells = new Map(), pieces = [];
  const key = (i, j, k) => (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);
  for (const t of tris) subdivide(SUB, (sb) => {
    const X = sb.map((b) => canon(fr, lerp(t, (v) => P[v], b), { l: lerp(t, (v) => ua[v].l, b), r: lerp(t, (v) => ua[v].r, b) }));
    const m = [0, 1, 2].map((i) => (X[0][i] + X[1][i] + X[2][i]) / 3), rad = Math.max(...X.map((q) => Math.hypot(...sub(q, m))));
    const id = pieces.push({ X, m, rad, uv: sb.map((b) => lerp(t, (v) => UV[v], b)) }) - 1;
    const lo = [0, 1, 2].map((i) => Math.floor(Math.min(X[0][i], X[1][i], X[2][i]) / V)), hi = [0, 1, 2].map((i) => Math.floor(Math.max(X[0][i], X[1][i], X[2][i]) / V));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
      const c = key(i, j, k); (cells.get(c) || cells.set(c, []).get(c)).push(id); }
  });
  // Shell by shell outward; a piece not yet seen lies wholly outside the
  // cube searched, so a hit nearer than the cube's nearest face is final.
  return (X) => {
    const c = X.map((q) => Math.floor(q / V));
    let best = null, bd = Infinity;
    for (let r = 0; r <= 12; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) < r) continue;
        for (const id of cells.get(key(c[0] + i, c[1] + j, c[2] + k)) || []) {
          const pc = pieces[id]; if (Math.hypot(X[0] - pc.m[0], X[1] - pc.m[1], X[2] - pc.m[2]) - pc.rad >= bd) continue;
          const b = closest(X, ...pc.X), q = lerp([0, 1, 2], (n) => pc.X[n], b), d = Math.hypot(...sub(q, X));
          if (d < bd) { bd = d; best = lerp([0, 1, 2], (n) => pc.uv[n], b); }
        }
      }
      const face = Math.min(...X.map((q, i) => Math.min(q - (c[i] - r) * V, (c[i] + r + 1) * V - q)));
      if (best && bd <= face) return best;
    }
    if (best) return best;
    return [0.5, 0.5];
  };
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
