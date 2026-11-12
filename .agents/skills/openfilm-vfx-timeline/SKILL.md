---
name: openfilm-vfx-timeline
description: "Use when creating, integrating, debugging, or retiming a procedural OpenFilm VFX/text asset with entrance, hold, and exit animation, particularly when its clip can be resized on the timeline. Prevent frozen time beyond the asset's initial duration, stale library copies, and overrides applied after frames."
---

# OpenFilm VFX — timeline-driven timing

**Mandatory source of truth:** [docs/vfx-timeline-timing-contract.md](../../../docs/vfx-timeline-timing-contract.md). Read it before editing or reviewing animation assets.

## Non-negotiable timing contract

- **Total duration belongs to the actual timeline clip.** Do not add a separate `Total duration` slider or an independently edited `Hold` slider.
- Offer only **Entrance time** and **Exit time**; calculate `hold = max(0, clipEnd - clipStart - entrance - exit)` for clips starting at local source time zero. Deal with source trims and splits separately as documented in the reference.
- The timeline sets `--clip-length` on the asset's `:root`; declare that variable in its `data-props`, with `type: "var"`, so `fitClipLengths()` writes it. It is hidden automatically by the inspector.
- Call `frame(t)` as an **absolute-time pure renderer**. Set `window.film = { frame, frameReadsOverrides: true }` so overrides are installed before drawing.
- **Never declare `window.film.duration` for a resizable procedural page VFX.** OpenFilm captures it as the page's native length. `sourceAt()` clamps the clock to that native value, freezing frames beyond the asset's default duration and preventing its exit. Supply explicit `clip.time` in the saved bundle instead.
- Entrance and exit seconds govern their phase speeds; a cosmetic wind/particle `Speed` parameter must not prevent either phase reaching completion.
- Default duration in the catalog and saved bundle is just a starting value, not a maximum.

## Critical implementation paths

- `packages/openfilm/src/film-doc.mjs`: `clipSpan()`, `sourceAt()` (native page clamp).
- `packages/openfilm/src/timeline.mjs`: per-page `frame(t)` invocation and `frameReadsOverrides`.
- `packages/openfilm/studio/server/ops.mjs`: `fitClipLengths()` propagation.
- `packages/openfilm/studio/server/saved.mjs`: copy-once bundles and stale file versions.
- `packages/openfilm/library/text/gentle-breeze/files/gentle-breeze-unbounded.html`: example of the timeline-owned contract.

## Do not ship without verification

Use at least three clip lengths: **initial 10.5 s**, **extended 20 s**, and **shortened 8 s**, with entrance **2 s** and exit **3 s**. At 20 s the effect must hold from 2–17 s and exit from 17–20 s; the iframe must receive the actual t=19 frame, not a clamped t≈10.499. Verify deterministic frames out of order, overrides at render time, real timeline/export behaviour, and source trim/split caveats. A headless HTML-only test is insufficient.

Preserve existing project copies; for a changed library motor, use an updated internal source filename so re-importing into the same project doesn't silently use an old file. Do not patch `sourceAt()` globally to solve an asset-specific native duration issue.

When responding, state which verification was executed and which still requires testing in OpenFilm.
