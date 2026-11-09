#!/bin/sh
# Renders the game's sound effects and music, asset IDs sfx.* and music.* (ADR 0021, issue #128).
#
# Sources, both MIT and pinned by SHA-256 (downloaded into a fresh temporary directory, never committed):
#   ZzFX 1.4.0 by Frank Force, https://registry.npmjs.org/zzfx/-/zzfx-1.4.0.tgz, file package/ZzFX.js
#     SHA-256 43f321101a935892c112a291e2e943b4da33159b43fcd4a21f3eae710f4a27ff
#   ZzFXM 2.0.3 by Keith Clark and Frank Force, commit cb07fa9ca36aefd67a0c8c656d2958b62f8ed9fe,
#     https://raw.githubusercontent.com/keithclark/ZzFXM/cb07fa9ca36aefd67a0c8c656d2958b62f8ed9fe/zzfxm.js
#     SHA-256 540904cd2574af403896bfa6fd552a7431461979e2002d44d16d21a34ea73115
#
# Steps:
#   1. download both files and check their SHA-256 (exit 1 on mismatch);
#   2. copy them as .mjs and run scripts/audio/render-audio.mjs, which renders every sound in
#      scripts/audio/sounds.json to a mono 16-bit 44.1 kHz WAV (seeded Math.random, music loops on whole rows);
#   3. encode each WAV with LAME 3.100 (`lame --quiet -m m -b 96 --noreplaygain`) to assets/audio/<sfx|music>/<name>.mp3;
#   4. write docs/assets/audio.receipt.json (tool hashes, and per sound file, samples, bytes, PCM and MP3 SHA-256)
#      and print each file's size and the total.
#
# --check renders and encodes into the temporary directory only, compares every sound with the receipt and the
# committed MP3s, prints "<n> sounds match the receipt" and exits 1 on any difference.
#
# Tooling, installed by the contributor (not project dependencies): curl, tar, node 24 and LAME 3.100
# (`brew install lame`, or `apt-get install lame`). Re-running gives byte-identical outputs.
#
# Usage: sh scripts/make-audio.sh [--check]
set -eu
cd "$(dirname "$0")/.."

ZZFX_URL="https://registry.npmjs.org/zzfx/-/zzfx-1.4.0.tgz"
ZZFX_SHA256=43f321101a935892c112a291e2e943b4da33159b43fcd4a21f3eae710f4a27ff
ZZFXM_COMMIT=cb07fa9ca36aefd67a0c8c656d2958b62f8ed9fe
ZZFXM_URL="https://raw.githubusercontent.com/keithclark/ZzFXM/$ZZFXM_COMMIT/zzfxm.js"
ZZFXM_SHA256=540904cd2574af403896bfa6fd552a7431461979e2002d44d16d21a34ea73115
SOUNDS=scripts/audio/sounds.json
RECEIPT=docs/assets/audio.receipt.json

mode=write
case "${1:-}" in
  '') ;;
  --check) mode=check ;;
  *)
    echo "usage: sh scripts/make-audio.sh [--check]" >&2
    exit 2
    ;;
esac

for tool in curl tar node lame; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "make-audio: '$tool' not found (LAME: brew install lame, apt-get install lame)" >&2
    exit 1
  }
done
lame --version 2>/dev/null | head -n 1 | grep -q 'version 3\.100 ' || {
  echo "make-audio: LAME 3.100 is required, found: $(lame --version 2>/dev/null | head -n 1)" >&2
  exit 1
}

sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    sha256sum "$1" | cut -d' ' -f1
  fi
}
check_sha() {
  actual=$(sha256 "$1")
  if [ "$actual" != "$2" ]; then
    echo "make-audio: $3 SHA-256 mismatch: expected $2, got $actual" >&2
    exit 1
  fi
  echo "$3 SHA-256 $actual matched"
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM
mkdir "$tmp/zzfx" "$tmp/lib" "$tmp/wav" "$tmp/mp3"

curl -fsSL "$ZZFX_URL" -o "$tmp/zzfx.tgz"
tar -xzf "$tmp/zzfx.tgz" -C "$tmp/zzfx" package/ZzFX.js
check_sha "$tmp/zzfx/package/ZzFX.js" "$ZZFX_SHA256" "ZzFX 1.4.0 package/ZzFX.js"
curl -fsSL "$ZZFXM_URL" -o "$tmp/zzfxm.js"
check_sha "$tmp/zzfxm.js" "$ZZFXM_SHA256" "ZzFXM $ZZFXM_COMMIT zzfxm.js"
cp "$tmp/zzfx/package/ZzFX.js" "$tmp/lib/zzfx.mjs"
cp "$tmp/zzfxm.js" "$tmp/lib/zzfxm.mjs"

node scripts/audio/render-audio.mjs --zzfx "$tmp/lib/zzfx.mjs" --zzfxm "$tmp/lib/zzfxm.mjs" \
  --sounds "$SOUNDS" --out "$tmp/wav"

for wav in "$tmp"/wav/*.wav; do
  id=$(basename "$wav" .wav)
  lame --quiet -m m -b 96 --noreplaygain "$wav" "$tmp/mp3/$id.mp3"
done

node --input-type=module - "$mode" "$tmp" "$RECEIPT" "$ZZFX_SHA256" "$ZZFXM_COMMIT" "$ZZFXM_SHA256" <<'JS'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { kebab, sha256 } from './scripts/audio/audio-lib.mjs';

const [mode, tmp, receiptFile, zzfxSha, zzfxmCommit, zzfxmSha] = process.argv.slice(2);
const render = JSON.parse(readFileSync(join(tmp, 'wav/render.json'), 'utf8'));
const sounds = {};
for (const [id, { samples, pcmSha256 }] of Object.entries(render)) {
  const mp3 = readFileSync(join(tmp, 'mp3', `${id}.mp3`));
  sounds[id] = { file: kebab(id), samples, bytes: mp3.byteLength, pcmSha256, mp3Sha256: sha256(mp3) };
}
const receipt = {
  tools: {
    zzfx: { version: '1.4.0', sha256: zzfxSha },
    zzfxm: { commit: zzfxmCommit, sha256: zzfxmSha },
    lame: '3.100',
  },
  sounds,
};
const ids = Object.keys(sounds);
if (mode === 'check') {
  const errors = [];
  const sealed = existsSync(receiptFile) ? JSON.parse(readFileSync(receiptFile, 'utf8')) : null;
  if (!sealed) errors.push(`${receiptFile} is missing`);
  else {
    if (JSON.stringify(sealed.tools) !== JSON.stringify(receipt.tools)) errors.push('tool versions or hashes differ');
    const sealedIds = Object.keys(sealed.sounds ?? {}).sort();
    if (JSON.stringify(sealedIds) !== JSON.stringify([...ids].sort()))
      errors.push(`sound IDs differ: receipt ${sealedIds.join(',')}`);
    for (const id of ids) {
      const want = sealed.sounds?.[id];
      if (JSON.stringify(want) !== JSON.stringify(sounds[id]))
        errors.push(`${id}: rendered ${JSON.stringify(sounds[id])} != receipt ${JSON.stringify(want)}`);
      const committed = join('assets', sounds[id].file);
      if (!existsSync(committed) || sha256(readFileSync(committed)) !== sounds[id].mp3Sha256)
        errors.push(`${id}: ${committed} differs from the rendered MP3`);
    }
  }
  if (errors.length) {
    for (const error of errors) console.error(`make-audio --check: ${error}`);
    process.exit(1);
  }
  console.log(`${ids.length} sounds match the receipt`);
} else {
  let total = 0;
  for (const id of ids) {
    const target = join('assets', sounds[id].file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(tmp, 'mp3', `${id}.mp3`), target);
    total += sounds[id].bytes;
    console.log(`${target} ${sounds[id].bytes} bytes, ${(sounds[id].samples / 44100).toFixed(3)} s, SHA-256 ${sounds[id].mp3Sha256}`);
  }
  const kept = new Set(ids.map((id) => sounds[id].file));
  for (const folder of ['audio/sfx', 'audio/music'])
    for (const name of existsSync(join('assets', folder)) ? readdirSync(join('assets', folder)) : [])
      if (!kept.has(`${folder}/${name}`)) rmSync(join('assets', folder, name)); // a sound removed from sounds.json
  mkdirSync(dirname(receiptFile), { recursive: true });
  writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`${ids.length} sounds, ${total} bytes in total; wrote ${receiptFile}`);
}
JS
