---
name: object3d
description: Find and inspect installed reusable 3D GLB assets for the VideoMaker Studio.
---

# Object 3D

Use the native MCP tools `object3d_list` and `object3d_inspect` (or `videomaker object3d list|inspect`) to discover real installed assets. An empty list means there are no models installed; never invent asset IDs or claim a model is usable. A GLB belongs in `library/object3d/<id>/model.glb` and needs a matching `manifest.json` containing `id`, `name`, `format: "glb"`, and optional `description`, `parts`, `materials` arrays. Part/material names must match stable names within the actual GLB scene; catalog validation currently verifies file existence and metadata, not GLB internals. Do not claim material edits, import or timeline insertion have been implemented by this first catalog discovery slice.

When editing a model in a future version, prefer non-destructive per-clip overrides and retain the source asset. Treat Texture/Color/Metalness/Roughness as material properties, and distinguish them from geometry deformation. Never mutate a registered source bundle during timeline editing.
