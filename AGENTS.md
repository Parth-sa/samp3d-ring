# AGENTS.md — webgi-ring-360-viewer

## Commands

| Command | What it does |
|---------|-------------|
| `npm start` | Dev server (Parcel v1) at `http://localhost:1234` |
| `npm run build` | Production build to `dist/` |
| `node glb-ring-merger.js` | CLI to merge 3 GLB files |
| `node glb-patcher.js input.glb output.glb` | CLI diamond metadata patcher |

No lint, typecheck, or test scripts exist. No CI.

## Framework & toolchain quirks

- **Entrypoint**: `index.html` loads `src/index.ts` via `<script>` — Parcel resolves the TS import.
- **Parcel v1** — `parcel-bundler` (not v2).
- **WebGI v0.4.6** — proprietary Three.js-based framework from Pixotronics. NPM package hosted on `storage.googleapis.com`. No public docs.
- **TypeScript `strict: false`** — `noUnusedLocals` and `strictNullChecks` are off.
- **Draco decoder** patched at runtime via monkey-patching `DRACOLoader2.prototype.preload` to force a local path (`assets/draco/`).
- **`assets/`** directory copied to `dist/assets/` at build time via `parcel-plugin-static-files-copy`.
- **Parcel v1 require map corruption workaround**: `ijewel-viewer.ts` must NOT import directly from `'webgi'`. Parcel v1 corrupts the `"webgi"` entry in this module's require map (producing an array instead of a string). The workaround is `src/webgi-re-exports.ts` — a re-export module that re-exports everything from `'webgi'`. `ijewel-viewer.ts` imports from `'./webgi-re-exports'` instead. If new webgi imports are needed in `ijewel-viewer.ts`, add them to `webgi-re-exports.ts` too. See `src/webgi-re-exports.ts` for the current export list.

## Architecture

- **Camera is static** — only `activeCameraDistance` changes (zoom). The ring model itself rotates via direct `ringModel.rotation` mutation in a `preFrame` listener.
- **Import options** (`LOCAL_IMPORT_OPTIONS`): `centerOffset: Vector3(0, 0.04, 2.8)` — tweaking this shifts the ring in view.
- **Material profiles** — two profiles (`metal` / `diamond`) are applied by traversing the scene and classifying meshes. Diamond detection uses a name regex (`/diamond|diamonds|gem|stone|solit.../i`) or bounding sphere radius `< 0.06`.
- **Uploaded GLB files** are patched via `patchGlbWithDiamondMetadata()` (in `src/webgiDiamondPatch.ts`) before import — injects `WEBGI_materials_diamond` extension into matching materials.
- **Global APIs** exposed on `window`: `loadRingSource(source: string | File)` and `loadRingFromPath(path: string)`.
- **SSAO** is active (`intensity: 0.25`).
- **Three.js renderer**: shadow maps enabled (`PCFSoftShadowMap`), `physicallyCorrectLights = true`, `outputEncoding = sRGB`, `toneMapping = ACESFilmic`, `toneMappingExposure = 1.2`.
- **Directional light** at `(5, 10, 7)` with `4096×4096` shadow map (bias `-0.0001`, normalBias `0.02`). **Ambient light** at `0.5` intensity.
- **Shadow floor**: `PlaneGeometry` + `ShadowMaterial` (`opacity: 0.35`) just below ring's bounding box. All ring meshes get `castShadow = receiveShadow = true` via traversal in `loadRingSource()`. Old floor is disposed on re-load.
- **Runtime config** via `window.WEBGI_VIEWER_CONFIG` — overrides model path, environment path, draco path, material defaults, zoom/vertical percentages, and background.

## Other tools in repo

| File | Purpose |
|------|---------|
| `ring-viewer.html` | Simple Three.js (CDN) viewer, no WebGI |
| `anchordiamond.html` | WebGI-based combiner with anchor diamond placement |
| `ring-combiner.html` | Visual GLB combiner (merge 3 files) |
| `glb-patcher.html` / `glb-patcher-tool.html` | Browser-based GLB diamond metadata patcher |
| `glb-patcher.js` | Node.js CLI for same |
| `anchorDiamondPlacement.ts` | `DiamondPlacementSystem` class — detects anchors (`MainAnchor`, `RND_SIDE_Anchor_*`), places diamond meshes |

## Stale docs

- `DOC.md` references a `shopify-bundle/` directory with Shopify liquid templates — these do **not** exist in the current repo.
- `README.md` says the default model is `assets/ring_webgi.glb` — the actual default in code is `assets/main.glb`.
