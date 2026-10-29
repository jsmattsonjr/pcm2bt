---
name: pcm2bt
description: Convert a Pro Cycling Manager kit (<team>_maillot PNG) into a Biketerra jersey atlas with pcm2bt, and check how it looks on the rider. Use when asked to port, convert or import a PCM kit or jersey to Biketerra, or when a converted PCM jersey has lettering split, mirrored or stretched.
---

# PCM kit to Biketerra jersey

Run from `code/tools/pcm2bt`. For jerseys painted from art rather than a PCM
kit, use the `jersey-design` skill.

`node pcm2bt.mjs KIT.png OUT.png` converts a classic-layout PCM kit
(`<team>_maillot`, 455×313 or 910×626) into an atlas, shorts dropped. Run
`./fetch-assets.zsh`, `./fetch-pcm.zsh` and `./fetch-pcmmod.zsh` once first (PCM's
rider from the Wayback Machine and from pcmmod.com's jersey viewer, never
committed). The README has the method. To judge a result, compare it with
the kit in pcmmod.com's viewer, which pcm2bt now follows.

- Render the result, and to judge it, render the kit on PCM's own rider too:
  a kit's shoulder lettering often straddles PCM's sleeve and shoulder, and
  comes out split near the collar on Biketerra just as it sits on PCM.
- Text that reads mirrored means a side has flipped: check the `left` hints
  in `src/pcm.js` and `pcm2bt.mjs`, not the UVs.
- `DEBUG=1` writes `OUT-hits.png` (green where Biketerra's surface found
  PCM's by ray, magenta where it fell back to the nearest point) and
  `OUT-reposed.json`, PCM's mesh reposed onto Biketerra's rider, which
  `node debug/pcmrender.mjs X.png FWD LEFT UP KIT OUT-reposed.json` renders.
  Magenta on the jersey (not the bare arm past the cut) marks where the
  mapping is guessing.
- Sleeves are cut to PCM's length by default; `SLEEVE=full` keeps
  Biketerra's, `SLEEVE=0.16` a length in metres.
- Not checked in-game; uploading on the settings Avatar tab is the test.
