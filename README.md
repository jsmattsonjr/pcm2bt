# pcm2bt

Converts a Pro Cycling Manager kit into a Biketerra jersey atlas (the 512×512
PNG uploaded on the settings Avatar tab). Split from `../jersey-projector`,
which paints Biketerra jerseys from art; the modules both need are copied here
(see Shared code).

`pcm2bt.mjs` takes a `<team>_maillot` in the classic layout (455×313 up to
PCM12, the same map at 910×626 from PCM13) and drops the shorts:

```zsh
./fetch-assets.zsh                    # once: Biketerra's rider models
./fetch-pcm.zsh                       # once: PCM.daily's PCM rider (bones, kit map)
./fetch-pcmmod.zsh                    # once: pcmmod.com's PCM rider (the surface)
node pcm2bt.mjs KIT.png OUT.png       # about 10 s
./render.zsh OUT.png                  # contact sheet of the rider wearing it
```

By default Biketerra's sleeves (0.20 m from shoulder joint to cuff) are cut to
PCM's length (~0.14 m), so sleeve art keeps PCM's proportions; `SLEEVE=0.16`
cuts them to a length in metres instead, and `SLEEVE=full` keeps Biketerra's
own: nothing is cut, and PCM's sleeve is stretched along the arm to reach
Biketerra's cuff, so sleeve art comes out about half as long again (the cuff
band still runs along the real hem). Below a cut the atlas is transparent:
the site fills the texture with the rider's skin colour before drawing the
jersey, so that shows as bare arm, in whatever skin tone the rider has set.

Kits for UE5 / modern PCM use another map and are out of scope.

## Environment variables

All optional; the defaults are what the converter is tuned for.

