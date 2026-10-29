#!/bin/zsh
# Download pcmmod.com's web jersey viewer rider (its glTF scene; the site's
# asset, never committed) into assets/ and check each file against the hash
# it had when pcm2bt was measured on it. pcm2bt projects from this rider by
# default (PCM_MESH=pcmmod); src/pcmmod.js reads it.
set -e
here=${0:A:h}
base=https://pcmmod.com/pages/jersey/viewer/ressources
typeset -A sha=(
  scene.gltf d21e1e9e512e0ac515993e070b23d997b7ad8a33f7c1560f44a483fab89806ba
  scene.bin  100600716d032916ead58ab8c882da0dfd2aff0a5c5025159ac35008e01b10f9
)
mkdir -p $here/assets/pcmmod
for f in scene.gltf scene.bin; do
  out=$here/assets/pcmmod/$f
  if [[ ! -s $out ]]; then
    curl -fsSL $base/$f -o $out.part
    mv $out.part $out
    print "fetched $base/$f -> assets/pcmmod/$f"
  fi
  got=$(shasum -a 256 $out | cut -d' ' -f1)
  [[ $got == $sha[$f] ]] || { print -u2 "assets/pcmmod/$f: sha256 $got, expected $sha[$f]"; exit 1; }
done
