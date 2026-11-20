# Object3D rollout — regression-first gates

Branch: `feat/object3d-assets`. These are development gates, not claims of a passing build.

## Phase 0 — baseline (current change)

- Camera keyframe unit tests: deterministic seeking, arrival easing, hold, marker immutability and invalid inputs.
- Catalog tests: missing, inconsistent and valid metadata assets; these tests do NOT validate GLB binary content.
- Studio UI category test: old saved category preferences and insertion after Text3D.
- MCP discovery test: Object3D read operations and camera orbit planning alongside existing Text3D registration/validation.
- Never change existing Text3D rotation gesture, 2D canvas selection, timeline revisions, export or saved bundles at this phase.

## Required validation before Phase 1

From repository checkout with dependencies installed:

```sh
node --test packages/openfilm/src/object3d-camera.test.mjs packages/openfilm/src/object3d-catalog.test.mjs
node --test packages/openfilm/studio/ui/src/lib/library-categories.test.ts
node --test apps/desktop/src/media-mcp.discovery.test.mjs
pnpm --filter openfilm typecheck
```

Confirm local package/script manager matches the repository scripts before executing. Additional pre-existing Text3D tests, Studio visual selection, seek, transparent overlap and MP4 export need to pass on the target desktop build. Document failures before attempting any Scene3D changes.

## Phase 1 — future isolated Scene3D shell

- Build one opt-in scene instance and an adapter into the existing viewport with no replacement of Text3D renderers.
- Leave legacy Text3D pages unchanged; respect 2D overlay, hit testing, and stage layout.
- A shared camera will only control objects that belong to this new scene.
- Add visual export/seek tests before enabling in the production editor.

## Phase 2–8 gates

- Library model loading and timeline persistence before mouse navigation.
- Navigation before camera track mutations.
- Numeric camera keyframes before auto-insertion on mouse interaction.
- Arrival curves before agent mutation tools.
- MCP/CLI calls must reuse the same timeline transaction and revision checks.
- Migrate Text3D into shared scene only after stable Object3D camera operations, visual tests and legacy compatibility.

No phase advances solely from a successful unit suite. Preview and exported frames must be inspected.

## Implementation checkpoint — current branch

- Phase 0: automated regression checks added, including a branch-only Actions workflow.
- The TypeScript server baseline currently has diagnostics in unrelated `canvas.mjs`, `fonts.mjs` and `jianying-captions.mjs`; this branch does not change those modules. CI records them separately as diagnostic failures, never as passing typechecks.
- A missing optional Three.js example typeface blocked both existing Text3D creation and MCP tests. The matching r187 Helvetiker typeface is now bundled under `src/assets/` and used in creation/registration, avoiding any remote dependency.
- Phase 1A: `src/object3d-scene.mjs` provides an opt-in Three.js scene graph, bounds-based selection focus and deterministic camera evaluation, but allocates NO WebGL renderer and is NOT mounted in Studio. The legacy Text3D canvas remains unchanged.
- Do not claim Phase 1 completion until Studio preview and export of a scene are tested.

## Phase 1B — opt-in Stage/film-page integration

- New bundled sample `examples/object3d/index.html` renders a real Three.js cube with deterministic camera movement and a transparent WebGL canvas.
- `videomaker object3d demo <new-folder>` packages local Three.js modules, the shared Scene3D core and camera evaluator; the command refuses to overwrite existing directories.
- The MCP `object3d_demo_create` safely writes a demo into project `assets/object3d/<name>/index.html`. Timeline insertion is a separate revision-guarded MCP operation.
- Studio stage accepts `__object3dComponent` and `__object3dHitTest` for visible 3D pixels while retaining the existing Text3D hit testing behavior. Transparent pixels pass through to lower clips.
- Unit tests verify packaging and MCP validation. Visual tests use headless Chromium to verify mesh, transparency, absolute time seek, and the stage's click-through behavior.
- No new editor overlay, mouse gesture changes, automatic camera keyframes, GLB import or scene Inspector have been enabled. The Object3D library tab does not yet expose installable models.
- Preview and browser-stage tests must pass before expanding to timeline camera editing; MP4 export remains a separate acceptance gate.
