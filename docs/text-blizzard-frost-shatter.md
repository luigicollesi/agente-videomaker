# Blizzard — Frost Shatter

**OpenFilm library:** Text → Blizzard · Ice & snow → Blizzard — Frost Shatter  
**ID:** `text/text-blizzard-frost-shatter`

## Timing — synchronized with the real timeline clip

The clip length is the source of truth. The OpenFilm Studio server automatically writes `--clip-length: <seconds>s` to the clip's `:root` override after timeline edits (including trims). This preset parses the CSS duration with `parseFloat`, accepting `7s` as 7 seconds, and uses it for all absolute-time frames.

| Inspector field | CSS variable | Default |
| --- | --- | --- |
| Total duration (s) | `--clip-length` | 7 s |
| Appearance time (s) | `--blizzard-in` | 2.4 s |
| Exit time (s) | `--blizzard-out` | 3.3 s |
| Freeze intensity | `--blizzard-intensity` | 1 |
| Fracture | `--blizzard-fracture` | 1 |
| Particles | `--blizzard-particles` | 1 |
| Seed | `--blizzard-seed` | 42 |
| Text | `.t` | CONGELADO |

**Hold = max(0, total − appearance − exit)**. Increasing appearance duration slows the ice formation; increasing exit duration slows the deep-freeze, crack and shatter animation. The hold is a static, completely readable frozen word.

The best way to change total duration is **resize the clip on the timeline**. Studio may overwrite manual edits to the `Total duration (s)` property with the real clip length, intentionally keeping the engine aligned with the timeline. This is unlike the earlier implementation where the three independent phase times changed the page's duration without changing the timeline clip.

If the requested appearance plus exit time exceed the clip length, the engine compresses them proportionally into that length and sets hold to zero. This avoids unfinished entrance and exit animations.

```text
Total 10 s | Appearance 1 s | Exit 2 s | Hold 7 s
Total  7 s | Appearance 2.4 s | Exit 3.3 s | Hold 1.3 s
Total  4 s | Appearance 3 s | Exit 3 s | Hold 0 s (phases scaled to 2 s each)
```

## Sequence and rendering

The ice nucleates from a transparent canvas and grows into an editable, Unicode-aware word. The intact text remains readable until the exit begins. During exit, light intensifies, cracks appear and shards scatter before becoming fully transparent.

The effect is transparent, deterministic from parameters and absolute `window.film.frame(t)`, and fully procedural Canvas 2D with no external third-party assets.

## Preview

The built-in library bundle contains `preview.mp4` for the animated display thumbnail, `preview.html` for a live engine preview, and `poster.svg` as a static fallback. The MP4 samples the default seven-second sequence and need not reflect customized timing.

## Integration and validation

The preset exposes `--clip-length` as an inspector property to activate OpenFilm's standard `fitClipLengths` synchronization in `studio/server/ops.mjs`.

The updated engine was checked locally in Chromium for CSS length strings, multiple timelines, zero hold, Unicode text, arbitrary frame order/repeatability, and JavaScript exceptions. Full Studio Desktop integration and 4K performance should be checked separately. No other preset or editor pipeline code was changed.