| Variable | Default | Read by | What |
|---|---|---|---|
| `SLEEVE` | `pcm` | `pcm2bt.mjs` | Sleeve length: `pcm` (PCM's, ~0.14 m), `full` (Biketerra's, 0.20 m, PCM's stretched), or metres. Above. |
| `PCM_MESH` | `pcmmod` | `pcm2bt.mjs`, `pcmrender` | PCM rider projected from: `pcmmod` (pcmmod.com's) or `jview` (PCM.daily's). See The PCM riders. |
| `PCM_CLIP` | `bind` | `pcm2bt.mjs`, `pcmrender` | With `PCM_MESH=jview`: pose PCM.daily's rider with its viewer clip `loop` or `idle` first. |
| `PCM_T` | `0` | `pcm2bt.mjs`, `pcmrender` | Seconds into `PCM_CLIP`. |
| `TWIST` | `0` | `pcm2bt.mjs` | Degrees to turn the sleeve content round the arm, top toward the back, tapering in from the shoulder. |
| `TMAX` | `0.08` | `pcm2bt.mjs` | How far (m) the projection casts each way along the normal. |
| `LAMBDA` | `0.08` | `pcm2bt.mjs` | Cost (m) per unit of upper-arm skin-weight mismatch when scoring hits. |
| `MISS` | `1` | `pcm2bt.mjs` | Weight mismatch past which a hit is rejected in favour of the nearest point. |
| `DEBUG` | unset | `pcm2bt.mjs` | `1` also writes `OUT-reposed.json` and `OUT-hits.png`. See Correspondence. |
| `POSE` | `seated` | `pcm2bt.mjs`, `render.zsh` | Biketerra pose to paint in and render: `seated`, `standing`, `stopped` or `bind` (`src/pose.js`). |
| `T` | `0` | `pcm2bt.mjs`, `render.zsh` | Seconds into the pedalling clip for `seated` and `standing`. |
| `SIZE` | `700` | `render.zsh` | Pixel size of each contact-sheet tile. |
| `BASIC` | unset | `render.zsh` | `1` renders unlit, so colours read as the atlas holds them. |
| `CHROME` | macOS app | `render.zsh` | Chrome binary for the headless render. |
| `PYTHON` | `.venv`, else `python3` | the zsh scripts | Python with Pillow (and numpy, UnityPy for `fetch-pcm.zsh`). See Requirements. |

## Requirements

- **node** 20 or later (no npm packages; three.js is in `vendor/`).
- **Google Chrome**, for `render.zsh` (headless). It defaults to the macOS app
  path; set `CHROME` to the binary elsewhere.
- **Python 3 with `requirements.txt`** (Pillow, numpy, UnityPy), for
  `pcm-extract.py` and the contact sheet. The zsh scripts use `$PYTHON`, else
  `.venv/bin/python` in the repo root (a venv, or a symlink to one; ignored by
  git), else `python3`.
- **curl** and **shasum**, for the fetch scripts.

## Layout

| Path | What |
|---|---|
| `pcm2bt.mjs` | The converter. |
| `src/project.js` | The correspondence: PCM's jersey reposed onto Biketerra's rider and projected. |
| `src/pcm.js` | PCM.daily's PCM rider, each rider's sleeve frame and cut, kit sampling. |
| `src/pcmmod.js` | pcmmod.com's PCM rider, given PCM.daily's bones; `loadRider()` picks one. |
| `src/paint.js` | `paint()`: supersampling, slivers and bleed, in the seated pose. |
| `src/pose.js`, `posmap.js`, `torsomap.js`, `decal.js` | The pose, and the 3D position of every sleeve and torso texel. |
| `src/glb.js`, `rig.js`, `view.js`, `template.js`, `image.js`, `png.js` | GLB parser, skinned rig, rasteriser, template mask, island fill, PNG I/O. |
| `src/preview.js`, `render.html`, `render.zsh` | The WebGL rider and its headless contact sheet. |
| `debug/testkit.py` | A synthetic kit: front panel orange, back blue, checkered, gridded every 50 px. |
| `debug/pcmrender.mjs` | The PCM rider wearing a kit (software render), to set beside `render.zsh`'s. |
| `assets/` | `jersey-mask.png`, the rider models and the PCM rider. Only the mask is in git. |
| `skill/SKILL.md` | The `pcm2bt` Claude Code skill. Link it as `.claude/skills/pcm2bt/SKILL.md`. |

## Shared code

`src/{glb,rig,view,template,image,png,preview}.js`, `vendor/`, `render.*`,
`fetch-assets.zsh`, `python.zsh` and `assets/jersey-mask.png` are copies of
files in `../jersey-projector`. `src/{pose,posmap,torsomap,decal}.js` come from
its `oneoff/chrono/` and `src/paint.js` from `oneoff/rsc/paint.mjs`, with
their imports flattened. They are not linked, so a fix to one side has to be
carried to the other by hand. One deliberate difference: here `pose.js` and
`render.zsh` default to the seated pose, not stopped.

## Models

Biketerra's rider models are the site's own, so the repo does not carry them.
`fetch-assets.zsh` downloads them from
`https://biketerra.com/_app/immutable/assets/` (referenced from bundle chunk
`chunks/DqME4VGv.js` on 2026-10-24) and checks each against the SHA-256 it had
when the tools were measured on it:

- `assets/rider_m.glb` is `rider_m.rb1Dgf6L.glb`, the mesh and UVs.
- `assets/rider_low_lod.glb` is `rider_low_lod.Ct7jtfaL.glb`. The settings
  page rebinds `rider_m` to its skeleton and poses it with its clips: stopped
  is `mount` at t=0, seated is `pedal.seated`. pcm2bt paints in seated
  (`POSE` overrides it; see `src/pose.js`), the riding pose and the one
  closest to PCM's.

If the site ships a new hash, re-check the UVs against the template, then
update the names and hashes in `fetch-assets.zsh`. To find the current names,
fetch `https://biketerra.com/`, follow the `_app/immutable/` imports, and grep
for `rider_[a-z_]*\.[A-Za-z0-9_-]+\.glb`.

## The PCM riders

pcm2bt projects from **pcmmod.com's** rider by default (`PCM_MESH=pcmmod`),
the one its web jersey viewer shows (https://pcmmod.com/jersey/viewer/viewer):
the way a kit is meant to look. `fetch-pcmmod.zsh` downloads its glTF scene
(`pages/jersey/viewer/ressources/scene.gltf` and `scene.bin`, public, fetched
2026-10-29) into `assets/pcmmod/` and checks their SHA-256s. It is one static
mesh, the whole rider (body, head, kit, shoes, bottle) standing with arms
forward and down; y up, facing +z, unmirrored; no skeleton. Its UVs index the
viewer's 2048² composite, into which the viewer draws the kit at
x 832, y 1206, 1200×826 (`jersey_viewer_viewer.bundle.js`,
`elementsPosition`); `src/pcmmod.js` maps them back to the kit and keeps the
triangles there that PCM.daily's rider also covers. Rendered with the test
kit (`debug/pcmrender.mjs`), it matches the viewer's own renders of it.

With no skeleton of its own, it borrows PCM.daily's (below): the riders share
the classic map, so each kit vertex takes the bone weights and bind position
of the PCM.daily point with the same kit UV, and each bone is placed by a
weighted rigid fit of those bind points (mirrored, at the global
similarity's scale, 0.95) onto pcmmod's. The fits leave 2–4.5 cm RMS, the
two bodies' different shapes; the bones only carry the repose, which lands on
Biketerra's landmarks either way. Its boundaries are found as loops: the
open jersey edges chained, each loop the neck, a cuff or the hem by the bone
nearest its centroid. pcmmod's sleeve sits rolled round the arm as the kit
was drawn for ("Sunweb" down the outer arm of the default kit, the cuff text
on the outside), where PCM.daily's puts that lettering on top of the
shoulder, so Biketerra's sleeve now follows the viewer's.

`PCM_MESH=jview` projects from **PCM.daily's** rider instead, as before.
It is Cyanide's, so the repo does not carry it either. `fetch-pcm.zsh`
downloads PCM.daily's old Unity shirt viewer
(`shirtdb/viewer/Jview_v16.unity3d`, Unity 2.5) from the Wayback Machine
(snapshot 20120505101225), checks its SHA-256, and runs `pcm-extract.py`
(UnityPy; it has no Texture2D class for Unity 2.5, so the DXT textures are
decoded by hand). That writes `assets/pcm_cyclist.json`, the
`cyclist_jersey` skinned mesh (610 vertices, 870 triangles from a strip, 12
biped bones, z up, facing −y, torso leaning ~58°), and
`assets/pcm_default.png`, the 455×313 kit it shipped with. The mesh is
jersey and shorts in one surface, front and back as two UV islands; the hem
is the edge loop at kit row 341.5 of 626. The mesh's x is mirrored (the L
bones are at −x), so every direction is taken from bone names, never a cross
product: the LKHC kit's lettering reads correctly on Biketerra's rider.

The bundle also holds the viewer's two animation clips, `idle` (standing)
and `loop` (riding, one pedal stroke in 0.67 s), which `pcm-extract.py`
exports into the JSON (`clips`). `PCM_CLIP=loop|idle` poses PCM.daily's rider (`PCM_MESH=jview`) with
one, at `PCM_T` seconds, before the repose, in `pcm2bt.mjs` and
`debug/pcmrender.mjs` alike; the default, `bind`, is the mesh as stored. At
every bone the jersey is skinned to, either clip is within a few degrees
of the bind pose (upper arms 4–7°, torso 1–15°), so it barely changes the
result. The viewer is Unity, left-handed: there the L bones are the
rider's left, unmirrored, and its camera faces the rider, so the rider's
left sleeve shows on the right of the screen.

## Correspondence

`src/project.js`. The two UV maps are unrelated, so PCM's jersey is reposed
onto Biketerra's seated rider, and each Biketerra subsample takes the kit UV
where a line along its normal meets PCM's surface.

The work is in PCM's mesh space, so the reposed mesh renders with
`debug/pcmrender.mjs`. Biketerra's rider is carried there by matching torso
frames (hem centroid, hem-to-neck axis, named left and forward; unscaled). In
those frames the two poses nearly agree already (torso lean 64° vs 66°, both
arms reaching forward); what differs is where the landmarks sit. So PCM's
jersey is reposed with its own skeleton (linear blend skinning by its skin
weights), bone by bone:

- **Torso** (pelvis, spines, neck, head, thighs): heights along the axis are
  warped per angle round it, so PCM's hem loop lands on Biketerra's and PCM's
  collar base on Biketerra's neckline. PCM has a tall stand-up collar (the
  navy dome atop the default kit's back panel); matched by its top edge, it
  folded down onto Biketerra's upper back. The base is found from the
  geometry: walking down each meridian from the neck loop, it is where the
  innermost surface first lies 1 cm outside the narrowest radius above it.
  The collar above it is left out.
- **Clavicles**: then turned and stretched about their root so PCM's shoulder
  joints land on Biketerra's (3.4 cm further back, 2.4 cm further out).
- **Upper arms** (PCM has no forearm bones): then turned and stretched about
  the joint so the cuff lands on Biketerra's cut (`SLEEVE`), and stretched
  along the arm per angle round it so PCM's cuff loop lands on the cut all
  round. PCM's cuff is tilted ~2 cm where the cut is nearly square, and with
  only the centroids matched its cuff band climbed toward the inner arm.
  `TWIST` (degrees, default 0) turns the sleeve content round the arm, top
  toward the back, tapering in from the shoulder.

The projection casts both ways along the normal, up to 8 cm (`TMAX`), and
scores each hit by its distance plus 8 cm (`LAMBDA`) per unit of difference
in upper-arm skin weight, so a torso point doesn't take the sleeve's sheet
in the armpit, yet the armhole stays continuous. With no hit, or none within
a mismatch of 1 (`MISS`), it takes the nearest point by the same score. At
0.5 the armhole's front and back creases fell back, because PCM weights its
upper sleeve to the torso further down the arm than Biketerra does, and took
off-panel colour. The kit is sampled bilinearly over the pixels PCM's
triangles touch only, so the gutters between islands never bleed in. Each
run prints its fit: hits by ray and by nearest point, distance percentiles,
the collar's depth, the cuff stretch and how far the cuff is off the cut.
`DEBUG=1` also writes `OUT-reposed.json` (the reposed PCM mesh, for
`debug/pcmrender.mjs ... MESH`) and `OUT-hits.png` (green where a ray hit,
darker the further; magenta where it fell back).

To see where the mapping puts things, convert the test kit and look at it
on both riders from the same side:

```zsh
source python.zsh && $py debug/testkit.py /tmp/tk.png
node pcm2bt.mjs /tmp/tk.png /tmp/tk-bt.png
./render.zsh /tmp/tk-bt.png /tmp/tk-bt-render.png -0.9,1.75,0,0.3,1.3,0   # from behind, seated
node debug/pcmrender.mjs /tmp/tk-pcm.png -1 0 0.9 /tmp/tk.png              # PCM, from behind
```

PCM's own pose is not Biketerra's (or its game's), so compare where each
panel and grid line lands on the body, not the silhouettes. Other useful
views: `1.5,1.15,0.7,0.35,1.3,0.12` (front-right shoulder) against
`pcmrender ... 1 -0.7 -0.5`, and `front-close`.

Earlier tries, for the record. Before projection, each rider was mapped onto
a hand-made canonical body by normalised coordinates measured on its own
mesh: the torso by angle round the hem-to-neck axis and elevation from its
midpoint, on a cylinder; each sleeve by angle round the joint-to-cuff axis
and distance along it, on an arm held out sideways; blended by upper-arm
weight across the armhole, matched by closest point. It lost the shoulder's
shape: the joints sit at ±53° round the axis on PCM but ±71° on Biketerra,
Biketerra's forward-reaching arms crushed the shoulder cap into a sliver of
the arm coordinate, and the yoke was crushed onto the cylinder's rim, so
PCM's shoulder "Sunweb", which follows the seam up to the neck, ran
straight down the arm. A joint-angle warp, a yoke term and a bent sleeve
axis didn't fix it. Within that scheme: per-part lookup grids with the UV
islands as Biketerra's sleeve split left torso-coloured patches on the
underarms; with the 0.5 weight contour as the armhole, PCM's contour was
too ragged (t swinging −9 to +6 cm in 20° of φ); grids with a fallback
between parts made comb-edged shards along the armhole; and a 40° sleeve
twist, to hide PCM's front panel on the inner sleeve, is no better than
none under projection.

## License

MIT; see `LICENSE`. `vendor/` holds three.js, under its own MIT licence
(Copyright 2010-2023 Three.js Authors). The rider models the fetch scripts
download belong to their owners (Biketerra, Cyanide via PCM.daily, pcmmod.com)
and are not covered.
