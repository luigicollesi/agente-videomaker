# MCP-first creative film editing and P1 acceptance

Native tools: `film_audit`, `film_preview_range`, `film_preview_frame`, `project_page_update`, `timeline_apply_batch`, `timeline_set_properties`.

## Recommended execution

1. Query `timeline_overview` for film revision and available tracks. Query `film_audit` with `expected_seconds` when the user gave a duration. An **exact** duration is confirmed only if `duration_confirmed=true`; if an expectation exists, also require `expected_duration_matches=true`.
2. Use built-in timeline/properties/motion tools first. To modify a small amount of a linked HTML page, call `project_page_update` with `action=inspect`, read that page's relevant source using the agent's read tool, then call `action=replace` with `revision`, `expected_sha256`, and unique `find`/`replace` snippets. The tool never runs arbitrary source code, refuses locked tracks and detects stale film/page revisions.
3. Creating a new HTML page or writing sophisticated custom particle/lighting JS is a legitimate code-edit fallback, not a failure of MCP. Use terminal/CLI for unsupported operations; don't repeat successful MCP calls. Explain the fallback only when relevant.
4. After source changes, call `film_audit` again. Use `film_preview_range` with `start`, `end` and `count` (2–12 frames) to inspect a whole-film contact sheet. The native look implementation checks frames for deterministic rendering and can report image/font issues. Use `film_preview_frame` for detailed checks of entrance, hold, exit and clímax. Sampled screenshots do **not** prove every frame was inspected.
5. In the final answer, mention which aspects actually changed, what was verified and what remains uncertain. Always put a human-readable label next to Studio tokens, e.g. `clímax (45–60 s) [[range:45-60]]` or `início (0 s) [[t:0]]`. Links must never carry the only readable location.

## Safety boundaries

- `film_audit` uses explicit clip trims and speed. If a clip requires probing a native media duration, it returns `duration_seconds:null`; it does not claim to have decoded the media. Missing or external assets are reported.
- `film_preview_range` uses the existing look renderer, stores verified PNGs inside `.film/mcp-previews/` and returns a bounded image preview if small enough. Rendering requires the usual Chromium/FFmpeg setup; failures must be surfaced rather than ignored.
- `project_page_update` changes **only linked HTML pages** inside the project, by exact unique replacements. File size is limited and modifications require both a matching film revision and SHA-256 of the existing page. For more substantial code changes use normal source authoring, followed by a native preview.
- Confirmation of improved aesthetics requires human inspection of the frames, not just a tool receipt.

## PULSO regression scenario

On an isolated copy of the 60-second PULSO film: assert structural duration and audio placements, inspect all six shots using the contact sheet, change the requested light/particle effects through the appropriate native or code path, verify that revisions and all linked media remain valid, and provide at least one readable reference to the climax. Compare time, tool use, token usage and rendered quality against the original run.

The P1 unit tests live in `apps/desktop/src/media-mcp.p1.test.mjs`. The gated browser-backed test `media-mcp.film.test.mjs` checks preview and rendering; do not claim it passed without running Chromium/FFmpeg.
