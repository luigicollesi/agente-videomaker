# Text3D — implementation and validation

## Architecture

OpenFilm supports two Text3D types:

- The built-in **Text 3D — Motion Stack** is a legacy CSS layered extrusion effect, retained for backward compatibility.
- Reusable generated Text3D bundles use **Three.js TextGeometry**, real 3D scene objects and the shared deterministic runtime (`frame(t)`).

**Source animation contract:** The selected 2D asset (including its configured overrides) is the sole visual/temporal reference. First inspect the source's actual HTML, styles, scripts, frame(t), dependencies and configured overrides; then recreate its entrance, hold, exit, easing, staggering, destruction, particles and state transitions in a new 3D implementation using 3D geometry/VFX. Preserving only parameter names without reproducing the actual animations is insufficient. The sample's `text3DEnvelope` scale-in/out and motion presets are implementation examples, not default motions for conversions. Never replace burn, freeze, shatter, or other source-specific transitions with generic scale/fade. Preserve duration governed by the timeline; document fidelity limitations.\n\nThe agent follows `manual/edit/SKILL.md`. The CLI supports `text3d list`, `inspect`, `validate`, `register` and `apply`. A registered component is immutable; newer versions promote a distinct entry while earlier bundles remain available. Registration copies the original built-in 2D source poster (JPG or SVG when present), and Saved serves either format. Generated bundles must be self-contained: relative imports are checked after packaging before registration. The registered Saved bundle, not the currently edited project copy, is the reusable source across projects.

Studio and the CLI use the same conservative `src/text3d-replace.mjs` planner. Conversion preserves compatible configured text/CSS values, fades and the effective timeline length; unsupported custom visual overrides reject the swap rather than silently disappearing. Conversion is **not** an automatic CSS/SVG-to-geometry translator. The agent must rebuild source-specific effects in the generated 3D component.

## Motion format

Canonical geometry motion events have `id`, `target` (`group` / `characters`), `type` (`rotate` / `translate` / `scale`), `start`, `duration`, and 3D vectors `from` / `to`; optional fields are `easing`, `stagger`, and `reverse`. Rotations use degrees in serialized events. The runtime evaluates motions at absolute time independent of previous frames.

The legacy CSS Motion Stack uses `rotate3d`, `translate3d`, and `scale`. `normalizeText3DEvents` adapts this format to canonical events for the Three.js runtime. Existing CSS entries retain their own renderer; they are not silently replaced with geometry.

The Studio inspector offers separate editors for compatible legacy motion and canonical geometry motion. Canonical editing supports whole-text and per-character targets.

## Timeline and export

The timeline owns total duration via `--clip-length`. Components must not impose native `window.film.duration`. Entrance/exit phase lengths are independent; remaining time is hold. The player owns frame progression. A generated WebGL page uses a transparent renderer and `preserveDrawingBuffer: true`.

## Verification

Automated tests in `packages/openfilm/src/text3d-*.test.mjs` cover the registry, CLI, replacement, event normalization, WebGL capture, time scrubbing and an MP4 export fixture. The visual/export tests require Chromium (with WebGL) and ffmpeg and may be environment-dependent.

**Release acceptance still requires** a successful GitHub CI run, an actual OpenFilm Studio preview/seek and export of representative source conversions (especially Burn and Frost Shatter), plus verification on the packaged desktop installation. A successful unit suite alone must not be presented as proof of effect-faithful 2D-to-3D conversion.
