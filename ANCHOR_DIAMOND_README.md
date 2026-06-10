# Ring Combiner & Diamond Placement System

## Overview

This system allows you to:
1. **Combine 3 GLB files** (Ring + Diamond + PRNC) into one final ring
2. **Place diamonds** automatically using anchor objects

## Files Provided

### Your 3 GLB Files:
1. `Ring_501410_JV_PRN_100.glb` - Base ring model
2. `RND.glb` - Diamond/round stone component
3. `PRNC.glb` - PRNC component

## Quick Start

### Option 1: Visual Combiner (Recommended)
```bash
npm run start:combiner
```
Then drag and drop the 3 GLB files onto the page.

### Option 2: Command Line Merge
```bash
# Run the batch script:
merge-ring.bat "C:\path\to\Ring_501410_JV_PRN_100.glb" "C:\path\to\RND.glb" "C:\path\to\PRNC.glb" "final_ring.glb"

# Or with Node.js:
node glb-ring-merger.js "ring.glb" "diamond.glb" "prnc.glb" "output.glb"
```

## How to Use

### Step 1: Load All 3 Files
1. Open `ring-combiner.html` in browser (via `npm run start:combiner`)
2. Drag `Ring_501410_JV_PRN_100.glb` to slot 1
3. Drag `RND.glb` to slot 2
4. Drag `PRNC.glb` to slot 3

### Step 2: Adjust Positioning
Use the transform controls:
- **Position X/Y/Z** - Move the component in 3D space
- **Rotate X/Y/Z** - Rotate the component
- **Scale** - Enlarge/shrink the component

Select which component to adjust using the tabs (Ring, Diamond, PRNC).

### Step 3: Preview
Use view buttons (Front, Top, Angle, ISO) to check alignment.

### Step 4: Export
Click "Merge & Export Final Ring" to create the combined GLB.

## Command Line Usage

### Basic merge:
```bash
node glb-ring-merger.js "Ring_501410_JV_PRN_100.glb" "RND.glb" "PRNC.glb" "final_ring.glb"
```

### With custom positions:
```bash
node glb-ring-merger.js "ring.glb" "diamond.glb" "prnc.glb" "output.glb" --diamond-pos 0 0.5 0 --prnc-pos 0 0 0
```

## Anchor-Based Diamond Placement

If your ring model has anchor objects, you can use the anchor system:

### Anchor Naming:
- `MainAnchor` - Center diamond position
- `RND_SIDE_Anchor_*` - Side diamond positions

### Run anchor diamond page:
```bash
npm run start:anchor
```

## Troubleshooting

### Models not aligning?
- Adjust X/Y/Z position for each component
- Try different rotation values
- Check if scale needs adjustment

### Diamond material looks wrong?
- Diamond uses special PBR material with transmission
- Metalness should be 0, roughness 0.01

### Export failed?
- Ensure all 3 files are loaded
- Check browser console for errors

## Best Practices

1. Start with default positions
2. Adjust one component at a time
3. Use the Top view to check vertical alignment
4. Use the Angle view for final review
5. Export and test in main viewer

## Files Created

- `ring-combiner.html` - Visual merge interface
- `anchordiamond.html` - Anchor-based diamond placement
- `glb-ring-merger.js` - Node.js command line tool
- `merge-ring.bat` - Windows batch script
- `src/anchorDiamondPlacement.ts` - TypeScript module
