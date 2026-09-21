// strip-lights.js — removes meshes whose material name is 'Lights' from a GLB,
// so the editor's bounding-box camera fit hugs the actual head instead of light fixtures.
// Usage: node strip-lights.js input.glb output.glb
const fs = require('fs')
const src = process.argv[2]
const dst = process.argv[3]
if (!src || !dst) { console.error('usage: node strip-lights.js in.glb out.glb'); process.exit(1) }

const buf = fs.readFileSync(src)
if (buf.readUInt32LE(0) !== 0x46546c67) { console.error('not a GLB'); process.exit(1) }
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))

const mats = json.materials || []
const lightsMatIdx = new Set()
mats.forEach((m, i) => { if ((m.name || '').toLowerCase().includes('lights')) lightsMatIdx.add(i) })
if (!lightsMatIdx.size) { console.log('no Lights materials found — nothing to strip'); process.exit(0) }

const lightsMeshIdx = new Set()
;(json.meshes || []).forEach((m, i) => {
    const prims = (m.primitives || []).filter(p => p && p.material !== undefined && lightsMatIdx.has(p.material))
    if (prims.length) lightsMeshIdx.add(i)
})
if (!lightsMeshIdx.size) { console.log('no meshes use Lights materials — nothing to strip'); process.exit(0) }

const removedNodes = new Set()
const nodes = (json.nodes || []).filter((n, i) => {
    if (lightsMeshIdx.has(n.mesh)) { removedNodes.add(i); return false }
    return true
})
const indexMap = new Map()
const oldNodes = json.nodes || []
let cursor = 0
for (let i = 0; i < oldNodes.length; i++) {
    if (removedNodes.has(i)) continue
    indexMap.set(i, cursor++)
}
nodes.forEach(n => { if (Array.isArray(n.children)) n.children = n.children.filter(c => !removedNodes.has(c)).map(c => indexMap.get(c)) })
json.nodes = nodes

;(json.scenes || []).forEach(sc => { if (Array.isArray(sc.nodes)) sc.nodes = sc.nodes.filter(c => !removedNodes.has(c)).map(c => indexMap.get(c)) })

const outJson = Buffer.from(JSON.stringify(json), 'utf8')
const binStart = 20 + jsonLen
const bin = buf.slice(binStart + 8)
const newLen = 12 + 8 + outJson.length + 8 + bin.length
const out = Buffer.alloc(newLen)
buf.copy(out, 0, 0, 12)
out.writeUInt32LE(newLen, 8)
out.writeUInt32LE(outJson.length, 12)
out.write('JSON', 16, 4, 'ascii')
outJson.copy(out, 20)
out.writeUInt32LE(bin.length, 20 + outJson.length)
out.write('BIN\0', 24 + outJson.length, 4, 'ascii')
bin.copy(out, 28 + outJson.length)
fs.writeFileSync(dst, out)
console.log('stripped ' + lightsMatIdx.size + ' Lights material + ' + lightsMeshIdx.size + ' meshes + ' + removedNodes.size + ' nodes → ' + dst + ' (' + out.length + ' bytes)')