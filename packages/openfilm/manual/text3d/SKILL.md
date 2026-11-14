---
name: text3d
description: Build, convert, verify and publish reusable real Three.js Text3D components.
---

# Videomaker Text3D v2

The v2 contract reference is `examples/text3d-v2/manifest.json`. The shared v2 scene/animation implementation now exists in `src/text3d-v2-core.mjs`, but the browser template, asset packaging and v2 publishing command are not yet integrated. Do not claim v2 publish support or invoke a nonexistent `create` command. For currently executable conversions, follow the v1 CLI while preserving these architectural requirements. Do not invent a new renderer, camera/timeline controller or contract. The shared runtime owns rendering and the clock; modules supply native model animation, appearance, motion and VFX.

The **selected 2D source** is the authority for text layout, font appearance, lighting, glow, entrance/hold/exit, particles, colors, easing and timing. Inspect HTML/CSS/JS, assets, data-props and overrides. Recreate its behavior in three-dimensional geometry; never copy the sample's animation preset. Missing exit animation means no invented exit.

Use `THREE.WebGLRenderer` and genuine meshes; SVGRenderer, CSS/pixel extrusion or a hidden WebGL renderer behind 2D output are not acceptable. A dynamic font may provide native character/deformation animations, isolated from external group motion. Modules use absolute timeline time and restore state for deterministic seeking.

Keep the draft in a persistent folder. Run `videomaker text3d validate <folder>`, fix all errors, then verify visual rendering, asset loading, source-specific animation frames and fonts. Registration is permitted only after verification of the **packed copy**. Register into Saved, confirm it can be imported and rendered, and only then apply to the timeline. If blocked, report the preserved draft's actual path and failure; never claim success or modify the original clip.
