---
name: pcm2bt
description: Convert a Pro Cycling Manager kit (<team>_maillot PNG) into a Biketerra jersey atlas with pcm2bt, and check how it looks on the rider. Use when asked to port, convert or import a PCM kit or jersey to Biketerra, or when a converted PCM jersey has lettering split, mirrored or stretched.
---

# PCM kit to Biketerra jersey

Run from `code/tools/pcm2bt`. For jerseys painted from art rather than a PCM
kit, use the `jersey-design` skill.

`node pcm2bt.mjs KIT.png OUT.png` converts a classic-layout PCM kit
(`<team>_maillot`, 455×313 or 910×626) into an atlas, shorts dropped. Run
`./fetch-assets.zsh` and `./fetch-pcm.zsh` once first (PCM's rider from the Wayback
Machine; Cyanide's asset, never committed). The README has the method.

- Render the result, and to judge it, render the kit on PCM's own rider too:
  a kit's shoulder lettering often straddles PCM's sleeve and shoulder, and
  comes out split near the collar on Biketerra just as it sits on PCM.
- Text that reads mirrored means a side has flipped: check the `left` hints
  in `src/pcm.js` and `pcm2bt.mjs`, not the UVs.
- `DEBUG=1` writes both riders' canonical coordinates as colour; converting
  `OUT-pcmcoords.png` should reproduce `OUT-coords.png`. Where it doesn't,
  the correspondence is off there.
- Not checked in-game; uploading on the settings Avatar tab is the test.
