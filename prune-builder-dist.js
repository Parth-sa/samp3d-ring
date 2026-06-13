// Removes files the ring builder doesn't need from dist-ring-builder/ so the
// Shopify deploy folder stays small (~164 MB instead of ~459 MB).
// Run automatically after `npm run build:builder`.
const fs = require('fs')
const path = require('path')

const DIST = path.join(__dirname, 'dist-ring-builder')

// Encrypted heads (unloadable) + unused full-scene models — the builder only
// needs assets/signi/{sigli headss, sigli bands, sigli Shanks}
const REMOVE = [
    'assets/signi/sigli',
    'assets/signi/mix 3 file',
    'assets/all glb',
    'assets/mainnnnn (1).glb',
    'assets/mainnnnn.glb',
    'assets/main.glb',
    'assets/ring_fixed.glb',
    'assets/ring_webgi.glb',
]

if (!fs.existsSync(DIST)) {
    console.error('dist-ring-builder/ not found — run `npm run build:builder` first.')
    process.exit(1)
}

for (const rel of REMOVE) {
    const p = path.join(DIST, rel)
    if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); console.log('removed', rel) }
}

// Drop sourcemaps (not needed in production, ~5 MB each)
for (const f of fs.readdirSync(DIST)) {
    if (f.endsWith('.js.map')) { fs.rmSync(path.join(DIST, f)); console.log('removed', f) }
}

// Remove any stale hashed JS bundle the current HTML no longer references
const html = fs.readFileSync(path.join(DIST, 'ring-builder.html'), 'utf8')
const current = (html.match(/ring-builder\.[a-f0-9]+\.js/) || [])[0]
for (const f of fs.readdirSync(DIST)) {
    if (/^ring-builder\.[a-f0-9]+\.js$/.test(f) && f !== current) {
        fs.rmSync(path.join(DIST, f)); console.log('removed stale bundle', f)
    }
}

// Cloudflare Pages / most static hosts serve index.html at the root URL.
// Our entry is ring-builder.html, so copy it to index.html — otherwise the
// site root (e.g. ring-builder.pages.dev/) shows a 404. Same folder, so the
// bundled ./ring-builder.<hash>.js and ./assets/ references still resolve.
fs.copyFileSync(path.join(DIST, 'ring-builder.html'), path.join(DIST, 'index.html'))
console.log('wrote index.html (copy of ring-builder.html)')

console.log('Prune complete. Deploy folder: dist-ring-builder/')
