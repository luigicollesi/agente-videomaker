---
name: edit
description: How an Agente Videomaker film works, including creative procedural effects and validation. Consult when a workflow needs more than the native MCP tools.
---

# Making a film

## Native MCP-first workflow

Start with the smallest native operation relevant to the request. Use `timeline_overview`, `film_audit` (for computed duration and file integrity), `film_preview_range` (native multi-shot contact sheet), `film_preview_frame`, `timeline_apply_batch` and `timeline_set_properties` before reading or rewriting `film.html` or running equivalent CLI commands. For existing linked procedural pages, inspect and patch targeted snippets with `project_page_update`; provide its current file SHA-256 **and** film revision for edits. Use direct source editing for new pages or complex JavaScript effects beyond those limited replacements, and state why a fallback was required. Do not forbid authoring bespoke effects or overfit visual changes to generic presets.

Treat a claim of exact duration as verified only when `film_audit` returns `duration_confirmed:true` and, when requested, `expected_duration_matches:true`. Unknown media/page durations need further inspection; never guess. A contact sheet or one screenshot verifies only the sampled moments, not every film frame. In your final response give meaningful plain words beside any Studio reference token: "climax (45–60 s) [[range:45-60]]", not a reference-only phrase.


## Native construction from a blank timeline

Studio initializes new projects with a valid `film.html` and `tracks: []`. Inspect with `timeline_overview`, create procedural `.html` pages in the project when required, then insert them with `timeline_insert_asset` or `timeline_apply_batch` using the latest film revision. The MCP accepts local HTML scenes anywhere in the regular project tree (except `film.html` and hidden tool folders); conventional media must still be inside `assets/`. When no track exists, **omit `track`** to let the existing Studio engine create it. After each write reuse the new revision. Don't edit `film.html` directly just to manufacture tracks; if a particular operation has no native representation, use code authoring as a documented fallback. Validate final duration with `film_audit`; check actual audio duration where necessary and visually review scenes with `film_preview_range`.

## The project

A folder:
- `film.html`: the film. The person edits it in Studio at any moment: read it right before you change it, and change only what you mean to. Take a file out of it before you delete the file, so the film never points at one that is gone.
- Pages (`*.html`): pictures written as code, with the files they load by relative path.
- `assets/`: media files (video, pictures, sound). The person sees every one in Studio: keep only what the film can use, and delete the pieces you made them from.
- Files and folders starting with a dot (`.film`, `.git`) belong to the tools: leave them.

## film.html

    <!doctype html>
    <html>
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=1920, height=1080">
    <style>
      .card { object-fit: cover; border-radius: 24px; }
    </style>
    </head>
    <body>
    <section>
      <iframe src="title.html"></iframe>
      <img src="assets/logo.png#t=0,3" at="6" style="left: 1640px; top: 60px; width: 200px">
    </section>
    <section>
      <video src="assets/a.mp4#t=2,8" at="2" class="card" style="left: 160px; top: 90px; width: 1600px; height: 700px"></video>
    </section>
    <section>
      <audio src="assets/bed.mp3" volume="0.6"></audio>
    </section>
    </body>
    </html>

