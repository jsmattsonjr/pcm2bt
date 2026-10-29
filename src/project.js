// Pro Cycling Manager kit -> Biketerra jersey by repose and project (MAP=project
// in pcm2bt.mjs), the alternative to pcm.js's canonical body. PCM's jersey is
// reposed with its own skeleton onto Biketerra's landmarks, and each Biketerra
// point takes the kit UV where a ray along its normal meets PCM's surface.
//
// The work is done in PCM's mesh space (z up, facing -y, x mirrored), so the
// reposed mesh renders with debug/pcmrender.mjs. G carries Biketerra's
// seated pose there: its torso frame (hem centroid, hem-to-neck axis U, left L,
// forward F) onto PCM's, axis by axis, unscaled. Directions are named on both
// sides (left = toward the L bones), so G is a reflection, as the meshes are.
//
// Repose, per bone, blended by PCM's skin weights (linear blend skinning):
// - torso bones (pelvis, spines, neck, head, thighs): heights along U warped
//   per angle round the axis so PCM's hem loop lands on Biketerra's and its
//   neck loop on Biketerra's, linearly between;
// - clavicles: then turned and stretched about the clavicle's root so the
//   shoulder joint lands on Biketerra's;
// - upper arms (PCM has no forearm bones; the sleeve is all upper arm): then
//   turned and stretched about the joint so the cuff centroid lands on
//   Biketerra's (bt.sleeveLen shortens it, as pcm.js does), and twisted
//   TWIST round the arm, nothing at the joint to all of it at the cuff.
//
// Projection: from a Biketerra point both ways along its normal up to TMAX,
// scoring each hit |t| + LAMBDA x the mismatch of upper-arm skin weights
// (|dl| + |dr|), so a torso point won't take the sleeve's sheet in the armpit
// but the armhole stays continuous. With no hit, or none within 0.5 of
// mismatch, the nearest point by the same score.
import { lerp } from './pcm.js';

const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]], dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const add = (a, b, s = 1) => [a[0]+b[0]*s, a[1]+b[1]*s, a[2]+b[2]*s];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((q) => q / l); };
const perp = (a, ...bs) => norm(bs.reduce((v, b) => add(v, b, -dot(v, b)), a));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TAU = 2 * Math.PI, wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
export const TMAX = Number(process.env.TMAX ?? 0.08), LAMBDA = Number(process.env.LAMBDA ?? 0.08);

function centroid(segs) {
  let w = 0, c = [0, 0, 0];
  for (const [a, b] of segs) { const l = Math.hypot(...sub(b, a)); c = add(c, add(a, b), l / 2); w += l; }
  return c.map((q) => q / w);
}

// Torso frame of a mesh in the shape pcm.js's frames() takes.
function frameOf(mesh) {
  const H = centroid(mesh.hem), Nk = centroid(mesh.neck), U = norm(sub(Nk, H));
  const L = perp(mesh.left, U), F = perp(mesh.fwd, U, L);
  return { H, U, L, F, len: Math.hypot(...sub(Nk, H)) };
}

// A loop's height along fr.U as a function of the angle round it (72 bins,
// sampled every 2 mm, gaps interpolated round the circle). map carries the
// loop's points into fr's space first.
function loopHeight(segs, fr, map = (p) => p) {
  const B = 72, sum = new Float64Array(B), n = new Float64Array(B);
  for (const [a0, b0] of segs) {
    const a = map(a0), b = map(b0), k = Math.max(1, Math.ceil(Math.hypot(...sub(b, a)) / 0.002));
    for (let i = 0; i <= k; i++) {
      const q = sub(add(a, sub(b, a), i / k), fr.H), j = Math.floor((wrap(Math.atan2(dot(q, fr.L), dot(q, fr.F))) + Math.PI) / TAU * B) % B;
      sum[j] += dot(q, fr.U); n[j]++;
    }
  }
  const known = [...n.keys()].filter((j) => n[j]), f = new Float64Array(B);
  for (let j = 0; j < B; j++) {
    if (n[j]) { f[j] = sum[j] / n[j]; continue; }
    const p = known.findLast((q) => q < j) ?? known.at(-1) - B, q = known.find((q) => q > j) ?? known[0] + B;
    const fp = sum[(p + B) % B] / n[(p + B) % B], fq = sum[q % B] / n[q % B];
    f[j] = fp + (fq - fp) * (j - p) / (q - p);
  }
  return (th) => { const x = (wrap(th) + Math.PI) / TAU * B - 0.5, j = Math.floor(x), t = x - j;
    return f[(j + B) % B] * (1 - t) + f[(j + 1) % B] * t; };
}

