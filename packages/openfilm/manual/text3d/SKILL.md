---
name: text3d
description: Build, convert, verify and publish reusable real Three.js Text3D components.
---

# Videomaker Text3D v2

The v2 contract reference is `examples/text3d-v2/manifest.json`. The v2 runtime, browser template and bundled module loader are implemented. Start every new conversion with `videomaker text3d create <folder>`, then update its manifest source identity, visual parameters and modules. The `register` command packages and checks the actual WebGL/geometry output. Do not claim conversion fidelity without source-specific visual inspection. Do not claim v2 publish support or invoke a nonexistent `create` command. For currently executable conversions, follow the v1 CLI while preserving these architectural requirements. Do not invent a new renderer, camera/timeline controller or contract. The shared runtime owns rendering and the clock; modules supply native model animation, appearance, motion and VFX.

The **selected 2D source** is the authority for text layout, font appearance, lighting, glow, entrance/hold/exit, particles, colors, easing and timing. Inspect HTML/CSS/JS, assets, data-props and overrides. Recreate its behavior in three-dimensional geometry; never copy the sample's animation preset. Missing exit animation means no invented exit.

Use `THREE.WebGLRenderer` and genuine meshes; SVGRenderer, CSS/pixel extrusion or a hidden WebGL renderer behind 2D output are not acceptable. A dynamic font may provide native character/deformation animations, isolated from external group motion. Modules use absolute timeline time and restore state for deterministic seeking.

Keep the draft in a persistent folder. Run `videomaker text3d validate <folder>`, fix all errors, then verify visual rendering, asset loading, source-specific animation frames and fonts. Registration is permitted only after verification of the **packed copy**. Register into Saved, confirm it can be imported and rendered, and only then apply to the timeline. If blocked, report the preserved draft's actual path and failure; never claim success or modify the original clip.

## Text3D animation contributions

Prefer returning declarative contributions from `evaluate(time, context)` over mutating shared scene state. The shared runtime composes these commands after evaluating all enabled effects. Supported contribution arrays: `transforms` (targets `root` or `character:N`, properties `position`, `rotation`, `scale`, 3-number vectors), `materials` (target `material:0` or `material:1`, numeric `opacity`, `emissiveIntensity`, `roughness`, `metalness`), `lights` (target `light:0` or `light:1`, numeric `intensity`). Supported operations: `set`, `add`, `multiply`; conflicting `set` contributions to the same channel are rejected. Unsupported channels and malformed values fail validation rather than being ignored.

Examples of an effect factory and declarative movement:

```js
export function createEffect() {
  return {
    id: 'native-pulse',
    evaluate(time) {
      return { transforms: [
        { target: 'character:0', property: 'position', op: 'add',
          value: [0, Math.sin(time * 2) * 0.15, 0] }
      ] };
    },
    dispose() {}
  };
}
```

Temporary legacy effects may mutate the scene through context for compatibility, but this pathway is not fully isolated or guaranteed deterministic. Use `context.resources.track(resource)` for every effect-created GPU resource that supports `dispose()`; resources are tracked by effect owner and disposed centrally. Do not dispose shared core materials or the WebGLRenderer from an effect. Advanced geometry deformation, particles, color mixing and postprocessing contributions are **not yet** part of the declarative contract. Never claim those capabilities exist without implementation and verification.

## Editable extrusion depth and automatic layout

Every current extruded-text component MUST expose `Depth` as a CSS variable property `--text3d-depth` (positive world units) with an entry in `parameterMap`. The sample template implements this: read the variable on each frame and call `core.setDepth(value)`, which rebuilds **only glyph geometry**. Never fake thickness using CSS shadows or a flat SVG. Preserve the separate mesh face and side materials.

After text changes, call `core.setText(text)`, never `core.dispose()` followed by `createText3DCore()`. The shared core automatically fits its actual glyph bounds inside the canvas and centers the text. Keep `core.resize(canvas.clientWidth, canvas.clientHeight)` so editing `OPEN` into `TESTEEEEE` does not crop glyphs. The default slightly oblique 3D viewpoint reveals the letter sidewalls; do not replace it with CSS transforms. Do not hardcode layout around the original word.
