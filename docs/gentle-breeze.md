# Gentle Breeze — wind-driven lettering

Native OpenFilm text clip in **Text → Word art**.

A curved wind thread outlines Unicode graphemes, leaving the word readable for a configurable hold, before releasing fibres that originate inside the glyph pixels. The canvas is transparent and `window.film.frame(t)` evaluates absolute time for deterministic rendering.

## Parameters

- **Text**: editable content of `.t` (default `BRISA`).
- **Formation duration**: `--wind-duration`, default 5.5 seconds.
- **Hold duration**: `--wind-hold`, default 1.8 seconds, including support for zero.
- **Dissolve duration**: `--wind-dissolve`, default 3.2 seconds.
- **Intensity**, **Particles**, **Glow**, **Color**, **Speed**, **Direction** and **Seed**: corresponding `--wind-*` variables.

Timeline clip length defaults to 10.5 seconds; when changing phase durations, align the clip length with the sum of all three. Frame request order does not affect the output.

## Design and licensing

Original procedural Canvas 2D implementation, with no external assets or third-party libraries.

## Limitations

Contour tracing uses the browser's Georgia fallback; its appearance may differ on other platforms. Complex scripts may not join correctly with grapheme-by-grapheme layout. 4K GPU/CPU use and actual Desktop timeline performance require validation on target machines.

## Local validation

Chromium rendered multiple distinct absolute-time frames without page errors. Repeated out-of-order frames matched; editing the text to `VENTO ÁÉ` and setting Hold duration to zero were also tested. Repository-wide `pnpm` tests and Desktop packaging were not executed in the isolated prototype environment.
