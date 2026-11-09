#!/bin/sh
# Imports the "Powered by ThorVG" boot splash, asset ID ui.splash (ADR 0020, issue #126).
#
# Source: the animation provided by the ThorVG project for this game (2026-11-09),
#   https://github.com/user-attachments/files/34418458/powred.by.thorvg.1.json
#   92448 bytes, SHA-256 c448bc4d6b62d9fc7f790a4b28ad4a4717e2c9a13f30d5ee31fda12bf346e509
#   (@lottiefiles/creator 1.90.1, Lottie 5.7.0, 30 fps, frames 0-210, 1920x1080).
#
# Steps:
#   1. download the source and check its SHA-256 (exit 1 on mismatch);
#   2. python3 -I: take the one embedded image (asset id "2", data:image/webp;base64), write its bytes to a temporary
#      logo.webp, point the asset at the same-owner PNG (u '', p 'splash/logo.png', e 0; id, w and h kept) and write
#      assets/ui/splash.json compactly; nothing else in the animation changes;
#   3. dwebp: decode logo.webp to assets/ui/splash/logo.png (8-bit RGBA, noninterlaced);
#   4. print the size and SHA-256 of both outputs (record them in assets/README.md, Sources and licenses).
#
# The attachment belongs to the private repository, so GitHub answers it only with credentials: the script sends
# `Authorization: token $GH_TOKEN` (or the token of `gh auth token`, your own account) to github.com, from a header file,
# never on the command line; curl drops the header on the redirect to the storage host, whose URL is pre-signed.
#
# Tooling, installed by the contributor (not project dependencies): curl, python3, and libwebp's dwebp 1.6.0
# (`brew install webp`, or `apt-get install webp`). Re-running gives byte-identical outputs.
#
# Usage: sh scripts/make-splash.sh
set -eu

SRC_URL="https://github.com/user-attachments/files/34418458/powred.by.thorvg.1.json"
SRC_SHA256=c448bc4d6b62d9fc7f790a4b28ad4a4717e2c9a13f30d5ee31fda12bf346e509
JSON_OUT=assets/ui/splash.json
PNG_OUT=assets/ui/splash/logo.png

for tool in curl python3 dwebp; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "make-splash: '$tool' not found (dwebp comes with libwebp: brew install webp, apt-get install webp)" >&2
    exit 1
  }
done

sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    sha256sum "$1" | cut -d' ' -f1
  fi
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

token=${GH_TOKEN:-}
if [ -z "$token" ] && command -v gh >/dev/null 2>&1; then token=$(gh auth token 2>/dev/null || true); fi
if [ -n "$token" ]; then
  (umask 077 && printf 'Authorization: token %s\n' "$token" >"$tmp/auth")
  curl -fsSL -H "@$tmp/auth" "$SRC_URL" -o "$tmp/source.json"
else
  curl -fsSL "$SRC_URL" -o "$tmp/source.json"
fi
actual=$(sha256 "$tmp/source.json")
if [ "$actual" != "$SRC_SHA256" ]; then
  echo "make-splash: source SHA-256 mismatch: expected $SRC_SHA256, got $actual" >&2
  exit 1
fi
echo "source SHA-256 $actual matched"

mkdir -p assets/ui/splash
python3 -I - "$tmp/source.json" "$tmp/logo.webp" "$JSON_OUT" <<'PY'
import base64
import json
import sys

source, webp, out = sys.argv[1:4]
with open(source, encoding='utf-8') as f:
    doc = json.load(f)
prefix = 'data:image/webp;base64,'
embedded = [a for a in doc.get('assets', []) if isinstance(a.get('p'), str) and a['p'].startswith('data:')]
assert len(embedded) == 1, 'expected exactly one embedded image'
image = embedded[0]
assert image.get('id') == '2' and image['p'].startswith(prefix), 'expected the WebP image asset "2"'
with open(webp, 'wb') as f:
    f.write(base64.b64decode(image['p'][len(prefix):], validate=True))
image['u'] = ''
image['p'] = 'splash/logo.png'
image['e'] = 0
with open(out, 'w', encoding='utf-8') as f:
    json.dump(doc, f, separators=(',', ':'), ensure_ascii=False)
PY
dwebp -quiet "$tmp/logo.webp" -o "$PNG_OUT"

for file in "$JSON_OUT" "$PNG_OUT"; do
  echo "$file $(wc -c <"$file" | tr -d ' ') bytes, SHA-256 $(sha256 "$file")"
done