- The viewport is the film's frame, in CSS pixels; without it, 1920×1080.
- Each `<section>` is a track of clips that do not overlap; any clip goes on any track. The sections are the tracks as Studio's timeline shows them, top first: the first one's pictures are on top, so titles go before the footage they cover, and the background last. What a page does not paint is transparent; a moment with no clip is black.
- Put a new clip on a track that is free at its time and holds clips like it: titles with titles, footage with footage, sound with sound. Add a track only for a clip that must be over or under one already there at that time, and leave no track empty.
- A track the person `locked` is theirs: change nothing on it. A `hidden` track shows and plays nothing; a `muted` one plays no sound.
- A clip is an element: `<iframe>` a page, `<video>`, `<img>` a picture, `<audio>` a sound.
  - `src`: its file, relative to film.html. `#t=in,out` says which seconds of it play, `#t=in` to its end; without it, all of them. A picture, or a page without a `duration`, needs `#t=0,length`: how long it stays.
  - `at`: where it starts in the film, in seconds; without it, 0.
  - `left`, `top`, `width`, `height` in its `style` (px) and `rotate` (degrees, clockwise): where it sits. Without them, a video or picture is the stage, and a page is its own size, centered. With only `width` or `height`, the other keeps its proportions.
  - Its look is CSS, in `class` or `style`: a video or picture fits whole in its box unless you say otherwise (`object-fit: cover` crops it to the box).
  - It moves by CSS animation: `animation` in its `style`, its `@keyframes` in film.html's `<style>`. Its time starts at the clip's `at`. Move it with `translate` (px, or `vw`/`vh` of the stage), `scale` and `rotate`, never `transform`, `left` or `top`: these go on top of its box, about its center. `--clip-length` is how long the clip is (`4.2s`): time a way out from its end with it. For example a slow push in and a push out to the left:
    `<style>@keyframes push { from { scale: 1 } to { scale: 1.1 } } @keyframes out { to { translate: -100vw 0 } }</style>` … `style="animation: push var(--clip-length) linear both, out .5s ease-in calc(var(--clip-length) - .5s) both"`. Shots that follow one another go end to end on one track. A transition at a cut is one of the library's (`videomaker get transition`, see media), put over the cut as its `--take` says; one of your own is each shot's way in and out on that same track. Only two clips that must show at once, one fading over the other, overlap on two tracks.
  - `speed` (video and sound): 0.1 to 100. The clip lasts `(out − in) / speed` seconds. To make it faster or slower, change `speed` only: never make the file again at another speed, nor move its `.vtt`'s times. Its words (the `.vtt` beside it) follow `speed` on their own.
  - `volume` (video and sound): 1 is the file's own level; `muted` silences it.
  - `id`: a name, unique in the film; without it, the file's name.
  - `overrides`: the person's changes made in Studio. Keep them as they are.
  - `size` (page): the px a page without its own `width` and `height` is laid out at; without it, the stage's. Studio sets it when the frame changes shape. Keep it as it is; remove it only when you lay the page out again for the new frame.
- Cut a long recording by trimming it: every clip of it is the same file with its own `#t=`. Never cut, crop or re-encode media into new files; CSS crops.

## A page

    <script type="module">
    window.film = {
      frame(t) { /* draw the whole picture at t seconds */ },
      duration: 6,                  // optional: the page's own length, in seconds
      ready: loadEverything(),      // optional: a Promise; drawing starts once it settles
      width: 480, height: 320,      // optional: a page that is only a part of the picture
    };
    </script>

**The one rule: the picture depends only on t.** The same t always draws the same picture, whatever was drawn before and in whatever order.

- One shot per page: a film of five shots is five pages cut together in film.html, so the person can trim, reorder and replace each one. What the pages share (fonts, colors, a logo) goes in a file they load.
- Studio edits elements, not pixels: make what the person may change a DOM element.
- Without `width` and `height`, a page is the size of the stage: lay it out for it. With them (a chart in a corner), it is that size, and its clip's style puts it in place.
- A page's t is its own time, starting at 0. Where it sits in the film, and for how long, is film.html's.
- The host calls `frame(t)`; a page never animates by itself (no animation loop, no autoplay).
- The picture is captured once `frame` returns, or once the Promise it returns resolves. Create a WebGL context with `preserveDrawingBuffer: true`.
- A page has no sound: every sound is a clip in film.html. A shot's sound effect goes at the film second it plays: the page clip's `at`, plus the page's t, less the clip's in point (a hit at t = 2 in a clip at 5 goes at 7). When you move the page clip, move its sounds with it.

The words of a sound or a video are a WebVTT beside it with the same name (`vo/1.wav` → `vo/1.vtt`): a cue per subtitle line, a timestamp tag at each word. When the person asks for captions, Studio makes a caption track of them (SPEC: Captions); never draw subtitles in a page.

## 3D text

For any 3D text request, first read the bundled `text3d` skill in full (`videomaker skill text3d`). For 3D typography in Agente Videomaker, inspect the selected clip's HTML, props, overrides, fonts, dependencies and `frame(t)`. First run `videomaker text3d inspect <source-id>`; reuse a compatible registered component if available. Otherwise create real glyph geometry using the shared Text3D runtime, with separate `group` and `characters[]` motion, preserving text, supported properties, internal effects and timeline timing.

