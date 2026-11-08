#!/bin/sh
# Builds assets/fonts/hud.ttf, the HUD font subset drawn by ThorVG (ADR 0013, issue #46).
#
# Source: Noto Sans Mono (SIL OFL 1.1) from github.com/google/fonts, pinned to commit
# 097bc1b8c04c3224087c2ae95f7a923859b778cf (path ofl/notosansmono/). google/fonts ships only the variable font
# NotoSansMono[wdth,wght].ttf, so the Regular instance (wght 400, wdth 100) is cut from it first.
#
# Steps:
#   1. download the variable TTF at the pinned commit and check its SHA-256;
#   2. fonttools varLib.instancer: pin wght=400 wdth=100 (static Regular);
#   3. pyftsubset: keep printable ASCII U+0020-007E only, drop every layout table (GSUB, GPOS, GDEF), STAT and hinting,
#      keep the copyright and license names (name IDs 0-6, 13, 14);
#   4. write assets/fonts/hud.ttf and print its size and SHA-256 (record both in assets/fonts/LICENSE-NotoSansMono.txt).
#
# Exact commands (run from the repository root):
#   fonttools varLib.instancer "$src" wght=400 wdth=100 --static -q -o "$tmp/regular.ttf"
#   pyftsubset "$tmp/regular.ttf" --unicodes=U+0020-007E --layout-features= --drop-tables+=GSUB,GPOS,GDEF,STAT \
#     --no-hinting --name-IDs=0,1,2,3,4,5,6,13,14 --name-languages=0x0409 --notdef-outline \
#     --output-file=assets/fonts/hud.ttf
#
# Tooling: fonttools 4.68.0, installed by the contributor (`pipx install fonttools==4.68.0`, or a virtualenv); it is
# not a project dependency. SOURCE_DATE_EPOCH pins the font's head.modified timestamp, so the output is reproducible.
# Output when this script was last run: 9400 bytes (budget: under 15 KB), SHA-256
#   dc8bbbd58c5b5404ec1eb392b6aedeb81904869b1009ec9b1ba056e4cb310dd0.
#
# Usage: sh scripts/make-hud-font.sh
set -eu

COMMIT=097bc1b8c04c3224087c2ae95f7a923859b778cf
SRC_SHA256=2cb2adb378a8f574213e23df697050b83c54c27df465a2015552740b2769a081
SRC_URL="https://raw.githubusercontent.com/google/fonts/$COMMIT/ofl/notosansmono/NotoSansMono%5Bwdth,wght%5D.ttf"
OUT=assets/fonts/hud.ttf
# 2026-03-27T01:12:21Z, the pinned commit's date.
export SOURCE_DATE_EPOCH=1774573941

for tool in curl shasum fonttools pyftsubset; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "make-hud-font: '$tool' not found (install fonttools with: pipx install fonttools==4.68.0)" >&2
    exit 1
  }
done
[ -d assets ] || {
  echo "make-hud-font: run from the repository root" >&2
  exit 1
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

src="$tmp/NotoSansMono-VF.ttf"
curl -fsSL -o "$src" "$SRC_URL"
got=$(shasum -a 256 "$src" | cut -d' ' -f1)
[ "$got" = "$SRC_SHA256" ] || {
  echo "make-hud-font: SHA-256 mismatch for the source font: got $got, expected $SRC_SHA256" >&2
  exit 1
}

fonttools varLib.instancer "$src" wght=400 wdth=100 --static -q -o "$tmp/regular.ttf"
mkdir -p assets/fonts
pyftsubset "$tmp/regular.ttf" --unicodes=U+0020-007E --layout-features= --drop-tables+=GSUB,GPOS,GDEF,STAT \
  --no-hinting --name-IDs=0,1,2,3,4,5,6,13,14 --name-languages=0x0409 --notdef-outline \
  --output-file="$OUT"

echo "fonttools $(fonttools --version 2>/dev/null || python3 -c 'import fontTools; print(fontTools.version)')"
echo "$OUT: $(wc -c <"$OUT" | tr -d ' ') bytes, sha256 $(shasum -a 256 "$OUT" | cut -d' ' -f1)"
