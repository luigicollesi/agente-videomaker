# Object 3D asset library

Place each reusable model in `<id>/model.glb` with a `<id>/manifest.json`:

```json
{
  "id": "sample",
  "name": "Sample",
  "format": "glb",
  "description": "An editable 3D object",
  "parts": ["Body"],
  "materials": ["Main"]
}
```

The category is exposed in Studio and asset discovery is available via `videomaker object3d list|inspect` and `object3d_list|object3d_inspect` MCP tools. Models are not bundled in this initial integration. Names should identify actual GLB meshes/materials. Loading GLB into the timeline and editing material overrides will be added separately.
