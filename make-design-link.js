// make-design-link.js <glb-filename> [design-name] [shape] [carat] [color] [clarity] [stoneType] [metalType] [metalColor]
// Generates a ring-editor deep link (same encoding the editor's Share button produces).
// Defaults mirror the LRS-02 config defaults (the look the user's original link renders).
// Example: node make-design-link.js LR-12-v2.glb "Loria Solitaire" Marquise 1.2 D VVS1 "Natural Diamond" 18K Platinum
const glb = process.argv[2] || 'LR-12-v2.glb'
const name = process.argv[3] || 'Loria Solitaire'
const shape = process.argv[4] || 'Marquise'
const carat = parseFloat(process.argv[5] || '1.2')
const color = process.argv[6] || 'D'
const clarity = process.argv[7] || 'VVS1'
const stoneType = process.argv[8] || 'Natural Diamond'
const metalType = process.argv[9] || '18K'
const metalColor = process.argv[10] || 'Platinum'

const design = {
  configId: 'LRS-02',
  model: './assets/' + glb,
  name,
  components: {
    center: { stoneType, shape, carat, color, clarity },
    band: { metalType, metalColor },
  },
  exportedAt: new Date().toISOString(),
}

// Mirror shareDesign(): single encodeURIComponent, then URLSearchParams.set() re-encodes the % in it.
const url = new URL('https://ring-options.pages.dev/ring-editor')
url.searchParams.set('design', encodeURIComponent(JSON.stringify(design)))
url.searchParams.set('model', 'assets/' + glb) // force model load (LR-12 has no DEFAULT_CONFIGS entry)
url.searchParams.set('standalone', '')
url.searchParams.set('v', String(Date.now()))

// Round-trip check through the editor's own decode path.
const decoded = JSON.parse(decodeURIComponent(url.searchParams.get('design')))
console.log('OK design decodes:', decoded.model, '-', decoded.components.center.shape)
console.log(url.toString())