# Gentle Breeze — organic wind lettering

Native OpenFilm text effect: **Text → Word art → Gentle Breeze**.

A fine, luminous thread follows the letter contours, leaves the text gently visible, and then disperses it as filaments originating from the glyphs. Procedural Canvas 2D, transparent background and deterministic absolute-time rendering via `window.film.frame(t)`.

## Three timing controls

- **Entrance time** (`--wind-duration`, default **5.5 s**): how long the wind takes to draw the word.
- **Total duration** (`--wind-total`, default **10.5 s**): the full effect length, including entrance, hold and exit. Editing this field in the Studio inspector also changes the clip's length on the timeline.
- **Exit time** (`--wind-dissolve`, default **3.2 s**): how long the letters take to release their own filaments and disappear.

**Hold = max(0, Total duration − Entrance time − Exit time)**. Defaults: 10.5 − 5.5 − 3.2 = **1.8 seconds**.

If Entrance + Exit exceeds Total, the engine preserves the exit interval and shortens the entrance to avoid clipping. Prefer configuring Total at least as long as Entrance + Exit. The clip timeline is resized when **Total duration** is edited; manually resizing an existing clip does not change its configured total.

The former independent Hold field was removed. The previous hidden `--clip-length` proportional speedup was also removed, so setting entrance or exit independently never silently scales both phases.

Other parameters: **Text**, **Intensity**, **Particles**, **Glow**, **Color**, **Speed**, **Direction** and **Seed**.

## Implementation

The OpenFilm library uses `saved.json` and HTML assets in `files/`. The Studio server synchronizes the clip's end when `--wind-total` changes in this specific built-in effect. This is intentionally limited to Gentle Breeze and does not affect other text effects.

No external media or third-party dependencies.

## Verification

Chromium isolated animation tests cover default timing, a 20-second total with extended hold, customized faster entrance and exit, total shorter than their requested sum, Unicode text, transparent final frame, out-of-order frame repeatability, and absence of browser errors. Full Desktop integration and repository-wide pnpm tests require checking in the complete project environment.
