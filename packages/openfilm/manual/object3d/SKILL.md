---
name: object3d
description: System skill for authoring 3D text, reusable 3D objects, scenes, and camera choreography in VideoMaker.
---

# VideoMaker 3D — unified system skill

This is the SINGLE system skill for all 3D creation. The old Text3D skill instructions are preserved below, as the existing Text3D MCP/CLI tools remain valid. Never introduce a parallel 3D scene renderer or duplicate the Text3D pipeline.

## Scene and camera objectives

- Build a real 3D scene graph of named object instances, 3D text nodes, lights, and a camera using the current Three.js/WebGL stage, preserving transparent pass-through and existing 2D layers.
- Distinguish **object motion** from **camera motion**. Orbiting the camera around a stationary object is not rotating that object; multi-object scenes need a SINGLE shared camera and depth sorting.
- The timeline is the single source of time. Evaluate camera pose from absolute clip time (no delta accumulation) for deterministic seek, preview and export.
- Camera properties: position [x,y,z], target [x,y,z], fov (degrees), optional orbit azimuth, elevation, radius, and easing. Preserve framing on aspect change; do not change 2D clip transforms when changing 3D camera.
- Object library: discover with `object3d_list` and inspect with `object3d_inspect`; CLI `videomaker object3d list|inspect`. The current implementation exposes catalog metadata, a camera-orbit planning operation, and an opt-in standalone WebGL cube demo. `object3d_demo_create` creates a project-local page under `assets/object3d/<name>/index.html` without changing the timeline. Use `timeline_overview` then `timeline_insert_asset` with the current revision to insert it; never claim insertion occurred just from creation. The CLI equivalent is `videomaker object3d demo <new-folder>`. `object3d_camera_orbit_plan` returns deterministic orbit keyframes but **does not** insert a camera track, alter the scene or export camera motion. Never claim GLB loading to stage, editable material overrides, camera timeline insertion or orbital video export already work. These are implementation milestones, not currently shipped features.
- Validate mesh/material identifiers against the loaded GLB before modifying; store per-instance overrides, never mutate immutable source assets. Render and inspect key moments before publishing.
- Multiple independently rendered full-stage transparent Text3D pages are NOT a coherent shared 3D scene; shared camera movement and realistic occlusion demand a common renderer/scene graph. Integrate into the existing WebGL stage rather than layering a second isolated canvas.

## Object asset convention

A catalog entry lives at `library/object3d/<id>/model.glb` beside `manifest.json`, with fields `id`, `name`, `format: "glb"` and optional `description`, `parts`, `materials`. Current list/inspect verify metadata and file existence, not actual GLB mesh content. No built-in models are installed yet.

## Existing Text3D authoring reference (retained)


# Videomaker Text3D

## Native authoring/discovery (MCP preferred)

Use `text3d_list` for a compact paginated registry list and `text3d_inspect` for one registered component's parameters. `text3d_create` creates a named draft under the project's `.film/text3d-drafts/<name>`; edit its source using your ordinary project-file editing capabilities, then call `text3d_validate` for structural validation. Validation **does not** prove the rendered appearance or publish the component. Use `text3d_preview` with the draft's `folder` to run the existing packaged preview pipeline through an isolated MCP worker, returning the generated preview page under `.film/text3d-drafts/`. Inspect actual rendered frames before approval. Use `text3d_font_add` for an installed upright TTF family (and optional `weight`); it modifies the draft, so run `text3d_preview` again with `replace_preview:true` if an older generated preview exists. This option replaces only the named generated preview folder. After the packaged preview has been inspected visually and explicitly approved, call `text3d_register` with `folder` and `visual_approved:true`. MCP refuses registration without its stored preview fingerprint or when the draft changed after preview. Use `text3d_apply` with the current film `revision`, selected `clip` ID and registered `component_id`; the native apply routine imports and verifies the bundle and refuses edits to locked tracks or stale film revisions. Do not register automatically immediately after preview. CLI remains an alternative when these tools are unavailable.



The canonical contract reference is `examples/text3d/manifest.json`. Generate drafts with `videomaker text3d create <folder>`, customize modules, run `validate`, then `videomaker text3d preview <folder>` to bundle dependencies and verify WebGL before `register`. The shared core owns the renderer, geometry and time; never recreate it when text changes. Experimental versioned manifests, templates and older CLI workflows are unsupported. Do not claim visual fidelity without source-specific visual tests.

The **selected 2D source** is the authority for text layout, font appearance, lighting, glow, entrance/hold/exit, particles, colors, easing and timing. Inspect HTML/CSS/JS, assets, data-props and overrides. Recreate its behavior in three-dimensional geometry; never copy the sample's animation preset. Missing exit animation means no invented exit.

