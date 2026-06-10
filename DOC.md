# WebGI Jewelry Viewer - Documentation

A professional 3D jewelry viewer powered by WebGI, supporting both standalone offline usage and Shopify integration.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Standalone Usage](#standalone-usage)
- [Shopify Integration](#shopify-integration)
- [Configuration](#configuration)
- [Material Editor](#material-editor)
- [API Reference](#api-reference)
- [GLB Patching](#glb-patching)
- [Troubleshooting](#troubleshooting)

---

## Overview

This project provides a WebGI-based 3D viewer for jewelry products, with automatic diamond material detection and customizable metal/diamond rendering. It can be used as a standalone viewer or integrated into Shopify stores.

---

## Features

### Core Features
- **360° Object Rotation** - Drag with mouse to rotate the model
- **Zoom Controls** - Scroll to zoom in/out
- **Diamond Detection** - Automatically detects and enhances diamond/gem meshes
- **Metal Rendering** - Configurable metal material properties
- **HDR Environment** - Professional lighting with environment maps
- **Offline Support** - Works completely offline after build

### Rendering Plugins
- Progressive rendering for smooth loading
- Screen Space Reflections (SSR)
- Screen Space Ambient Occlusion (SSAO)
- Bloom effects
- Temporal Anti-Aliasing
- Diamond material simulation

### Editor Features
- Real-time metal property adjustment (color, metalness, roughness, reflections)
- Real-time diamond property adjustment (IOR, transmission, thickness, sparkle)
- Drag-and-drop GLB file loading
- Material profile preview

---

## Project Structure

```
webgi-ring-360-viewer/
├── index.html              # Standalone viewer HTML
├── src/
│   ├── index.ts           # Main viewer implementation
│   └── webgiDiamondPatch.ts # GLB diamond metadata patching
├── assets/
│   ├── main.glb           # Default 3D model
│   ├── map.hdr            # HDR environment map
│   └── draco_decoder.js   # Draco mesh compression decoder
├── shopify-bundle/        # Shopify integration files
│   ├── assets/
│   │   ├── webgi-viewer.js    # Compiled viewer
│   │   ├── webgi-viewer.css   # Viewer styles
│   │   ├── main.glb          # Model file
│   │   ├── map.hdr           # Environment map
│   │   └── draco_decoder.js  # Draco decoder
│   ├── sections/
│   │   └── webgi-product-viewer.liquid  # Shopify section
│   └── snippets/
│       └── webgi-product-viewer.liquid # Shopify snippet
├── package.json
└── tsconfig.json
```

---

## Installation

### Standalone Project

```bash
# Install dependencies
npm install

# Place your 3D model in assets/
# Default model path: assets/main.glb
```

### Shopify Installation

1. **Upload Assets to Shopify**
   - Go to Shopify Admin > Themes > Edit code
   - Upload these files to `assets/`:
     - `webgi-viewer.js`
     - `webgi-viewer.css`
     - `main.glb`
     - `map.hdr`
     - `draco_decoder.js`

2. **Add Section Files**
   - Upload `sections/webgi-product-viewer.liquid`
   - (Optional) Upload `snippets/webgi-product-viewer.liquid`

3. **Add Product 3D Models**
   - In Shopify Admin > Products > Your Product
   - Add a 3D model (.glb) in the Media section

---

## Standalone Usage

### Development Mode

```bash
npm start
```

Opens the viewer at `http://localhost:1234` with hot reload.

### Production Build

```bash
npm run build
```

Creates an optimized build in the `dist/` directory.

### Loading a Custom Model

The viewer accepts a `model` URL parameter:

```
http://localhost:1234/?model=./assets/my-ring.glb
```

---

## Shopify Integration

### Method 1: Section (Recommended)

Add the section to any page via Theme Customizer:

1. Go to **Shopify Admin > Themes > Customize**
2. Add section > **WebGI Product Viewer**
3. Assign products with 3D models

### Method 2: Snippet

Include in product templates:

```liquid
{% section 'webgi-product-viewer' %}
```

Or use the snippet directly:

```liquid
{% render 'webgi-product-viewer' %}
```

### Configuration

Update asset URLs in the section file:

```liquid
window.WEBGI_VIEWER_CONFIG = {
  modelPath: {{ model_url | json }},
  environmentPath: "https://your-store.com/assets/map.hdr",
  dracoDecoderPath: "https://your-store.com/assets/"
};
```

---

## Configuration

### Viewer Configuration (window.WEBGI_VIEWER_CONFIG)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `modelPath` | string | `./assets/main.glb` | Path to the 3D model |
| `dracoDecoderPath` | string | `./assets/draco/` | Path to Draco decoder |
| `environmentPath` | string | `./assets/map.hdr` | Path to HDR environment map |

### Material Profile Defaults

```typescript
const materialProfile = {
  metal: {
    color: '#d4af37',      // Gold color
    metalness: 1,          // Full metalness
    roughness: 0,       // Polished finish
    envMapIntensity: 2.2    // Strong reflections
  },
  diamond: {
    color: '#ffffff',      // White diamond
    transmission: 1,       // Fully transparent
    ior: 2.6,              // Diamond IOR
    thickness: 0.55,        // Material thickness
    sparkle: 1.3           // Environment reflection
  }
}
```

---

## Material Editor

### Metal Properties

| Property | Range | Default | Description |
|----------|-------|---------|-------------|
| Color | hex | `#d4af37` | Metal base color |
| Metalness | 0-1 | 1 | Metalness coefficient |
| Roughness | 0-1 | 0 | Surface roughness |
| Reflection | 0-5 | 2.2 | Environment map intensity |

### Diamond Properties

| Property | Range | Default | Description |
|----------|-------|---------|-------------|
| Tint | hex | `#ffffff` | Diamond tint color |
| Transmission | 0-1 | 1 | Light transmission |
| IOR | 1-3 | 2.6 | Index of refraction |
| Thickness | 0-2 | 0.55 | Material thickness |
| Sparkle | 0-5 | 1.3 | Reflection intensity |

---

## API Reference

### Global Functions

#### `loadRingSource(source: string | File)`
Loads a 3D model into the viewer.

```typescript
// Load from path
window.loadRingFromPath('./assets/my-ring.glb');

// Load from File object
const fileInput = document.getElementById('glb-input');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    await window.loadRingSource(file);
  }
});
```

---

## GLB Patching

The viewer automatically patches uploaded GLB files with diamond material metadata using the `WEBGI_materials_diamond` extension.

### Detection Criteria

Materials are identified as diamonds if:
1. The mesh/material name matches: `diamond`, `diamonds`, `gem`, `stone`, `solit`, `soliter`, `brilliant`, `brillant`, `cz`, `moissanite`
2. The geometry bounding sphere radius is < 0.06 units

### Manual Patching

```typescript
import { patchGlbWithDiamondMetadata } from './webgiDiamondPatch';

const fileInput = document.getElementById('glb-input');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    const patchedFile = await patchGlbWithDiamondMetadata(file);
    // Use patchedFile for import
  }
});
```

---

## Controls

| Action | Input | Description |
|--------|-------|-------------|
| Rotate | Left mouse drag | Rotate model in 3D space |
| Zoom | Mouse scroll | Zoom in/out |
| Load model | Drop/select GLB | Replace current model |

---

## Troubleshooting

### Common Issues

**Model not loading**
- Ensure the GLB file is valid and not corrupted
- Check browser console for errors
- Verify the file path is correct

**Diamond not rendering correctly**
- Check if mesh name contains diamond-related keywords
- Verify the geometry size is within detection bounds (< 0.06 units radius)
- Ensure environment map is loaded

**Draco decoder errors**
- Verify `draco_decoder.js` is in the correct location
- Check that the filename matches exactly: `draco_decoder.js`

**Shopify: Model not found**
- Ensure the product has a 3D model uploaded in the Media section
- Verify the section is added to a page with products containing 3D models

### Error Banner

The viewer displays error messages in a red banner at the top-right. Check the console for detailed stack traces.

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires WebGL 2.0 support.

---

## License

See project repository for license information.
