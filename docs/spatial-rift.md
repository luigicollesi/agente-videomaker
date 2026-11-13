# Spatial Rift — timeline-driven title effect

Spatial Rift is a transparent, deterministic HTML/Canvas 2D title in **Text → Titles**. The visual sequence remains unchanged: the jagged fissure opens, text emerges, the fissure closes, and the title later retreats through the reopened tear.

## Timeline timing contract

The **timeline clip duration is the only total duration**. There are just two editable time parameters:
- **Entrance time** (`--rift-entry`, seconds, default 2.4).
- **Exit time** (`--rift-exit`, seconds, default 2.4).

The technical `--clip-length` variable is registered in `data-props` for automatic synchronization by OpenFilm and **hidden from the inspector**. Hold is derived: `max(0, timelineDuration - entrance - exit)`. Resizing the clip changes hold without changing the two configured phase durations. If their sum exceeds the clip length, preserve the exit as far as the clip permits and shorten the entrance; hold never becomes negative.

For a clip beginning at source time zero, with entrance 2 seconds and exit 3 seconds:

| Clip length | Entrance | Hold | Exit |
| --- | --- | --- | --- |
| 8 s | 0–2 s | 2–5 s | 5–8 s |
| 10.5 s | 0–2 s | 2–7.5 s | 7.5–10.5 s |
| 20 s | 0–2 s | 2–17 s | 17–20 s |

**Implementation:** `files/spatial-rift-timeline-v3.html` uses `window.film = { frame, frameReadsOverrides: true }` with no native `duration`. It reads `--clip-length` at every frame, so extending a clip past the original 6.6 s cannot freeze its clock at 6.599 s. The clip still initially inserts at 6.6 s via `saved.json.clip.time` and catalog `durationMs`; these are not a maximum.

### Trim and split

OpenFilm requests **source-time** `frame(t)`, not a timeline-local time. The ending `--clip-length` is the source end. On clips trimmed from the beginning (`start > 0`), exit remains tied to the source end but entrance does not automatically restart at the new visible beginning. Splitting behaves similarly. No global `sourceAt()` change was made.

### Existing projects

The new internal HTML filename `spatial-rift-timeline-v3.html` avoids reusing the old copied source. **Reinsert Spatial Rift from the library** to obtain the corrected version in an existing project. Clips already importing `spatial-rift.html` keep the original motor and need explicit replacement. Their customizations will not be automatically migrated.

### Artistic settings

Portal color (`--rift-color`, a CSS hex color selected with OpenFilm's native color picker) changes the edges, particles, dimensional layers and title reflections. Other controls adjust glow, opening, particles, text size, shadows, outline, softness and seed. The background is transparent; no external assets are required.

## Verification status (November 12, 2026)

Executed locally with Chromium/Playwright against the new HTML engine at 800×450:
- All 8, 10.5 and 20-second timing cases with entrance 2/exit 3; hold visible; final frame transparent.
- Frames at t=19, t=2, t=19 produced identical first/last pixels. Frames at 19 and 10.499 differed.
- Hue overrides were reflected in rendered pixels. Entrance/exit overlap was handled without JavaScript errors.
- `window.film.frameReadsOverrides === true`, and `window.film.duration` was absent.

**Not yet validated:** actual Studio timeline resizing and player dispatch, preview-versus-export pixel equivalence, source trimming and splitting in the running app, migration/reuse of old project bundles, 1080p/4K performance and the complete repository test suite. These require OpenFilm integration tests and must not be marked as passed based solely on the HTML test.

See `docs/vfx-timeline-timing-contract.md` and `.agents/skills/openfilm-vfx-timeline/SKILL.md`.
