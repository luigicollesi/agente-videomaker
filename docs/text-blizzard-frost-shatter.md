# Blizzard — Frost Shatter

**OpenFilm library:** Text → Blizzard · Ice & snow → Blizzard — Frost Shatter

ID: `text/text-blizzard-frost-shatter`

The approved V2 prototype was adapted as a native **HTML/Canvas 2D** library asset. The source engine is preserved and its laboratory-only UI/background were removed.

## Sequence (default 7 s)

| Normalized timeline | Action |
| --- | --- |
| 0–34% | Ice nucleates and grows to form the actual editable word |
| 34–53% | Hold: full, stationary, readable frozen typography |
| 53–70% | Deeper frost with stronger glints |
| 68–78% | Cracks appear and spread |
| 77–100% | Rigid fragments separate, rotate and dissipate with particles |

## Inspector parameters

| Name | Source | Default | Suggested valid range |
| --- | --- | --- | --- |
| Text | `.t` text content | `CONGELADO` | Unicode grapheme strings |
| Duration | `--blizzard-duration` | `7` | 1–30 s |
| Freeze intensity | `--blizzard-intensity` | `1` | 0.1–3 |
| Fracture | `--blizzard-fracture` | `1` | 0–3 |
| Particles | `--blizzard-particles` | `1` | 0–3 |
| Seed | `--blizzard-seed` | `42` | 0–99999 |

The film's clip duration and CSS duration should match. The engine exposes `window.film.frame(t)` where `t` is absolute seconds, not delta time. Particles and fragment movement are derived from stable identifiers, time and seed. The background is transparent to composite over a film.

## Director selection metadata

- **Category:** text / blizzard
- **Purpose:** dramatic icy typography for phrase, title, or word, with formation, hold, and exit shatter
- **Capabilities:** editable text, Unicode grapheme segmentation, absolute-time scrubbing, alpha, seeded randomness, hold, fragmentation
- **Suggested default duration:** 7 seconds
- **Compute cost:** High; procedural texture preparation plus pixel-based alpha reveal and up to hundreds of fragments and particles per frame
- **Assets:** none external; fully procedural
- **Source:** `packages/openfilm/library/text/text-blizzard-frost-shatter/files/blizzard-frost-shatter.html`
- **Caveats:** Canvas 2D, not physical 3D refraction or volumetric ice; 4K preview, Electron timeline and standalone animated preview still require validation

## Packaging

```text
packages/openfilm/library/text/text-blizzard-frost-shatter/
  saved.json
  poster.svg
  files/blizzard-frost-shatter.html
```

The library entry is in `packages/openfilm/library/index.json`, with identifiers, tags, duration and description for programmatic discovery. The previous Frost Shatter PR #4 was closed without merge and is not used by this asset.
