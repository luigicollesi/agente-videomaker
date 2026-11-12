# Blizzard — Frost Shatter

**Library:** Text → Blizzard · Ice & snow → Blizzard — Frost Shatter  
**ID:** `text/text-blizzard-frost-shatter`

## Adjustable timing

The entire effect is segmented into three independently adjustable stages. Changing one stage does not proportionally stretch the others:

| Inspector control | CSS variable | Default |
| --- | --- | --- |
| Formation time (s) | `--blizzard-in` | 2.4 s |
| Hold time (s) | `--blizzard-hold` | 1.3 s |
| Shatter time (s) | `--blizzard-out` | 3.3 s |
| Freeze intensity | `--blizzard-intensity` | 1 |
| Fracture | `--blizzard-fracture` | 1 |
| Particles | `--blizzard-particles` | 1 |
| Seed | `--blizzard-seed` | 42 |
| Text | `.t` | CONGELADO |

The duration calculated by the HTML engine is `formation + hold + shatter`; default total is 7.0 s. `window.film.frame(t)` accepts an absolute time in seconds. The complete frozen word remains fully legible during hold. Freezing, cracks, displacement and debris occur within the shatter stage.

**Timeline note:** editing the three variables changes the internal animation duration, not necessarily the length of the clip on OpenFilm's project timeline. Extend/trim the timeline clip to match the new sum to avoid cropping or unwanted blank frames. Do not rely on the previous `--blizzard-duration` variable, which is no longer used.

## Preview assets

- `preview.mp4` — compact preview of the visual sequence for asset-library display (256 px thumbnail resolution, H.264).
- `poster.svg` — static cover.
- `preview.html` — live preview loading the same procedural engine, useful for manual browser inspection.

The MP4 thumbnail is a low-resolution sampled preview; the actual rendered clip uses the procedural HTML source and is not limited to the thumbnail's resolution.

## Director metadata

- Category: `text`; group: `blizzard`
- Capabilities: Unicode graphemes, editable text, deterministic absolute-time frames, alpha compositing, growth, hold, fracture
- Default total duration: 7 seconds; customizable stages
- Compute cost: high for large resolutions because of pixel masks and multi-layer particles
- No external assets or redistributable third-party dependencies
- Engine: `files/blizzard-frost-shatter.html`
- Limitations: Canvas 2D, not physically simulated volumetric ice or raytraced refraction

## Package

```text
packages/openfilm/library/text/text-blizzard-frost-shatter/
├── saved.json
├── poster.svg
├── preview.mp4
├── preview.html
└── files/
    └── blizzard-frost-shatter.html
```

**Validation:** local Chromium tested distinct stage timings and frame-order repeatability with `window.filmHost=true`. Full monorepo CI, in-app inspector behavior, Electron timeline, and 4K performance have not yet been validated for this revision.