// Rotation by angle a about unit axis k (Rodrigues), and the shortest one
// taking unit a to unit b.
function rotAxis(k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return (v) => add(add(v.map((q) => q * c), cross(k, v), s), k, dot(k, v) * (1 - c));
}
function rotTo(a, b) {
  const k = cross(a, b), s = Math.hypot(...k);
  return s < 1e-9 ? (v) => v : rotAxis(k.map((q) => q / s), Math.atan2(s, dot(a, b)));
}
// Turn and stretch about origin o so that point from lands on point to: the
// component along (from - o) scales by |to - o| / |from - o|, then the whole
// rotates onto (to - o).
function swing(o, from, to) {
  const a = sub(from, o), b = sub(to, o), la = Math.hypot(...a), ah = a.map((q) => q / la), k = Math.hypot(...b) / la;
  const R = rotTo(ah, norm(b));
  return (p) => { let y = sub(p, o); y = add(y, ah, (k - 1) * dot(y, ah)); return add(o, R(y)); };
}

// pcm: loadPCM(); skin: the parsed pcm_cyclist.json (bones, boneIndex,
// boneWeight); bt: the Biketerra mesh as pcm2bt.mjs builds it for frames()
// (hem, neck, cuff, joint, left, fwd, optional sleeveLen). -> { P (reposed
// positions), G, Gn (Biketerra point / direction -> PCM space), target }.
export function repose(pcm, skin, bt, twist = 0) {
  const fp = frameOf(pcm.mesh), fb = frameOf(bt);
  const Gn = (v) => add(add(fp.F.map((q) => q * dot(v, fb.F)), fp.L, dot(v, fb.L)), fp.U, dot(v, fb.U));
  const G = (p) => add(fp.H, Gn(sub(p, fb.H)));

  // Torso: height warp between the loops, per angle round the axis.
  const hp = loopHeight(pcm.mesh.hem, fp), np = loopHeight(pcm.mesh.neck, fp);
  const hb = loopHeight(bt.hem, fp, G), nb = loopHeight(bt.neck, fp, G);
  const torso = (p) => {
    const q = sub(p, fp.H), z = dot(q, fp.U), th = Math.atan2(dot(q, fp.L), dot(q, fp.F));
    const h0 = hp(th), n0 = np(th), z1 = hb(th) + (z - h0) * (nb(th) - hb(th)) / (n0 - h0);
    return add(p, fp.U, z1 - z);
  };

  const d = skin.bones.map((b) => ({ name: b.name, at: [b.toMesh[0][3], b.toMesh[1][3], b.toMesh[2][3]] }));
  const bone = (n) => d.find((b) => b.name.endsWith(n));
  const fn = d.map(() => torso), target = { joint: {}, cuff: {} };
  for (const s of ['l', 'r']) {
    const S = s.toUpperCase(), Jp = pcm.mesh.joint[s], Cp = centroid(pcm.mesh.cuff[s]);
    const Jb = bt.joint[s], Cb = centroid(bt.cuff[s]), Ab = norm(sub(Cb, Jb));
    const len = bt.sleeveLen ? bt.sleeveLen[s] : Math.hypot(...sub(Cb, Jb));
    const Jt = G(Jb), Ct = add(Jt, Gn(Ab), len), A = norm(sub(Ct, Jt));
    target.joint[s] = Jt; target.cuff[s] = Ct;
    const o = torso(bone(`${S}_Clavicle`).at), clav = swing(o, torso(Jp), Jt), clavF = (p) => clav(torso(p));
    const arm = swing(Jt, clavF(Cp), Ct);
    // Twist sense: positive turns the sleeve's top toward its back, as pcm.js's
    // TWIST (content from phi + TWIST, phi + toward the front). Up/forward
    // round the arm are named directions here, so the cross product is safe.
    const up = perp(fp.U, A), fw = perp(fp.F, A), k = norm(cross(up, fw));
    const armF = (p) => { const y = arm(clavF(p)), t = dot(sub(y, Jt), A) / len;
      return twist ? add(Jt, rotAxis(k, -twist * smooth(0, 1, t))(sub(y, Jt))) : y; };
    fn[d.indexOf(bone(`${S}_Clavicle`))] = clavF;
    fn[d.indexOf(bone(`${S}_UpperArm`))] = armF;
  }
  const P = pcm.P.map((p, v) => {
    let out = [0, 0, 0], ws = 0;
    skin.boneIndex[v].forEach((b, k) => { const w = skin.boneWeight[v][k]; if (w) { out = add(out, fn[b](p), w); ws += w; } });
    return out.map((q) => q / ws);
  });
  return { P, G, Gn, target, frame: fp };
}

