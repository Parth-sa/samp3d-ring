# 360° Ring Viewer

A simple offline WebGI-based viewer for displaying a 3D ring with full 360° rotation capabilities.

## Features

- **360° Ring Rotation**: Drag with mouse to rotate the ring in any direction
- **Zoom Controls**: Scroll to zoom in/out
- **Offline Ready**: Works completely offline after initial build
- **Clean UI**: Minimal, distraction-free interface
- **High Quality Rendering**: Uses WebGI for professional 3D visualization

## Installation

1. Copy the `ring_webgi.glb` file to the `assets/` directory from the original WebGI Jewelry project
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Development

```bash
npm start
```

Opens the viewer in development mode with hot reload.

### Production Build

```bash
npm run build
```

Creates an optimized offline build in the `dist/` directory.

## Controls

- **Left Mouse Drag**: Rotate the ring (360° view)
- **Scroll**: Zoom in/out
- **Window Resize**: Responsive canvas scaling

## Project Structure

```
webgi-ring-360-viewer/
├── index.html          # Main HTML file
├── src/
│   └── index.ts       # WebGI viewer setup and controls
├── assets/
│   └── ring_webgi.glb # 3D ring model
├── package.json
├── tsconfig.json
└── Readme.md
```
