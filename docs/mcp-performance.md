# MCP performance and reliability checks

The desktop exposes the same native `videomaker-media` MCP server to ACP agents and to Pi. Pi has two tools rather than the full catalog: `videomaker_tools` (search for names; request an exact name for its schema) and `videomaker_call`.

## Reproducible discovery benchmark

From the repository root after installing dependencies:

```sh
node apps/desktop/scripts/bench-mcp-discovery.mjs
```

The report compares JSON **bytes** for the full MCP tool catalog with a representative Pi two-step lookup (`timeline`, then `timeline_apply_batch`). It also times startup and the two local lookups. JSON bytes are **not token counts**, inference cost or film-production runtime. Inspect all values and do not assume that startup latency improves.

For optional per-request diagnostic lines:

```sh
VIDEOMAKER_MCP_METRICS=1 node apps/desktop/src/media-mcp.mjs
```

The MCP server emits `MCP_METRIC` JSON lines on **stderr**, containing only tool/method, outcome, elapsed milliseconds and response bytes. Tool arguments, source paths, provider credentials and generated output are not logged. Diagnostics are off by default. They are per-process counters; no background telemetry is uploaded.

## Functional regression tests

```sh
pnpm install --frozen-lockfile --ignore-scripts
node --test \
  apps/desktop/src/pi-mcp-bridge.test.mjs \
  apps/desktop/src/media-mcp.metrics.test.mjs \
  apps/desktop/src/media-mcp.music-options.test.mjs
```

The GitHub workflow `.github/workflows/media-mcp.yml` runs the wider protocol, timeline, Canvas, captions, music and Pi tests on Linux and Windows, plus the discovery benchmark on Linux. The FFmpeg/Music Analyzer test needs Python and FFmpeg. Real visual preview and export tests require Chromium and their applicable flags/dependencies.

## Measuring actual savings and quality

Run the same representative film-edit tasks with the same model, inputs, settings and assets using the earlier CLI path versus MCP-first. Compare (1) **input/output tokens from provider usage**, (2) wall-clock completion time, (3) tool calls, (4) failure/retry rates and (5) rendered-frame and audio quality checks. Keep the baseline and candidate runs separate. Do not claim savings from the JSON-byte benchmark alone. Report variance across repeated runs and any tasks that still require CLI.

Always retain the CLI as a fallback for unsupported operations, avoid repeating successful MCP changes via terminal, and never approve billable provider operations automatically.