Use `THREE.WebGLRenderer` and genuine meshes; SVGRenderer, CSS/pixel extrusion or a hidden WebGL renderer behind 2D output are not acceptable. A dynamic font may provide native character/deformation animations, isolated from external group motion. Modules use absolute timeline time and restore state for deterministic seeking.

Keep the draft in a persistent folder. Run `videomaker text3d validate <folder>` for structural checks, then `videomaker text3d preview <folder>` to generate the verified `<folder>-preview/files/index.html` with local Three.js import maps and assets. NEVER run `videomaker look` on the unbundled draft HTML: bare imports such as `three` will fail there by design; use `look` on the packaged preview page, inspect visual frames and font glyph coverage, and correct the original draft if needed (remove stale preview folder before regenerating). Registration is permitted only after verification of the **packed copy**. Register into Saved, confirm it can be imported and rendered, and only then apply to the timeline. If blocked, report the preserved draft's actual path and failure; never claim success or modify the original clip.

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


## Typography controls (current supported subset)

The canonical Text3D draft exposes `Font` (`--text3d-font`), `Font Size` (`--text3d-size`, Three.js world units), `Letter Spacing` (`--text3d-spacing`, world units), and `Text Align` (`--text3d-align`: left/center/right). Preserve matching 2D source properties in `props` and `parameterMap` when converting. The component reads overrides during frames and calls `core.setTypography()` on changes, without recreating WebGLRenderer.

Only local **Three.js typeface JSON** fonts enumerated in `manifest.typography.fonts` are supported by this implementation. The default built-in typeface is available as `default`, with `typography.defaultFamily` naming its alias. Each additional family must point to a validated local `./assets/*.json` file, embedded in the saved bundle. Do NOT assume a CSS `font-family` or a locally installed TTF/OTF/WOFF font can be converted automatically; automated project-font resolution, shaping, weight-specific face selection, italic styles and variable font support are NOT yet implemented. Do not replace an unsupported font silently or claim full typography parity. Report the remaining limitation when conversion cannot preserve the original typeface.



## Installed TrueType font conversion

The Text3D authoring CLI supports `videomaker text3d font-add <draft> "<installed-font-family>" [weight]` (default weight 400). It uses the existing Studio installed-font catalog to find a local *.ttf face, converts it offline through the Three.js TTFLoader + locally installed opentype.js dependency, and writes a Three.js typeface JSON into the draft assets and `manifest.typography.fonts`. Set `--text3d-font` to the returned canonical family. Run `validate`, `preview`, and `register` after conversion. Never load a font over a CDN. Only import a font if its license permits the required embedding/redistribution. Select an explicitly installed upright TTF face by weight (e.g. 700), then reference the returned `Family@700` in `--text3d-font`. An unavailable weight fails instead of silently falling back. Italic, variable axes, OTF/WOFF and project-local fonts are unsupported.


## Stage selection and universal 3D transforms

Newly registered Text3D Saved components opt into `data-text3d-full-stage: true`. The timeline positions their transparent WebGL canvas across the entire composition while passing the source clip's position and bounds into a separate content viewport (`--text3d-viewport-x/y/w/h`). Do not select, move or resize the canvas as an editable layer: the Studio stage selects the 3D glyphs by their visible hit area and passes transparent canvas pixels through to underlying clips. Select the component from its visible letters or the Text 3D library/timeline.

The universal **3D Transform** section contains Depth, Rotation X and Rotation Y, separate from the component's text/color/effect properties. The component reads `--text3d-rotation-x/y` as degrees; the Text3D core keeps user rotation in a separate group from animation transforms and renders deterministically at absolute clip times.

When a Text3D object is selected, right-button dragging on its visible pixels rotates X/Y; left-button dragging retains the existing Studio movement behavior. Release commits a single clip override edit; Escape cancels. Old Saved bundles are immutable and must not be claimed to support these controls without re-registration and capability verification. Verify pass-through selection, overlapping clips, left movement, rotation, Undo/Redo, and export before publishing a production clip.


## Publication hygiene

Use a draft and packaged preview in a dedicated working directory **outside** the project's `assets/`, root HTML pages and the Saved library. Never import temporary HTML, screenshots, fonts or previews into Media just to build Text3D. After successful `register`, keep the final registered Saved bundle (it is required by the Text 3D category and any imported projects); remove only the dedicated, agent-created temporary preview/draft files if no longer needed and only when their ownership and lack of references are verified. Never delete the original 2D clip, user assets, existing project files or registered bundles. Failed conversion retains its draft for recovery. Registered Text3D bundles belong solely in the Text 3D category, not the Media list.
