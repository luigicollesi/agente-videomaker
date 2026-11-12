# Gentle Breeze — wind-driven lettering

Native OpenFilm text clip in **Text → Word art**.

A curved wind thread outlines Unicode graphemes, leaving the word readable for a configurable hold, before releasing fibres that originate inside the glyph pixels. The canvas is transparent and `window.film.frame(t)` evaluates absolute time for deterministic rendering.

## Parameters

- **Text**: editable content of `.t` (default `BRISA`).
- **Formation duration**: `--wind-duration`, default 5.5 seconds.
- **Hold duration**: `--wind-hold`, default 1.8 seconds, including support for zero.
- **Dissolve duration**: `--wind-dissolve`, default 3.2 seconds.
- **Intensity**, **Particles**, **Glow**, **Color**, **Speed**, **Direction** and **Seed**: corresponding `--wind-*` variables.

Timeline clip length defaults to 10.5 seconds. The hidden `--clip-length` property is synchronized by Studio when inserting, trimming, or resizing the clip. If formation + hold + dissolve differs from the actual clip length, the three phases are proportionally fitted into the clip to ensure the exit animation completes. To preserve the precise configured durations in seconds, also resize the clip to their sum. Frame request order does not affect the output.

## Design and licensing

Original procedural Canvas 2D implementation, with no external assets or third-party libraries.

## Limitations

Contour tracing uses the browser's Georgia fallback; its appearance may differ on other platforms. Complex scripts may not join correctly with grapheme-by-grapheme layout. 4K GPU/CPU use and actual Desktop timeline performance require validation on target machines.

## Local validation

Chromium rendered multiple distinct absolute-time frames without page errors. Repeated out-of-order frames matched; editing the text to `VENTO ÁÉ` and setting Hold duration to zero were also tested. Repository-wide `pnpm` tests and Desktop packaging were not executed in the isolated prototype environment.

## Hold-duration regression

Verified in headless Chromium: with the Studio clip length held at 10.5s and Hold set to 9s, the frame at 10.3s contains only residual fragments and the frame at 10.5s is fully transparent. Re-rendering 10.3s after requesting other frames yielded exactly identical canvas data. No browser page errors were reported.
