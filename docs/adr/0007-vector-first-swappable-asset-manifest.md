# 0007. Vector-first art behind a swappable asset manifest

- Status: Superseded in part by [0016](0016-generate-raster-art-with-cached-image-lottie.md) and [0019](0019-render-all-actor-and-effect-motion-with-native-lottie.md) (art direction, motion inventory and measured native actor playback; logical IDs and caps retained)
- Date: 2026-11-07

## Context

- REQUIREMENTS 11: assets must be replaceable at any time and managed separately from code.
- The requester chose vector art (SVG and Lottie) as the main format on 2026-11-07, to show off ThorVG.
- ADR 0003 measured that vector cost scales with complexity: 3000 one-circle shapes held 60 fps, but 1000 copies of a 10-path stroked SVG dropped to 30 fps.

## Decision

**Manifest.** All art lives in `assets/` at the repository root and is referenced only through `assets/manifest.json`:

```json
{
  "version": 1,
  "assets": {
    "enemy.bat": {
      "file": "enemies/bat.svg",
      "format": "svg",
      "size": [32, 32],
      "anchor": [0.5, 0.5]
    },
    "player.knight.walk": {
      "file": "players/knight-walk.json",
      "format": "lottie",
      "size": [48, 48],
      "anchor": [0.5, 0.9]
    },
    "fx.hit": {
      "file": "fx/hit.png",
      "format": "png",
      "size": [24, 24],
      "anchor": [0.5, 0.5],
      "filter": "nearest"
    }
  }
}
```

- Game code and content data refer to logical IDs such as `enemy.bat`, never to file paths.
- Supported formats are `svg`, `lottie` and `png`/`webp`. An entry can switch format without code changes.
- Replacing art means replacing the file or editing its manifest entry. No code change and no rebuild of game code are needed.
- A missing or broken asset is reported once and drawn as a visible magenta placeholder. It must not crash the game.
- The repository starts with simple placeholder art for every ID, so the game is playable before final art exists.
- Only original or properly licensed art goes in `assets/`. Do not copy art from Vampire Survivors.

**Performance guardrails** for vector art used in large numbers (enemies, projectiles, gems):

- At most 4 paths, no strokes, and no gradients per entity. Bosses, players, UI and effects are exempt.
- Load each asset once, then clone instances with `duplicate()` from a pool (ADR 0003).
- Live entity caps are content constants: start at 400 enemies, 600 projectiles and 400 gems. Raise them only with a measurement on a mid-range laptop.
- Lottie is for a few on-screen instances, such as players, bosses and effects. Using one Lottie per enemy needs a measurement first; it is tracked in the performance issue.
- Gems merge into a higher-value gem when too many are on the ground, as in the original game.

## Alternatives considered

- **PNG sprites first** — measured fastest (3000 at 60 fps with headroom), but does not use ThorVG's strengths. It remains available per asset through the `format` field if a vector asset is too slow.
- **Paths hard-coded in TypeScript** — fast, but breaks REQUIREMENTS 11.

## Consequences

- Art complexity is a performance budget that reviewers must check.
- The worker loads assets with `fetch`, so `assets/` must be served next to the client. The client's Vite `publicDir` points at it.
