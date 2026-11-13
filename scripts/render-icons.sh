#!/usr/bin/env bash
# Renders the console's PWA icons from the SVG sources in scripts/icons/ into public/icons/.
#
# The PNGs are committed, so neither the build nor CI runs this: run it after changing a source.
# Needs rsvg-convert (librsvg; `pacman -S librsvg`, `apt install librsvg2-bin`), not an npm package.
set -euo pipefail
cd "$(dirname "$0")/.."

src=scripts/icons
out=public/icons

rsvg-convert -w 192 -h 192 "$src/admin-icon.svg" -o "$out/icon-192.png"
rsvg-convert -w 512 -h 512 "$src/admin-icon.svg" -o "$out/icon-512.png"
rsvg-convert -w 512 -h 512 "$src/admin-icon-maskable.svg" -o "$out/icon-512-maskable.png"
rsvg-convert -w 180 -h 180 "$src/admin-icon-maskable.svg" -o "$out/apple-touch-icon.png"

echo "Rendered $(ls "$out" | wc -l) icons into $out."
