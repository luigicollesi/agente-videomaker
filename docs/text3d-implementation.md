# Text 3D — incremental implementation

## Implemented in initial MVP

New **Text 3D** category in the existing OpenFilm library drawer, with a new `Text 3D — Motion Stack` procedural clip. It uses stacked planar glyph layers with CSS 3D transforms to simulate extrusion, transparent background, configurable text/colors/depth, and a JSON motion sequence supporting `rotate3d`, `scale`, and `translate3d` events.

The clip has a timeline-managed `--clip-length`, per-phase `--text3d-in` and `--text3d-out`, and no native `window.film.duration`. Its absolute-time renderer declares `frameReadsOverrides:true`.

The `--text3d-events` CSS custom property is an array serialized as a CSS string; for example:
```json
[
  {"id":"spin-1","type":"rotate3d","start":4,"duration":1.25,"axis":"y","turns":1},
  {"id":"spin-2","type":"rotate3d","start":7,"duration":0.75,"axis":"x","turns":1}
]
```
Each event is evaluated at the requested source time. The editor currently offers this as a **raw JSON property**, not yet a dynamic drag-and-drop event editor. Only 64 events are accepted for safety.

## Scope boundaries

This MVP **does not** automatically turn an arbitrary existing HTML clip into 3D, does not extract real font mesh geometry, and does not add draggable timeline event handles. Its depth is layered CSS typography, not a watertight polygon mesh; it is the safe integration baseline before introducing a Three.js adapter and GPU capture.

Legacy Text/Effects and the timeline player are left unchanged. The new library item is opt-in and non-destructive.

## Acceptance / pending

Automated tests cover library registration, temporal properties, and that the player can address 8/10.5/20 second source times without a native-duration clamp. Still required: OpenFilm Studio visual smoke test, real timeline seek after 10.5 s, render/export parity, user-project persistence, old HTML projection adapter, and interactive event editor. Do not claim full architecture implemented until these pass.
