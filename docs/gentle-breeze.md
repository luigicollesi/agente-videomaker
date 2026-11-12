# Gentle Breeze — organic wind lettering

Built-in OpenFilm text effect: **Text → Word art → Gentle Breeze**.

A thin wind thread traces the letter silhouettes, leaves the completed word readable, then organically releases letter-born filaments into the breeze. Procedural Canvas 2D with transparent output and deterministic `window.film.frame(t)`.

## Timing: the timeline is the source of truth

Only **two animation timing parameters** appear in the inspector:

- **Entrance time** (`--wind-duration`, default **5.5 s**): how long it takes the wind to write the word.
- **Exit time** (`--wind-dissolve`, default **3.2 s**): how long the word takes to unravel.

**Total duration = the actual timeline clip length**, not a separate user-editable parameter. **Hold = max(0, clip length − entrance − exit)**.

For a 20-second timeline clip, entrance 2 s and exit 3 s, the effect remains fully visible for 15 s before the exit runs from 17 s through 20 s. For a 10.5-second clip with the default phase times, hold is 1.8 s.

If entrance plus exit exceed the clip's duration, the shorter timeline interval is prioritized: exit time is preserved as far as possible and entrance is shortened. This is a fallback only; set a clip duration of at least entrance + exit for precise timing.

The effect reads **`--clip-length`** (seconds in CSS syntax, such as `20s`) supplied by OpenFilm. This property is listed in `data-props` so Studio's standard `fitClipLengths` mechanism keeps it synchronized with `clip.time`, but the inspector hides this technical variable: resize the clip directly on the timeline.

The asset declares **`frameReadsOverrides: true`**: the host must apply root CSS variables and text before drawing the requested timestamp. The asset's `film.duration` getter also returns its timeline duration.

Other user-editable controls: Text, Intensity, Particles, Glow, Color, Speed, Direction, and Seed.

## Integration notes

- The library bundle initially inserts a 10.5-second clip (`saved.json`, `time:[0,10.5]`), but this is a default, **not a maximum**.
- Studio does not automatically replace an already-copied effect HTML in an existing project. If that project imported an older Gentle Breeze, its local `saved/openfilm/text-gentle-breeze/gentle-breeze.html` may still have the old behavior even after updating OpenFilm. Test in a new project or deliberately update the old copy while preserving customizations.
- The obsolete Gentle Breeze-only server patch that resized clips when changing `--wind-total` was removed. The standard timeline mechanisms now own all clip-length changes.

## Verification targets

Test the isolated HTML using the supplied `--clip-length` property and simulate the host applying overrides before `frame(t)`. Verify a 20-second clip with 2-second entrance and 3-second exit at t=1, t=10, t=17, t=19, and t=20; test out-of-order frame reproducibility. Add server regression tests that assert changing `clip.time` from 10.5 to 20 updates `--clip-length`, without changing any unrelated effect. Run repository-wide tests and check Desktop preview and rendered output before production release.
