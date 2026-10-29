// The pose the jersey is measured in: rider_m on the low-LOD skeleton, posed
// by one of its clips. POSE=seated (default) is `pedal.seated` at T seconds
// (default 0), the riding pose and the closest to PCM's rider (torso lean 64
// vs 66 deg, arms 91 vs 92 deg from the torso; it barely moves over the
// stroke). stopped is the settings page's static preview (`mount` at t=0,
// lean 28 deg); standing is `pedal.standing`; bind is the GLB's own pose.
import { readFileSync } from 'node:fs';
const R = new URL('../', import.meta.url).pathname; // repo root
const { parseGLB } = await import('./glb.js');
const CLIP = { stopped: 'mount', seated: 'pedal.seated', standing: 'pedal.standing' };
export const POSE = process.env.POSE || 'seated';

export function posed(rig, pose = POSE) {
  if (pose === 'bind') return rig.reset();
  const b = readFileSync(R + 'assets/rider_low_lod.glb');
  const lod = parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  rig.applyClip(lod.animations[CLIP[pose]], Number(process.env.T || 0));
}

// World position of a bone.
export const at = (rig, name) => { const e = rig.bones.get(name).matrixWorld.elements; return [e[12], e[13], e[14]]; };
