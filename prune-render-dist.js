// Trims dist-render/ for deploy: the render tool takes uploaded GLBs, so it
// needs NONE of the catalog ring GLBs — only the env maps, draco decoder, and
// its JS bundle. Also writes index.html so the Cloudflare root URL works.
const fs = require('fs')
const path = require('path')
const DIST = path.join(__dirname, 'dist-render')

if (!fs.existsSync(DIST)) { console.error('dist-render/ not found — run `npm run build:render` first.'); process.exit(1) }

// Catalog rings + bulky unused models — not needed by the render tool
const REMOVE = [
    'assets/signi', 'assets/all glb',
    'assets/main.glb', 'assets/mainnnnn.glb', 'assets/mainnnnn (1).glb',
    'assets/ring_fixed.glb', 'assets/ring_webgi.glb',
]
for (const rel of REMOVE) {
    const p = path.join(DIST, rel)
    if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); console.log('removed', rel) }
}

// Drop sourcemaps + stale hashed bundles the current HTML no longer references
for (const f of fs.readdirSync(DIST)) {
    if (f.endsWith('.js.map')) { fs.rmSync(path.join(DIST, f)); console.log('removed', f) }
}
const html = fs.readFileSync(path.join(DIST, 'render.html'), 'utf8')
const current = (html.match(/render\.[a-f0-9]+\.js/) || [])[0]
for (const f of fs.readdirSync(DIST)) {
    if (/^render\.[a-f0-9]+\.js$/.test(f) && f !== current) { fs.rmSync(path.join(DIST, f)); console.log('removed stale bundle', f) }
}

// Root URL → render tool
fs.copyFileSync(path.join(DIST, 'render.html'), path.join(DIST, 'index.html'))
console.log('wrote index.html')
console.log('Prune complete. Deploy folder: dist-render/')
