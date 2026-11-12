# Spatial Rift V6 — title effect

Spatial Rift is a transparent, deterministic HTML/Canvas 2D text effect in **Text → Titles**.

## Sequence

1. A thin irregular fracture forms and opens into a small dimensional slit.
2. The title emerges, the rift closes, and the text remains visible.
3. The tear reopens; the title retreats into it and the fracture closes.

## Studio usage

Insert **Spatial Rift — enter / hold / return** from the Text library onto a video track. Select the clip and edit **Text** in the inspector.

Set these **three temporal values** together:
- **Total duration (s)**: entire effect duration (`--rift-total`).
- **Entry duration (s)**: time to emerge and close first rift (`--rift-entry`).
- **Exit duration (s)**: time to reopen, retract and close (`--rift-exit`).

The hold time is **total − entry − exit**; the total must be at least entry + exit. Also **resize the timeline clip to the same total duration** when editing the Total duration property: the effect itself cannot change its parent clip length in the timeline.

**Portal hue (0–359)** (`--rift-color`) changes the hue of the rift, atmospheric layers, glow, particles, and text reflections. The other inspector controls tune opening, glow, particles, text size, shadows, outline, softness, and procedural seed.

## Rendering and compatibility

- `window.film.frame(t)` uses absolute seconds and does not depend on previously rendered frames.
- The default clip length and `window.film.duration` are 6.6 seconds.
- Output background is transparent. Composite it above video/images in the OpenFilm timeline.
- The implementation has no external assets or third-party runtime dependencies.
- Source: `packages/openfilm/library/text/spatial-rift/files/spatial-rift.html`.
- Bundle: `saved.json` and `poster.svg`; catalog: `packages/openfilm/library/index.json`.
- V6 uses Canvas 2D; perspective is simulated and cannot physically refract an underlying source clip.
- Library poster is static; animation preview can be seen when the clip is played in the timeline. A versioned `preview.mp4` has not been included.

## Validation plan

Check rendering in Chromium at arbitrary time values and reversed order; test hue values 0, 120, 240; verify the text alone in hold, transparency outside the effect, clip-duration correspondence, accented characters, and text updates in the Studio inspector. Run `pnpm test`, `pnpm typecheck`, `pnpm audit:public`, and `pnpm check:pack` from the monorepo root before merge. Do not claim these full suite commands passed unless CI or local logs confirm them.