The selected 2D component is the authoritative animation specification. Inspect its actual HTML/CSS/JS, `frame(t)`, assets and configured overrides; identify every entrance, hold, exit and per-character effect (including easing, staggering, combustion, particles and disappearance). Recreate those same effects and their temporal sequence in the new 3D implementation using real glyph geometry and 3D-compatible VFX. This is a source-specific reconstruction, NOT a generic preset conversion. Do not copy the sample Text3D component's entrance/exit/scale envelope or substitute generic fades. Three.js WebGLRenderer is mandatory for generated Text3D; do not replace it with SVGRenderer, CSS pseudo-3D or rasterized extrusion to bypass a graphics-context failure. Diagnose the WebGL test environment separately. The sample demonstrates geometry, renderer and motion APIs only. If an effect cannot be faithfully adapted, report the limitation rather than silently substituting an unrelated animation.\n\nTreat Text3D creation as a repair-and-publish workflow, not a single attempt. Keep the draft files in a stable, named folder until publication; never leave the only copy in `/tmp`. After each change, run structural validation and a real rendered preview at source-specific entrance, hold and exit moments, inspect console/page errors and visible pixels, and correct failures before repeating. A blank frame, missing font/parameter, incorrect VFX or missing dependency is NOT successful validation. Do not register or apply an unverified component. Continue the debug/retest cycle within the task whenever tools permit; if blocked by an unavailable renderer or unrecoverable error, preserve the draft, report its exact path and the failing check, and do not claim completion. Successful completion requires `register` to succeed, `inspect <source-id>` to return the newly active version, the Saved bundle to contain its assets and inherited cover (when present), and the registered component to render correctly after import. Then apply to the selected clip and verify timeline playback; leave the original clip unchanged if any verification fails.\n\nGenerate `manifest.json`, `index.html` and `component.js` as a self-contained component. Import only bundled dependencies; never reference absolute project paths. Run `videomaker text3d validate <folder>`, verify actual rendering, then `videomaker text3d register <folder>` to publish an immutable reusable Saved-library bundle (including the original 2D poster). Only after publication and verification, run `videomaker text3d apply <project-folder> <clip-id> <component-id>`. Never treat a copied project asset as the canonical library component. Keep `frame(t)` deterministic. Never overwrite the 2D source, silently drop unmapped properties, introduce another animation clock, or substitute iframe/pixel extrusion for real 3D geometry.

## Seeing it

Prefer `film_audit` for a duration/integrity check and `film_preview_range` for a bounded multi-scene contact sheet. The native `look` path below is a fallback for options the MCP does not expose; a successful command without visual inspection is not proof of quality.

`videomaker look`, in the film's folder: a contact sheet of the whole film with its sound, and a check that the same t draws the same picture. `look 4.5` is one frame at full size, `look 3-6` a stretch, `look assets/a.mp4` a media file. After a render, `look --full` watches every frame of the rendered film for white flashes, jumping frames, still pictures and black, and `look --loudness=-14` says how far the mix is from a delivery loudness. Reading a frame it saves shows it to you: check every shot with it after you change the film, and never say it works or looks right before you have.

A render that stopped on its own (a crash or the computer asleep) is resumed by running it again with the same options: it draws only what it had not finished. Cancelling on purpose clears its chunks.

## Native film preview and export

Prefer `film_preview_frame` with the timeline second `at` when checking visual results. It runs the existing `look` engine with one frame and returns brief checks plus the generated PNG when it is small enough; a returned image is for inspection, not proof that the full film is correct. Use `film_render` with the latest `revision`, a fresh `assets/*.mp4`, `*.webm` or `*.mov` `output`, optional `start`/`end` and `fps` to export via the existing native renderer. The MCP renders into a private directory and publishes only if the project revision still matches; it never replaces an existing destination. Both operations require a working browser and FFmpeg, and may be computationally expensive. Do not re-run the same render using CLI once the MCP confirms success. Inspect relevant frames before exporting; use CLI for advanced export options not yet exposed.

## Native transcription and caption-track workflows

Use `captions_list` to discover `untranscribed` audio paths. `captions_transcribe` accepts 1–3 of these paths and `external_approved:true` **only after explicit user authorization for a potentially billable provider call**. `captions_translate` similarly accepts a target `language` and approval. Do not set approval merely because the tool is present. Both call the configured Studio service and return short receipts rather than full subtitle data.

Use `caption_tracks` with `action:"from_subtitles"` to make a WebVTT track from timed speech, `"new"` to import SRT/WebVTT text, `"sync"` to synchronize a speech-derived track (include the latest film `revision`), or `"translate"` with a `captions/<name>.vtt` source, language and explicit provider approval. To inspect a caption file, call `caption_track_cues` with `src`, `limit` and `offset`; this returns small pages of plain-text cues and keeps the file on disk. Track creation does not always insert a new track on the film timeline: use the Studio timeline when placement is needed.

## Native captions and motion presets (MCP preferred)

Use `captions_list` with `start`/`end` in **film seconds** and `limit`/`offset` to inspect synchronized subtitles without loading transcript files. Returned cues include their source `src`, original `line` timestamp **in milliseconds**, optional `part`, the current film `revision` and their current `text`. To correct a cue, call `captions_correct_line` with exactly those identifiers, the current `revision`, `expected_text` copied from the selected cue and the new `text`. Corrections use Studio's authenticated line-edit API and preserve the source timing; do not rewrite WebVTT directly. This operation requires the project to be open in Studio.

