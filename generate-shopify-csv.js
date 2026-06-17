// Generates a Shopify product-import CSV: one product per diamond shape,
// variants = Metal x Carat. Prices are PLACEHOLDERS — edit before/after import.
// Run: node generate-shopify-csv.js  ->  shopify-products.csv
const fs = require('fs')

// Active Shopify products — one per diamond shape (all 7 catalog shapes)
const SHAPES = [
  { id: 'RD', name: 'Round' },
  { id: 'OV', name: 'Oval' },
  { id: 'PR', name: 'Princess' },
  { id: 'EM', name: 'Emerald' },
  { id: 'MQ', name: 'Marquise' },
  { id: 'PE', name: 'Pear' },
  { id: 'RA', name: 'Radiant' },
]
const METALS = ['White Gold', 'Yellow Gold', 'Rose Gold', 'Platinum']
const CARATS = ['0.50', '0.75', '1.00', '1.50', '2.00', '3.00']

// Placeholder pricing — base by carat, x metal factor. EDIT THESE.
const CARAT_BASE = { '0.50': 800, '0.75': 1200, '1.00': 2000, '1.50': 3500, '2.00': 6000, '3.00': 12000 }
const METAL_FACTOR = { 'White Gold': 1.0, 'Yellow Gold': 1.0, 'Rose Gold': 1.0, 'Platinum': 1.3 }

const COLS = [
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
  'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
  'Variant SKU', 'Variant Inventory Tracker', 'Variant Inventory Policy',
  'Variant Fulfillment Service', 'Variant Price', 'Variant Requires Shipping',
  'Variant Taxable', 'Status',
]
const esc = (s) => /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s)

const rows = [COLS.join(',')]
for (const shape of SHAPES) {
  const handle = `custom-${shape.name.toLowerCase()}-diamond-ring`
  const title = `Custom ${shape.name} Diamond Engagement Ring`
  const body = `Customisable ${shape.name}-cut diamond ring. Choose metal, carat, setting & engraving in the 3D builder.`
  let first = true
  for (const metal of METALS) {
    for (const carat of CARATS) {
      const price = Math.round(CARAT_BASE[carat] * METAL_FACTOR[metal])
      const sku = `${shape.id}-${metal.replace(/\s/g, '').toUpperCase()}-${carat}`
      // Inventory Tracker blank = "Don't track" → variants are always
      // purchasable (made-to-order rings, no stock counts).
      const r = first
        ? [handle, title, body, 'Your Brand', 'Ring', `ring,${shape.name},custom`, 'TRUE',
           'Metal', metal, 'Carat', carat, sku, '', 'continue', 'manual', price, 'TRUE', 'TRUE', 'active']
        : [handle, '', '', '', '', '', '', '', metal, '', carat, sku, '', 'continue', 'manual', price, 'TRUE', 'TRUE', '']
      rows.push(r.map(esc).join(','))
      first = false
    }
  }
}

fs.writeFileSync('shopify-products.csv', rows.join('\n'))
console.log(`Wrote shopify-products.csv — ${SHAPES.length} products, ${METALS.length * CARATS.length} variants each (${rows.length - 1} rows)`)
