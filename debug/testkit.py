"""A synthetic classic-layout PCM kit for checking the correspondence: the
front panel (left half of the map) orange, the back panel blue, each a
10 px checker in two shades with a white line every 50 px, and a red band
along the front panel's top edge.

    $py debug/testkit.py OUT.png [SCALE]

SCALE 1 is the 455x313 map (2: PCM13's 910x626). Convert it with pcm2bt.mjs
and render it on both riders (render.zsh, debug/pcmrender.mjs): where each
panel, row and column lands shows what the mapping did.
"""
import sys

from PIL import Image


def main(out, scale=1):
    W, H = 455, 313
    im = Image.new('RGB', (W, H))
    px = im.load()
    for y in range(H):
        for x in range(W):
            back = x >= 227
            shade = ((x // 10) + (y // 10)) % 2
            c = ((70, 130, 255), (30, 60, 170))[shade] if back else ((255, 150, 40), (190, 90, 10))[shade]
            if x % 50 == 0 or y % 50 == 0:
                c = (255, 255, 255)
            if y < 6 and not back:
                c = (255, 0, 0)
            px[x, y] = c
    if scale != 1:
        im = im.resize((W * scale, H * scale), Image.NEAREST)
    im.save(out)


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1)