Use `captions_style` with `action:"get"` to read the current style and `style_revision`; use `action:"patch"` with the returned revision and a small `changes` object to change placement, font, color, karaoke, shadow or other supported style parameters through Studio. The backend validates and normalizes style fields. Style changes are independent of the film revision; use the style revision to prevent clobbering another edit.

For clip-level visual VFX, use `motion_presets` with `slot:"in"`, `"out"` or `"loop"` to list official Studio motions. Apply by `timeline_apply_motion_preset` with the current film `revision`, `clip`, `slot`, and `preset_id` (or `null` to remove that slot). Optional `seconds` changes its duration. These tools use the same `withPreset` and keyframes implementation as the Inspector; they preserve custom motion keyframes. For a timed exit, the clip must have an explicit source `time:[start,end]` trim and the motion duration must fit the clip. Avoid declaring a fixed `window.film.duration` in procedural VFX assets; the timeline controls total length and entrance/exit timings.

## Native batch editing and motion (MCP preferred)

Use `timeline_set_properties` for up to 30 edits to existing clips in **one revision-checked transaction**. Supported properties: `start`/`end` (source-time trim), `at` (timeline seconds), `box` (`{x,y,w?,h?,r?}` in stage px/degrees), `size` (`{w,h}` for pages), `fade` (`[in,out]` seconds), `speed`, `volume`, `disabled`, and `motion`. Motion is a map of `translate`, `scale`, `rotate`, `opacity` to arrays of `{t,v,ease?}`, where `t` is **clip-local seconds**; `translate` uses `[x,y]`, and ease may be linear/ease-in/ease-out/ease-in-out/hold. Inspect only that animation via `timeline_get_motion`.

Use `timeline_apply_batch` to combine up to 25 ordered `steps` in one validated update: `move`, `duplicate`, `remove`, `insert_asset`, `props`, `track` (locked/hidden/muted), and `stage` (width/height). For `insert_asset`, use an existing file under `assets/`; optionally supply a unique `id` so later steps in the same batch can refer to it. Example steps: `[{"op":"insert_asset","path":"assets/title.html","id":"title-a","at":2,"time":[0,5]},{"op":"props","edits":[{"clip":"title-a","prop":"box","value":{"x":50,"y":30,"w":600,"h":280}}]}]`. A bad step fails the entire transaction; do not retry blindly after success. Operations on locked tracks are rejected: unlock in a separate revision before editing. Both tools return the latest revision; batches return `new_clip_ids`.

Do not use `timeline_apply_batch` for unvalidated low-level `fields`, raw CSS, transcript edits, or arbitrary filesystem commands. Keep source code editing in the relevant project files when a structured tool does not exist.

## Native timeline authoring (MCP preferred)

For supported operations, use `timeline_overview` to get the latest revision and `timeline_get_clip` for one clip's properties. `timeline_insert_asset` inserts an existing project `assets/` file at timeline seconds (`at`, optional `track` and source `time` interval); `timeline_remove_clip` removes the specified clip without deleting the asset. Both require the exact latest `revision` and return the updated revision. Use `timeline_clips` pages instead of reading the whole `film.html`. Use other native MCP edit tools where supported; fall back to Studio/CLI for unsupported edits. Avoid retrying successful edits blindly.

## Native timeline inspection (MCP)

When `videomaker-media` exposes `timeline_overview` and `timeline_clips`, use them to inspect the current project's validated `film.html` without editing it. `timeline_overview` provides the film revision, stage and track counts; `timeline_clips` lists up to 100 clip summaries per page (`track`, `limit` and zero-based `offset` optional). Follow `next_offset` until it is `null`; if the timeline changes between pages, refresh the list. Results are read-only snapshots. For supported edits, `timeline_move_clip` moves an existing clip and `timeline_duplicate_clip` inserts a copy of one already in the timeline at `at` seconds. Both require the latest `revision` from a timeline inspection, and reject stale revisions; inspect again after each edit. `timeline_set_playback` updates only `speed` (0.1–100) or `volume` (0–4) using the same revision guard and Studio edit engine. Other edits continue through the existing Studio workflow. `timeline_split_clip` supports video/audio clips with explicit source trims `[start,end]`: supply the `clip` ID, the cut position `at` (timeline seconds), and the current `revision`. The MCP calculates the source-time halves from speed and trim. Optional contiguous `left_time`/`right_time` remain supported for existing callers and are verified against the calculation. The response returns `right_clip_id`, and `timeline_duplicate_clip` returns `new_clip_id` for subsequent edits. These tools do not delete clips or create arbitrary sources.
