---
name: media
description: Media for an Videomaker film. Read it before you add music, a sound effect, a transition, an effect, a filter, a sticker, a text animation or a template, and before you make voice-over, pictures, video or transcripts, or search the web.
---

# Media

`videomaker get`: media for the film. First Videomaker's built-in library, free, offline and CC0: `get music-search`, `get sfx-search`, `get transition`, `get effect`, `get filter`, `get sticker`, `get text` and `get template`, each `--prompt "<what>"` in any words and language; each match says what of your prompt it has and lacks, and `--take <id>` copies the one you choose into the project and prints what to put in film.html. Look there before writing a transition, an effect, a text or a template yourself. The rest is made by a service the person connected in Studio (Settings → Services): voice-over, music and sound effects to your prompt and length (`get music`, `get sfx`, at a cost), transcripts, images, image search, video and web search. Make music or a sound when the person asks for something original, when it must fit the picture exactly, or when the matches lack what was asked; when the person says which they want, do that. `get` alone lists what works now; for a kind not connected, tell the person which services make it and where they connect one. A video clip costs a lot: the person confirms it in Studio first. Its `--help` lists the verbs and their options.

Media can come from `get` (Videomaker's library, or a service that makes it), any service the person uses (with its API docs and their key), or your own code. Save it under `assets/`.

When the person wants a service that is not built in to make pictures, clips or sounds (on the canvas too), add it as a provider: `videomaker get` ends by naming its folder, the contract it follows and a built-in one to read. Write it from the service's API docs, then try it with `get <verb> --via <id>` once the person has added its key in Settings → Services.


## Native library discovery (MCP preferred)

Use `library_search` for searching local music, sounds, transitions, effects, filters, stickers, text and templates, supplying `kind`, `query` and a small `limit` (3–8). It returns compact names and canonical IDs without printing a full library listing. Use the existing `videomaker get <verb> --take <id>` only for the take/import step until the equivalent tool is exposed; `library_search` does not copy files into the project. Do not run an identical CLI search after a successful MCP search.

## Reverse video

For reverse playback, run `python packages/openfilm/manual/media/scripts/reverse-video.py INPUT OUTPUT` from the repository root (or use the script's absolute path). Run `--help` for `--start`, `--end` and `--audio mute|reverse|keep` (default: mute). Save output under the film project's `assets/`; keep the original unchanged. Use the existing timeline controls for trims, speed and placement. FFmpeg and FFprobe are required; no paid service.

## Inspect images and videos (read-only)

For visual questions about Media, use `python packages/openfilm/manual/media/scripts/inspect-media.py image assets/photo.jpg --project PROJECT_ROOT` or `... video assets/clip.mp4 --project PROJECT_ROOT --max-frames 12 [--start SECONDS --end SECONDS]`. All inputs must be within that project's `assets/`. The helper returns an image path or timestamped JPEG frame paths, **not semantic descriptions**. Use the connected agent's actual image-reading tool (e.g. `read_image`) to inspect each returned image and reason about appearance, objects and events. Do not merely read or repeat filenames and claim to have seen images. If the agent/provider cannot accept visual inputs, say analysis is unavailable rather than inventing contents. For videos, use a smaller time window for precise events; timestamps are sampled estimates, not exact boundaries. Limit to 24 frames per call; the default is 12. Frames are temporary: delete the returned `temporary_directory` once inspected. Never import these frames into Media or modify source images/videos; do not delete user assets.


## Native visual tools (ACP/MCP)

When available, prefer the built-in `videomaker-media` MCP tools `inspect_image` and `inspect_video` for files under this project's `assets/`. These tools return actual image content (video frames also include timestamps), so interpret only what is visible. Keep `max_frames` small (12 by default; 24 maximum), and narrow `start`/`end` for detailed temporal questions. Sampling does not prove exact event boundaries. If MCP is unsupported, use the script above and an actual image-reading tool. If the connected agent cannot consume image content, report the limitation and never invent a visual description. Both workflows are read-only and do not add files to Media.

## Native reverse tool (MCP)

When `videomaker-media` exposes `reverse_video`, use it before running the reverse script manually. Pass `path` (existing video in `assets/`), `output` (new `.mp4` path in `assets/`), optional `start`/`end` seconds and `audio` (`mute`, `reverse`, `keep`). The tool will not overwrite an existing output. It creates an asset but does not automatically insert it into the timeline. If the tool is not available, use the existing CLI procedure described above.

## MCP processing safety

`videomaker-media` allows one heavy processing job per project across MCP processes (video inspection, reversal or audio analysis). A hidden `.videomaker-mcp-heavy.lock` in the project prevents concurrent work. Under normal shutdown it is cleaned automatically. If a process crashes, first verify no media job or MCP process is still running before manually removing this lock. Output files are published without overwriting existing assets; choose a new output path on retry. On Windows the MCP attempts to terminate the full child process tree when cancelling work.
