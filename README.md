# pcm2bt

Converts a Pro Cycling Manager kit into a Biketerra jersey atlas (the 512×512
PNG uploaded on the settings Avatar tab). Split from `../jersey-projector`,
which paints Biketerra jerseys from art; the modules both need are copied here
(see Shared code).

`pcm2bt.mjs` takes a `<team>_maillot` in the classic layout (455×313 up to
PCM12, the same map at 910×626 from PCM13) and drops the shorts:

```zsh
./fetch-assets.zsh                    # once: Biketerra's rider models
./fetch-pcm.zsh                       # once: the PCM rider
node pcm2bt.mjs KIT.png OUT.png       # about 15 s
./render.zsh OUT.png                  # contact sheet of the rider wearing it
```

`SLEEVE=pcm` shortens Biketerra's sleeves (0.20 m from shoulder joint to cuff)
to PCM's (~0.14 m), or `SLEEVE=0.16` to a length in metres, so sleeve art keeps
PCM's proportions. Below the new cuff the atlas is transparent: the site fills
the texture with the rider's skin colour before drawing the jersey, so that
shows as bare arm, in whatever skin tone the rider has set.

Kits for UE5 / modern PCM use another map and are out of scope.

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
| `src/pcm.js` | The PCM rider and its correspondence with Biketerra's. |
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

## The PCM rider

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

## Correspondence

`src/pcm.js`. The two UV maps are unrelated, so each rider gets the same
normalised coordinates, measured on its own mesh: θ round the torso centre
line (hem centroid to neck centroid) and elevation angle e from its midpoint,
scaled per θ hem 0 to neckline 1; per sleeve, φ round the joint-to-cuff axis
(0 out from the body, + forward) and s along it, scaled per φ from the
sleeve's floor to the cuff. Sleeve and torso are split the same way on both,
where the upper-arm skin weight passes 0.5, since the UV islands split them in
different places. φ is measured by the way the surface faces round the arm,
not by position angle, since Biketerra's sleeve sits off its axis (baggy
underneath) where PCM's is round. `TWIST` (degrees, default 40) then turns
the sleeve content round the arm: PCM's front panel covers the inner half of
the sleeve, which PCM's game hides with the arms against the body but
Biketerra's riding pose shows from behind; `TWIST=0` keeps PCM's placement.
Both riders are then laid on one canonical body, the torso
on a cylinder and the arms held out sideways, blended by that weight across
the armhole, and each Biketerra subsample takes the UV of the closest point on
PCM's (a voxel hash of the PCM triangles cut 3×3). The kit is sampled
bilinearly over the pixels PCM's triangles touch only, so the gutters between
islands never bleed in. `DEBUG=1` also writes the canonical position as colour
for both riders (`OUT-coords.png`; `OUT-pcmcoords.png` in kit space);
converting the second should reproduce the first.

To see where the mapping puts things, convert the test kit and look at it
on both riders from the same side:

```zsh
source python.zsh && $py debug/testkit.py /tmp/tk.png
node pcm2bt.mjs /tmp/tk.png /tmp/tk-bt.png
./render.zsh /tmp/tk-bt.png /tmp/tk-bt-render.png -1.3,1.75,0,0.357,1.2,0   # from behind, seated
node debug/pcmrender.mjs /tmp/tk-pcm.png -1 0 0.3 /tmp/tk.png                # PCM, from behind
```

PCM's own pose is not Biketerra's (or its game's), so compare where each
panel and grid line lands on the body, not the silhouettes.

Earlier tries, for the record: per-part lookup grids with the UV islands as
Biketerra's sleeve split left torso-coloured patches on the underarms; with
the 0.5 contour as the armhole, PCM's contour was too ragged (t swinging
−9 to +6 cm in 20° of φ); and grids with a fallback between parts made
comb-edged shards along the armhole, where PCM's (φ, s) folds.