// Ray against triangle (Moller-Trumbore, two-sided) -> [t, b1, b2] or null.
function rayTri(o, dir, a, b, c) {
  const e1 = sub(b, a), e2 = sub(c, a), pv = cross(dir, e2), det = dot(e1, pv);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det, tv = sub(o, a), u = dot(tv, pv) * inv; if (u < 0 || u > 1) return null;
  const qv = cross(tv, e1), v = dot(dir, qv) * inv; if (v < 0 || u + v > 1) return null;
  return [dot(e2, qv) * inv, u, v];
}

// Closest point of triangle abc to p -> barycentrics (Ericson 5.1.5; as pcm.js).
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

// -> look(p, n, w) -> [u, v] of the kit for Biketerra point p, unit normal n
// and upper-arm weights w { l, r }; look.stats counts how each was found.
export function projector(pcm, skin, bt, twist = 0) {
  const rp = repose(pcm, skin, bt, twist), { P, G, Gn } = rp, tris = pcm.tris, ua = pcm.ua, UV = pcm.UV;
  // Uniform grid, 2 cm cells; each triangle in every cell its box (grown by
  // half a cell) touches, so sampling a ray every half cell finds it.
  const V = 0.02, cells = new Map(), key = (i, j, k) => (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);
  tris.forEach((t, id) => {
    const lo = [0, 1, 2].map((i) => Math.floor((Math.min(...t.map((v) => P[v][i])) - V / 2) / V));
    const hi = [0, 1, 2].map((i) => Math.floor((Math.max(...t.map((v) => P[v][i])) + V / 2) / V));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
      const c = key(i, j, k); (cells.get(c) || cells.set(c, []).get(c)).push(id); }
  });
  const seen = new Int32Array(tris.length).fill(-1), stats = { ray: 0, near: 0, t: [] };
  let ray = 0;
  const mism = (t, b, w) => Math.abs(lerp(t, (v) => ua[v].l, b) - w.l) + Math.abs(lerp(t, (v) => ua[v].r, b) - w.r);
  const look = (p0, n0, w) => {
    const p = G(p0), n = norm(Gn(n0)); ray++;
    let best = null, bs = Infinity, bm = 0;
    for (let s = -TMAX; s <= TMAX + 1e-9; s += V / 2) {
      const q = add(p, n, s), cell = cells.get(key(...q.map((x) => Math.floor(x / V))));
      if (cell) for (const id of cell) {
        if (seen[id] === ray) continue; seen[id] = ray;
        const t = tris[id], h = rayTri(p, n, P[t[0]], P[t[1]], P[t[2]]);
        if (!h || Math.abs(h[0]) > TMAX) continue;
        const b = [1 - h[1] - h[2], h[1], h[2]], m = mism(t, b, w), sc = Math.abs(h[0]) + LAMBDA * m;
        if (sc < bs) { bs = sc; bm = m; best = [t, b, Math.abs(h[0])]; }
      }
    }
    if (!best || bm > 0.5) {
      bs = Infinity;
      for (const t of tris) {
        const b = closest(p, P[t[0]], P[t[1]], P[t[2]]), dd = Math.hypot(...sub(lerp(t, (v) => P[v], b), p));
        if (dd >= bs) continue;
        const sc = dd + LAMBDA * mism(t, b, w); if (sc < bs) { bs = sc; best = [t, b, dd]; }
      }
      stats.near++;
    } else stats.ray++;
    if (stats.t.length < 200000) stats.t.push(best[2]);
    return lerp(best[0], (v) => UV[v], best[1]);
  };
  look.stats = stats; look.repose = rp;
  return look;
}
