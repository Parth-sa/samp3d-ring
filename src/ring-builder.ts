import {
    ViewerApp,
    AssetManagerPlugin,
    GBufferPlugin,
    ProgressivePlugin,
    TonemapPlugin,
    SSAOPlugin,
    EXRLoadPlugin,
    ContactShadowGroundPlugin,
    DiamondPlugin,
    Mesh,
    Vector3,
    Box3,
    Color,
    DirectionalLight,
    AmbientLight,
    PlaneGeometry,
    ShadowMaterial,
    DRACOLoader2,
    FrameFadePlugin,
    TemporalAAPlugin,
    RandomizedDirectionalLightPlugin,
    TorusGeometry,
    MeshStandardMaterial,
    CanvasTexture,
    Matrix4,
    DoubleSide,
    Rhino3dmLoader2,
} from './webgi-re-exports'
import { patchGlbWithDiamondMetadata } from './webgiDiamondPatch'

// Patch three.js r144+ removed methods needed by webgi's bundled code
const _obj3dProto = Object.getPrototypeOf(Mesh.prototype)
if (typeof _obj3dProto.updateWorldMatrix !== 'function') {
    _obj3dProto.updateWorldMatrix = function (updateParents: boolean, updateChildren: boolean) {
        const parent = this.parent
        if (updateParents === true && parent !== null) parent.updateWorldMatrix(true, false)
        this.updateMatrix()
        this.matrixWorld.copy(this.matrix)
        if (updateChildren === true) {
            for (let i = 0, l = this.children.length; i < l; i++) this.children[i].updateWorldMatrix(false, true)
        }
    }
    _obj3dProto.updateMatrix = function () {
        this.matrix.compose(this.position, this.quaternion, this.scale)
        this.matrixWorldNeedsUpdate = true
    }
}

// 'sigli' heads are AES-encrypted (WebGiGLBWrapper) — use the unencrypted Draco set
const HEADS_BASE = './assets/signi/sigli headss'
const BANDS_BASE = './assets/signi/sigli bands'
const SHANKS_BASE = './assets/signi/sigli Shanks'
// Two separate environments (iJewel-style): scene env lights the metal,
// DiamondPlugin gets its own env map for gem sparkle
const DEFAULT_METAL_ENV_PATH = './assets/env_metal_001.hdr'
const DEFAULT_GEM_ENV_PATH = './assets/env_gem_002.exr'
// iJewel's signature neutral backdrop (the bg_bone image is a flat #f4f4eb)
// Pure white background — matches iJewel's 1_bg_white (a flat #FFFFFF fill).
const BG_BONE_COLOR = '#ffffff'
// Ground plane size = maxDim * this (bigger = wider shadow plane under the ring)
const GROUND_SIZE_FACTOR = 2.6
// Camera looks down at the ring by this amount (cameraY = zoom * this) so the
// floor + contact shadow are visible, like iJewel's slightly-elevated view.
const CAM_ELEVATION = 0.22

// Exact iJewel.design values (from their .pmat files): polished metals are
// roughness 0 (mirror), metalness 1, reflectivity 0.5. The three golds use
// iJewel's precise colors; the rest follow the same polished recipe.
const METAL_PRESETS = [
    { id: 'whiteGold', label: 'White Gold', color: '#c2c2c3', metalness: 1, roughness: 0, reflectivity: 0.5, envIntensity: 1.6 },
    { id: 'yellowGold', label: 'Yellow Gold', color: '#eec064', metalness: 1, roughness: 0, reflectivity: 0.5, envIntensity: 1.6 },
    { id: 'roseGold', label: 'Rose Gold', color: '#e7a39c', metalness: 1, roughness: 0, reflectivity: 0.5, envIntensity: 1.6 },
    { id: 'platinum', label: 'Platinum', color: '#d6d6d9', metalness: 1, roughness: 0.02, reflectivity: 0.5, envIntensity: 1.7 },
]

const SHAPE_ICONS: Record<string, string> = {
    RD: '⬤', OV: '⬮', EM: '⬡', PE: '🍐', PR: '◈', RA: '🔶', MQ: '◆',
}

const METAL_ICONS: Record<string, string> = {
    yellowGold: '🟡', whiteGold: '⬜', roseGold: '🩰', platinum: '◻️', silver: '🤍', gold_14k: '💛',
}

const DIAMOND_NAME_RE = /diamond|diamonds|gem|stone|solit(er|a)|soliter|brilliant|brillant|cz|moissanite|ruby|sapphire|emerald/i

// Diamond profile from the proven 360 viewer (src/index.ts) — these values
// drive WebGI's DiamondMaterial via the WEBGI_materials_diamond extension
const DIAMOND_PROFILE = {
    color: '#ffffff',
    envMapIntensity: 2.0,
    envMapRotation: 0,
    dispersion: 0.015,
    squashFactor: 0.98,
    geometryFactor: 0.5,
    gammaFactor: 1.2,
    absorptionFactor: 0.4,
    reflectivity: 0.7,
    transmission: 0.92,
    refractiveIndex: 2.6,
    rayBounces: 6,
    diamondOrientedEnvMap: 0,
    boostFactors: [1.0, 1.0, 1.0] as [number, number, number],
}

interface CatEntry { file: string; prong?: string; shape?: string; sizeStr?: string; size?: number; style?: string; type?: string }
interface Catalog {
    shapes: { id: string; label: string }[]
    prongs: { id: string; label: string }[]
    sizes: string[]
    bandStyles: { id: string; label: string }[]
    shankStyles: { id: string; label: string }[]
    allHeads: CatEntry[]
    allBands: CatEntry[]
    allShanks: CatEntry[]
}

let viewer: ViewerApp
let ringModel: any = null
let diamondPluginInstance: any = null
let catalog: Catalog
let modelLoaded = false
let isBuilding = false
let usingCustomModel = false
let firstBuildDone = false

let isRotating = false
let lastX = 0; let lastY = 0
let lastPinchDist = 0   // mobile pinch-to-zoom
// Smooth (damped) motion: input writes target*, preFrame eases current toward it
let rotationX = -0.05; let rotationY = 0; let rotationZ = 0
let targetRotationX = -0.05; let targetRotationY = 0; let targetRotationZ = 0
let cameraZoom = 5; let targetZoom = 5
let zoomMin = 2; let zoomMax = 15
let autoRotate = false
let autoRotateSpeed = 0.4
let shadowOpacity = 1.0
const SMOOTHING = 0.12
let metalEnvironment: any = null
let gemEnvironment: any = null
let tonemapPlugin: any = null
let groundPlugin: any = null
let groundEnabled = true
// ── Hand mode: the configured ring is shown on a 3D hand (assets/hand.glb) ──
let handResult: any = null
let handRoot: any = null
let handSampleCenter = new Vector3()   // where the file's sample ring sits (hand-local)
let handSampleDim = 1                   // sample ring size (hand units) → auto scale
// Live-tunable placement (window.__ringBuilder.hand). Offsets are in ring-size units.
const hand = { enabled: true, scale: 1, posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0 }
let metalEnvIntensity = 1.0
let metalEnvRotationDeg = 0

// Live-tunable metal values (right panel) — initialised from the selected preset
const metalProfile = { color: '#c2c2c3', metalness: 1, roughness: 0, reflectivity: 0.5, envIntensity: 1.6 }

const state: Record<string, string> = {
    shape: '', size: '', prong: '', band: '', shank: '', metal: 'whiteGold',
    fingerSize: '7', engraving: '', engravingFont: 'script',
}

// US ring (finger) sizes — line-item property, not a Shopify variant
const FINGER_SIZES = ['4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '11', '12']

const ENGRAVING_FONTS = [
    { id: 'script', label: 'Script', css: "'Segoe Script', 'Brush Script MT', cursive", glyph: 'Aa' },
    { id: 'serif', label: 'Serif', css: "Georgia, 'Times New Roman', serif", glyph: 'Aa' },
    { id: 'sans', label: 'Sans', css: "'Segoe UI', Arial, sans-serif", glyph: 'Aa' },
    { id: 'block', label: 'Block', css: "'Arial Black', Impact, sans-serif", glyph: 'AB' },
]
const ENGRAVING_MAX = 20

function byId(id: string) { return document.getElementById(id) as HTMLElement }
function setStatus(msg: string, isError = false) {
    const el = byId('status-text')
    if (el) { el.textContent = msg; el.style.color = isError ? '#a12d2d' : '' }
}
function setError(msg: string) {
    const el = byId('error-banner')
    if (!el) return
    el.textContent = msg; el.hidden = false
    setTimeout(() => { el.hidden = true }, 6000)
}
function setLoader(msg: string) {
    const el = byId('loader')
    if (el) { el.classList.remove('hidden'); const p = el.querySelector('p'); if (p) p.textContent = msg }
}
function hideLoader() { byId('loader')?.classList.add('hidden') }
function canvasFade(faded: boolean) {
    const c = byId('webgi-canvas') as HTMLCanvasElement | null
    if (!c) return
    if (!c.style.transition) c.style.transition = 'opacity 0.45s ease'
    c.style.opacity = faded ? '0.15' : '1'
}
function linColor(hex: string) { return new Color(hex).convertSRGBToLinear() }

function patchDraco() {
    const proto = (DRACOLoader2 as any)?.prototype
    if (!proto || proto.__localPatched) return
    const orig = proto.preload
    if (typeof orig !== 'function') return
    proto.preload = function (...args: any[]) {
        try { this.setDecoderPath('assets/draco/'); this.setDecoderConfig({ type: 'js' }) } catch {}
        return orig.apply(this, args)
    }
    proto.__localPatched = true
}

async function importEnvTexture(src: string | File): Promise<any> {
    const manager = viewer.getPlugin(AssetManagerPlugin) as any
    if (!manager) return null
    try {
        const env = src instanceof File
            ? await manager.importer.importSingle({ path: src.name, file: src })
            : await manager.importer.importSinglePath(src)
        if (env && env.assetType === 'texture') return env
    } catch (e) { console.warn('Environment import failed for', src, e) }
    return null
}

function renderRefresh() {
    const pp = viewer.getPlugin?.(ProgressivePlugin) as any
    if (pp && typeof pp.reset === 'function') pp.reset()
    try { (viewer.renderer as any).refreshPipeline() } catch {}
    viewer.setDirty()
}

// Scene environment — lights the metal (and everything except diamonds)
async function setMetalEnvironment(src: string | File) {
    const env = await importEnvTexture(src)
    if (!env) { setError('Failed to load metal environment'); return }
    await viewer.scene.setEnvironment(env)
    metalEnvironment = env
    applyMetalEnvSettings()
    renderRefresh()
}

// Scene env brightness/rotation live on the scene, not on the texture.
// envMapIntensity auto-calls refreshEnvMapIntensity across all materials.
function applyMetalEnvSettings() {
    const scene: any = viewer?.scene
    if (!scene) return
    scene.envMapIntensity = metalEnvIntensity
    if (typeof scene.refreshEnvMapIntensity === 'function') scene.refreshEnvMapIntensity()
    if (metalEnvironment) (metalEnvironment as any).rotation = metalEnvRotationDeg * (Math.PI / 180)
}

// DiamondPlugin env map — drives gem sparkle independently of the scene env
async function setGemEnvironment(src: string | File) {
    const env = await importEnvTexture(src)
    if (!env) { setError('Failed to load diamond environment'); return }
    gemEnvironment = env
    if (diamondPluginInstance) {
        diamondPluginInstance.envMap = env
        diamondPluginInstance.forceSceneEnvMap = false
        if (typeof diamondPluginInstance.refreshEnvMaps === 'function')
            diamondPluginInstance.refreshEnvMaps()
    }
    renderRefresh()
}

async function loadDefaultEnvironments() {
    // Wait a frame to let AssetManagerPlugin initialize its loaders
    await new Promise<void>(r => requestAnimationFrame(() => r()))
    await setMetalEnvironment(DEFAULT_METAL_ENV_PATH)
    await setGemEnvironment(DEFAULT_GEM_ENV_PATH)
    // If the gem EXR failed (e.g. loader missing), share the metal env
    if (!gemEnvironment && metalEnvironment) await setGemEnvironment(DEFAULT_METAL_ENV_PATH)
}

function getRingRoot() {
    if (!ringModel) return null
    if ((ringModel as any).modelObject) return (ringModel as any).modelObject
    if ((ringModel as any).scene) return (ringModel as any).scene
    return ringModel
}

// ── 3D engraving on the band ───────────────────────────────────────────
// A thin partial torus textured with the engraving text, parented to the
// ring root so it rotates with the ring and sits on the band's surface.
let engravingMesh: any = null
// Band circle lies in the model-local XY plane (normal Z); the head inflates
// +Y so the band centre is below the bbox centre. The text arc is a partial
// torus in that plane, auto-rotated so its middle sits at the bottom (6 o'clock).
// radiusScale hugs the band; rotZ is a fine offset. Tunable via __ringBuilder.eng3d.
const eng3d = { radiusScale: 0.92, tube: 0.12, arc: 1.0, rotZ: 0, yOff: 0 }

function computeLocalRingBox(root: any): { center: Vector3; size: Vector3 } {
    const box = new Box3()
    const inv = new Matrix4().copy(root.matrixWorld).invert()
    const v = new Vector3()
    root.traverse((c: any) => {
        if (!c.geometry || c === engravingMesh) return
        if (!c.geometry.boundingBox && c.geometry.computeBoundingBox) c.geometry.computeBoundingBox()
        const bb = c.geometry.boundingBox
        if (!bb) return
        for (let i = 0; i < 8; i++) {
            v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
            v.applyMatrix4(c.matrixWorld).applyMatrix4(inv)
            box.expandByPoint(v)
        }
    })
    return { center: box.getCenter(new Vector3()), size: box.getSize(new Vector3()) }
}

function makeEngravingTexture(text: string, fontCss: string) {
    const canvas = document.createElement('canvas')
    canvas.width = 2048; canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#1a1206'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    let size = 170
    do { ctx.font = `${size}px ${fontCss}`; if (ctx.measureText(text).width <= canvas.width * 0.92) break; size -= 6 } while (size > 30)
    ctx.font = `${size}px ${fontCss}`
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 6)
    const tex = new CanvasTexture(canvas)
    ;(tex as any).anisotropy = 8
    tex.needsUpdate = true
    return tex
}

function removeEngraving3D() {
    if (!engravingMesh) return
    engravingMesh.parent?.remove(engravingMesh)
    engravingMesh.geometry?.dispose?.()
    engravingMesh.material?.map?.dispose?.()
    engravingMesh.material?.dispose?.()
    engravingMesh = null
}

function updateEngraving3D() {
    removeEngraving3D()
    const root = getRingRoot()
    if (!root || !modelLoaded || !state.engraving.trim()) { viewer?.setDirty(); return }
    const { center, size } = computeLocalRingBox(root)
    // Band diameter ≈ left-right extent (size.x); the head only inflates +Y.
    const ringRadius = size.x / 2
    const radius = ringRadius * eng3d.radiusScale
    // Band-circle centre sits at the bottom of the bbox + one radius up
    const yCenter = center.y - size.y / 2 + ringRadius + eng3d.yOff
    const fontCss = engravingFontCss(state.engravingFont)
    const tex = makeEngravingTexture(state.engraving, fontCss)
    const tubeR = ringRadius * eng3d.tube
    const geo = new TorusGeometry(radius, tubeR, 24, 256, eng3d.arc)
    const mat = new MeshStandardMaterial({ map: tex, transparent: true, metalness: 0, roughness: 0.5, side: DoubleSide })
    ;(mat as any).polygonOffset = true; (mat as any).polygonOffsetFactor = -1; (mat as any).polygonOffsetUnits = -1
    const mesh = new Mesh(geo, mat)
    mesh.position.set(center.x, yCenter, center.z)
    // Torus already lies in the band's XY plane; rotate within it so the arc
    // (which starts at +X) is centred at the bottom (-Y).
    mesh.rotation.set(0, 0, -Math.PI / 2 - eng3d.arc / 2 + eng3d.rotZ)
    mesh.name = 'engraving-3d'
    mesh.castShadow = false; mesh.receiveShadow = false
    root.add(mesh)
    engravingMesh = mesh
    viewer?.setDirty()
}

function applyMetal(mat: any) {
    if (!mat) return
    try {
        if ('color' in mat) mat.color = linColor(metalProfile.color)
        if ('metalness' in mat) mat.metalness = metalProfile.metalness
        if ('roughness' in mat) mat.roughness = metalProfile.roughness
        if ('envMapIntensity' in mat) mat.envMapIntensity = metalProfile.envIntensity
        if ('reflectivity' in mat) mat.reflectivity = metalProfile.reflectivity
        // iJewel polished metals have no clearcoat — keep the surface a clean mirror
        if ('clearcoat' in mat) mat.clearcoat = 0
        if ('specularIntensity' in mat) mat.specularIntensity = 1.0
        mat.needsUpdate = true
    } catch {}
}

function syncMetalProfileFromPreset(presetId: string) {
    const p = METAL_PRESETS.find(m => m.id === presetId) || METAL_PRESETS[0]
    metalProfile.color = p.color
    metalProfile.metalness = p.metalness
    metalProfile.roughness = p.roughness
    metalProfile.reflectivity = (p as any).reflectivity ?? 0.5
    metalProfile.envIntensity = p.envIntensity
    syncTuningInputs()
}

function refreshMaterials() {
    const root = getRingRoot()
    if (root) applyMaterials(root)
    const pp = viewer?.getPlugin?.(ProgressivePlugin) as any
    if (pp && typeof pp.reset === 'function') pp.reset()
    try { (viewer.renderer as any).refreshPipeline() } catch {}
    viewer?.setDirty()
}

// Sync the WEBGI_materials_diamond extension data (DiamondPlugin reads this),
// then set DiamondMaterial-supported properties directly on the shader.
// MeshPhysicalMaterial-only props are silently ignored by DiamondMaterial.
function applyDiamond(mat: any) {
    if (!mat) return
    const d = DIAMOND_PROFILE
    try {
        const ext = mat?.extensions?.WEBGI_materials_diamond
        if (ext) {
            ext.color = new Color(d.color).getHex()
            ext.envMapIntensity = d.envMapIntensity
            ext.envMapRotationOffset = d.envMapRotation * (Math.PI / 180)
            ext.dispersion = d.dispersion
            ext.squashFactor = d.squashFactor
            ext.geometryFactor = d.geometryFactor
            ext.gammaFactor = d.gammaFactor
            ext.absorptionFactor = d.absorptionFactor
            ext.reflectivity = d.reflectivity
            ext.transmission = d.transmission
            ext.refractiveIndex = d.refractiveIndex
            ext.rayBounces = d.rayBounces
            ext.diamondOrientedEnvMap = d.diamondOrientedEnvMap
            ext.boostFactors = { x: d.boostFactors[0], y: d.boostFactors[1], z: d.boostFactors[2], isVector3: true }
        }
        if ('color' in mat) mat.color = linColor(d.color)
        if ('envMapIntensity' in mat) mat.envMapIntensity = d.envMapIntensity
        if ('dispersion' in mat) mat.dispersion = d.dispersion
        if ('absorptionFactor' in mat) mat.absorptionFactor = d.absorptionFactor
        if ('refractiveIndex' in mat) mat.refractiveIndex = d.refractiveIndex
        if ('squashFactor' in mat) mat.squashFactor = d.squashFactor
        if ('geometryFactor' in mat) mat.geometryFactor = d.geometryFactor
        if ('gammaFactor' in mat) mat.gammaFactor = d.gammaFactor
        if ('transmission' in mat) mat.transmission = d.transmission
        if ('reflectivity' in mat) mat.reflectivity = d.reflectivity
        if ('rayBounces' in mat) mat.rayBounces = d.rayBounces
        if ('diamondOrientedEnvMap' in mat) mat.diamondOrientedEnvMap = d.diamondOrientedEnvMap
        if ('boostFactors' in mat && mat.boostFactors?.set) mat.boostFactors.set(d.boostFactors[0], d.boostFactors[1], d.boostFactors[2])
        mat.needsUpdate = true
    } catch {}
}

function isDiamondMesh(mesh: any) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
        if (m?.extensions?.WEBGI_materials_diamond) return true
        if (m?.isDiamondMaterialParameters || m?.type === 'DiamondMaterial') return true
    }
    const name = `${mesh.name || ''} ${mats.map((m: any) => m?.name || '').join(' ')}`.toLowerCase()
    // Structural part names win over the loose diamond regex (e.g. "Diamond_Band" metal)
    if (/\b(prong|shank|bezel)\b/i.test(name) && !DIAMOND_NAME_RE.test(name)) return false
    if (DIAMOND_NAME_RE.test(name)) return true
    for (const m of mats) {
        if (m?.transmission !== undefined && m.transmission > 0.5) return true
        if (m?.ior !== undefined && m.ior > 1.8) return true
    }
    return false
}

function applyMaterials(root: any) {
    if (!root) return
    if (typeof root.traverse !== 'function') return
    root.traverse?.((child: any) => {
        if (!child?.isMesh || !child.material) return
        child.castShadow = true; child.receiveShadow = true
        const dd = isDiamondMesh(child)
        const ms = Array.isArray(child.material) ? child.material : [child.material]
        for (const m of ms) { if (dd) applyDiamond(m); else applyMetal(m) }
    })
    if (diamondPluginInstance && typeof diamondPluginInstance.refreshEnvMaps === 'function')
        diamondPluginInstance.refreshEnvMaps()
}

function computeBounds(): Box3 {
    const box = new Box3()
    const root = getRingRoot()
    if (!root || typeof root.traverse !== 'function') return box
    root.traverse((child: any) => {
        if (!child.geometry) return
        const g = child.geometry
        if (!g.boundingBox && typeof g.computeBoundingBox === 'function') g.computeBoundingBox()
        if (g.boundingBox) { box.min.min(g.boundingBox.min); box.max.max(g.boundingBox.max) }
    })
    return box
}

// Transform-aware world bounding box (visible geometry only). Needed once the
// hand is in the graph, since computeBounds() ignores node transforms.
function worldBounds(root: any): Box3 {
    const box = new Box3(); const v = new Vector3()
    if (!root) return box
    root.updateMatrixWorld?.(true)
    root.traverse((c: any) => {
        if (!c.geometry || c.visible === false) return
        const g = c.geometry
        if (!g.boundingBox && g.computeBoundingBox) g.computeBoundingBox()
        const bb = g.boundingBox
        if (!bb) return
        for (let i = 0; i < 8; i++) {
            v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
            v.applyMatrix4(c.matrixWorld)
            box.expandByPoint(v)
        }
    })
    return box
}

// The object that drag/auto-rotate spins and that frameModel centres. In hand
// mode that's the hand (ring is parented to it); otherwise the ring itself.
function getRotationTarget() {
    return (handRoot && handRoot.parent) ? handRoot : getRingRoot()
}

// Load the hand once: add to scene, hide its built-in sample rings/diamonds
// (keep skin + nails), and capture where/how big that sample ring was so the
// customer's ring can be auto-placed at the same spot/scale.
async function loadHand() {
    if (!hand.enabled || handRoot) return
    try {
        const manager = viewer.getPlugin(AssetManagerPlugin) as any
        if (!manager?.importer) return
        patchDraco()
        const result = await manager.importer.importSinglePath('./assets/hand.glb')
        if (!result) return
        handResult = result
        handRoot = getModelRoot(result)
        if (!handRoot) { handRoot = null; return }
        if (!handRoot.parent) viewer.scene.addSceneObject(result, { autoScale: false })
        handRoot.updateMatrixWorld?.(true)
        const inv = new Matrix4().copy(handRoot.matrixWorld).invert()
        const box = new Box3(); const v = new Vector3(); const toHide: any[] = []
        handRoot.traverse((c: any) => {
            if (!c.isMesh) return
            const mats = Array.isArray(c.material) ? c.material : [c.material]
            const matName = (mats[0]?.name || '').toLowerCase()
            if (matName.includes('skin') || matName.includes('nail')) return  // keep the hand
            // Everything else on the hand = the sample ring/diamonds → measure + hide
            const g = c.geometry
            if (g) {
                if (!g.boundingBox && g.computeBoundingBox) g.computeBoundingBox()
                const bb = g.boundingBox
                if (bb) for (let i = 0; i < 8; i++) {
                    v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
                    v.applyMatrix4(c.matrixWorld).applyMatrix4(inv)
                    box.expandByPoint(v)
                }
            }
            toHide.push(c)
        })
        if (!box.isEmpty()) {
            box.getCenter(handSampleCenter)
            const s = box.getSize(new Vector3())
            handSampleDim = Math.max(s.x, s.y, s.z, 0.01)
        }
        toHide.forEach(c => { c.visible = false })
    } catch (e) {
        console.warn('Hand model load failed — falling back to floating ring', e)
        handRoot = null
    }
}

// Parent the customer's ring onto the hand at the sample-ring spot, auto-scaled
// so it matches the size the file's sample ring was (in hand-local units).
function attachRingToHand(ringRoot: any) {
    if (!hand.enabled || !handRoot || !ringRoot) return
    try {
        const { size } = computeLocalRingBox(ringRoot)
        const ringDim = Math.max(size.x, size.y, size.z, 0.01)
        if (ringRoot.parent !== handRoot) {
            if (ringRoot.parent) ringRoot.parent.remove(ringRoot)
            handRoot.add(ringRoot)
        }
        ringRoot.position.set(
            handSampleCenter.x + hand.posX * handSampleDim,
            handSampleCenter.y + hand.posY * handSampleDim,
            handSampleCenter.z + hand.posZ * handSampleDim)
        ringRoot.rotation.set(hand.rotX, hand.rotY, hand.rotZ)
        ringRoot.scale.setScalar((handSampleDim / ringDim) * hand.scale)
        ringRoot.updateMatrixWorld?.(true)
    } catch (e) { console.warn('attachRingToHand failed', e) }
}

function frameModel(firstLoad = false) {
    if (!viewer || !ringModel) return
    const root = getRotationTarget()
    if (!root) return
    const handMode = (root === handRoot)
    // Measure around the model's own origin, then recentre at the scene origin.
    root.position.set(0, 0, 0)
    root.updateMatrixWorld?.(true)
    const box = handMode ? worldBounds(root) : computeBounds()
    if (box.isEmpty()) return
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.01)
    root.position.set(-center.x, -center.y, -center.z)
    root.updateMatrixWorld?.(true)
    zoomMin = maxDim * 1.2
    zoomMax = maxDim * 6
    // Contact shadow only makes sense under the floating ring — hide it for the hand.
    if (groundPlugin) {
        groundPlugin.visible = handMode ? false : groundEnabled
        if (!handMode) {
            if ('size' in groundPlugin) groundPlugin.size = maxDim * GROUND_SIZE_FACTOR
            if ('yOffset' in groundPlugin) groundPlugin.yOffset = -0.008 * maxDim
        }
    }
    if (firstLoad) {
        // First load only: entrance animation (pulled back + turned away → ease in)
        targetZoom = maxDim * (handMode ? 1.6 : 3.2)
        cameraZoom = maxDim * (handMode ? 2.1 : 4.4)
        rotationY = -0.9; targetRotationY = 0
        rotationX = -0.4; targetRotationX = -0.05
        rotationZ = 0; targetRotationZ = 0
    } else {
        // Rebuild on option change: keep the customer's current angle & zoom,
        // just keep zoom within the new limits. preFrame eases everything.
        targetZoom = Math.min(Math.max(targetZoom, zoomMin), zoomMax)
    }
    const cam = viewer.scene.activeCamera
    cam.position.set(0, cameraZoom * CAM_ELEVATION, cameraZoom)
    if (typeof cam.positionUpdated === 'function') cam.positionUpdated(false)
    viewer.setDirty()
}

function findMeshRoot(obj: any): any {
    if (!obj) return null
    let root = obj
    let parent = obj.parent
    while (parent && parent !== (viewer.scene as any)) {
        root = parent
        parent = parent.parent
    }
    return root
}

function disposeModel() {
    const root = getRingRoot()
    if (root && root.parent) {
        root.traverse?.((child: any) => {
            if (child.isMesh) {
                child.geometry?.dispose()
                const ms = Array.isArray(child.material) ? child.material : [child.material]
                for (const m of ms) m?.dispose()
            }
        })
        root.parent.remove(root)
    }
    ringModel = null
    modelLoaded = false
}

function findBestHead(prong: string, shape: string, size: string): CatEntry | null {
    const sz = parseFloat(size)
    const cand = catalog.allHeads.filter(h => h.prong === prong && h.shape === shape)
    if (!cand.length) return null
    let best = cand[0], bestDiff = Math.abs(best.size! - sz)
    for (const c of cand) { const d = Math.abs(c.size! - sz); if (d < bestDiff) { best = c; bestDiff = d } }
    return best
}

// Which prong/setting styles actually have a head for the given diamond shape
function prongsForShape(shape: string): Set<string> {
    const s = new Set<string>()
    for (const h of catalog.allHeads) if (h.shape === shape && h.prong) s.add(h.prong)
    return s
}

// Grey out prong options with no matching head for the current shape, and if the
// current prong just became unavailable, switch to the first valid one.
function refreshProngAvailability() {
    const grid = byId('prong-grid')
    if (!grid || !catalog) return
    const avail = prongsForShape(state.shape)
    grid.querySelectorAll('.option-card').forEach(el => {
        const v = (el as HTMLElement).dataset.value || ''
        el.classList.toggle('disabled', !avail.has(v))
    })
    if (!avail.has(state.prong)) {
        const next = catalog.prongs.find(p => avail.has(p.id))?.id || [...avail][0]
        if (next) {
            state.prong = next
            grid.querySelectorAll('.option-card').forEach(c =>
                c.classList.toggle('selected', (c as HTMLElement).dataset.value === next))
        }
    }
    updateSummary()
}

function findBestBand(style: string): CatEntry | null {
    return catalog.allBands.find(b => b.style === style) || null
}
function findBestShank(style: string): CatEntry | null {
    return catalog.allShanks.find(s => s.style === style) || null
}

async function loadGlb(path: string): Promise<any> {
    const manager = viewer.getPlugin(AssetManagerPlugin) as any
    if (!manager) { setError('AssetManager not available'); return null }
    const importer = manager.importer as any
    if (!importer) { setError('AssetImporter not available'); return null }
    patchDraco()

    const fileName = path.split('/').pop() || 'part.glb'
    try {
        // Fetch + patch with WEBGI_materials_diamond before import so the
        // DiamondPlugin converts gem materials into real DiamondMaterial
        // shaders (same pipeline as the working 360 viewer's file upload).
        const resp = await fetch(encodeURI(path))
        if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${fileName}`)
        const blob = await resp.blob()
        const rawFile = new File([blob], fileName, { type: 'model/gltf-binary' })
        const patched = await patchGlbWithDiamondMetadata(rawFile, undefined, { fallbackToFirst: false })
        const result = await importer.importSingle({ path: fileName, file: patched })
        if (!result) { setError('importSingle returned null'); return null }
        return result
    } catch (e) {
        console.warn('GLB import failed:', e)
        setError('Failed to import: ' + fileName)
        return null
    }
}

function getModelRoot(result: any): any {
    if (!result) return null
    if (result.modelObject) return result.modelObject
    if (result.scene) return result.scene
    return result
}

async function buildRing() {
    if (!viewer) { setError('Viewer not initialized'); return }
    if (isBuilding) return
    isBuilding = true
    usingCustomModel = false
    const nm = byId('model-name'); if (nm) nm.textContent = ''
    setLoader('Finding parts...')
    canvasFade(true)

    disposeModel()

    try {
        const head = findBestHead(state.prong, state.shape, state.size)
        if (!head) { setError(`No ${state.prong} ${state.shape} ${state.size}ct head found`); hideLoader(); isBuilding = false; return }

        setLoader('Loading head...')
        const headResult = await loadGlb(`${HEADS_BASE}/${head.file}`)
        if (!headResult) { hideLoader(); isBuilding = false; return }

        const headRoot = getModelRoot(headResult)
        if (!headRoot) { setError('Could not extract head model root'); hideLoader(); isBuilding = false; return }

        // Add head to scene via WebGI pipeline (autoScale: false preserves original sizes)
        viewer.scene.addSceneObject(headResult, { autoScale: false })

        if (state.band) {
            const band = findBestBand(state.band)
            if (band) {
                setLoader('Loading band...')
                const bandResult = await loadGlb(`${BANDS_BASE}/${band.file}`)
                if (bandResult) {
                    const bandRoot = getModelRoot(bandResult)
                    if (bandRoot) {
                        if (bandRoot.parent) bandRoot.parent.remove(bandRoot)
                        headRoot.add(bandRoot)
                        bandRoot.position.set(0, 0, 0)
                        bandRoot.rotation.set(0, 0, 0)
                        bandRoot.scale.set(1, 1, 1)
                    }
                }
            }
        }

        if (state.shank) {
            const shank = findBestShank(state.shank)
            if (shank) {
                setLoader('Loading shank...')
                const shankResult = await loadGlb(`${SHANKS_BASE}/${shank.file}`)
                if (shankResult) {
                    const shankRoot = getModelRoot(shankResult)
                    if (shankRoot) {
                        if (shankRoot.parent) shankRoot.parent.remove(shankRoot)
                        headRoot.add(shankRoot)
                        shankRoot.position.set(0, 0, 0)
                        shankRoot.rotation.set(0, 0, 0)
                        shankRoot.scale.set(1, 1, 1)
                    }
                }
            }
        }

        ringModel = headResult

        setLoader('Applying materials...')
        applyMaterials(headRoot)

        // Place the configured ring onto the hand (if hand mode is active).
        attachRingToHand(headRoot)

        setLoader('Framing view...')
        await new Promise<void>(r => requestAnimationFrame(() => r()))
        frameModel(!firstBuildDone)
        firstBuildDone = true

        modelLoaded = true
        updateEngraving3D()
        const pp = viewer.getPlugin?.(ProgressivePlugin) as any
        if (pp && typeof pp.reset === 'function') pp.reset()
        try { (viewer.renderer as any).refreshPipeline() } catch {}
        viewer.setDirty()

        setStatus(`${state.prong} ${state.shape} ${state.size}ct · ${state.metal}`)
        updateSummary()
        // Notify Shopify parent that the ring is fully loaded
        try { window.parent.postMessage({ type: 'rb:ringLoaded', config: getConfiguration() }, '*') } catch {}
    } catch (e: any) {
        console.error('Build failed:', e)
        setError('Build failed: ' + (e?.message || e))
    } finally {
        canvasFade(false)
        hideLoader()
        isBuilding = false
    }
}

// ── Custom model upload (GLB / glTF / 3DM) ─────────────────────────────
// Mirrors the main viewer's pipeline: GLBs are patched with the diamond
// metadata extension before import (so the DiamondPlugin renders gems),
// 3DM files load via Rhino3dmLoader2 from the rhino3dm CDN.
async function loadCustomModel(file: File) {
    if (!viewer) { setError('Viewer not initialized'); return }
    if (isBuilding) return
    isBuilding = true
    canvasFade(true)
    setLoader(`Loading ${file.name}...`)
    disposeModel()

    const manager = viewer.getPlugin(AssetManagerPlugin) as any
    const importer = manager?.importer
    if (!importer) { setError('AssetImporter not available'); canvasFade(false); hideLoader(); isBuilding = false; return }
    patchDraco()

    const name = file.name.toLowerCase()
    const is3dm = name.endsWith('.3dm')
    const patchOn = (byId('model-patch') as HTMLInputElement)?.checked !== false

    try {
        if (is3dm) {
            const loader = new Rhino3dmLoader2()
            ;(loader as any).setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/')
            const url = URL.createObjectURL(file)
            const model = await loader.loadAsync(url)
            URL.revokeObjectURL(url)
            ;(viewer.scene as any).add(model)
            ringModel = model
        } else {
            // Patch diamond metadata into matching materials before import
            const toLoad = patchOn ? await patchGlbWithDiamondMetadata(file) : file
            const result = await importer.importSingle({ path: file.name, file: toLoad })
            if (!result) throw new Error('importSingle returned null')
            viewer.scene.addSceneObject(result, { autoScale: false })
            ringModel = result
        }

        const root = getRingRoot()
        setLoader('Applying materials...')
        applyMaterials(root)
        await new Promise<void>(r => requestAnimationFrame(() => r()))
        frameModel(true)  // custom upload = fresh model, reframe
        modelLoaded = true
        usingCustomModel = true
        updateEngraving3D()
        const pp = viewer.getPlugin?.(ProgressivePlugin) as any
        if (pp && typeof pp.reset === 'function') pp.reset()
        try { (viewer.renderer as any).refreshPipeline() } catch {}
        viewer.setDirty()
        setStatus(`Custom: ${file.name}`)
        const nm = byId('model-name'); if (nm) nm.textContent = `Loaded: ${file.name}`
    } catch (e: any) {
        console.error('Custom model load failed:', e)
        setError('Failed to load ' + file.name + ': ' + (e?.message || e))
    } finally {
        canvasFade(false)
        hideLoader()
        isBuilding = false
    }
}

// Snapshot — download a PNG of the current 3D view (iJewel-style export)
async function downloadSnapshot() {
    const r = (viewer?.renderer as any)?.rendererObject
    const canvas: HTMLCanvasElement | undefined = r?.domElement
    if (!canvas) { setError('Renderer not ready'); return }
    viewer.setDirty()
    await new Promise<void>(res => requestAnimationFrame(() => res()))
    await new Promise<void>(res => requestAnimationFrame(() => res()))
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
    if (!blob) { setError('Could not capture image'); return }
    const a = document.createElement('a')
    const tag = usingCustomModel ? 'custom-ring' : `${state.prong}-${state.shape}-${state.size}ct-${state.metal}`
    a.href = URL.createObjectURL(blob)
    a.download = `ring-${tag}.png`
    a.click()
    URL.revokeObjectURL(a.href)
}

function updateSummary() {
    const sl = catalog.shapes.find(s => s.id === state.shape)?.label || state.shape
    const pl = catalog.prongs.find(p => p.id === state.prong)?.label || state.prong
    const bl = state.band === 'NONE' ? 'None' : (catalog.bandStyles.find(b => b.id === state.band)?.label || state.band)
    const shl = catalog.shankStyles.find(s => s.id === state.shank)?.label || state.shank
    const ml = METAL_PRESETS.find(m => m.id === state.metal)?.label || state.metal
    byId('summary-diamond').textContent = `${sl} · ${state.size}ct`
    byId('summary-prong').textContent = pl
    byId('summary-band').textContent = bl
    byId('summary-shank').textContent = shl
    byId('summary-metal').textContent = ml
    const fin = byId('summary-finger')
    if (fin) fin.textContent = `US ${state.fingerSize}`
    const eng = byId('summary-engraving')
    if (eng) {
        const fontLabel = ENGRAVING_FONTS.find(f => f.id === state.engravingFont)?.label || ''
        eng.textContent = state.engraving ? `"${state.engraving}" (${fontLabel})` : '—'
    }
}

function bindGrid(containerId: string, items: { id: string; label: string }[], stateKey: string, icons?: Record<string, string>, sm = false, onSelect?: (id: string) => void) {
    const grid = byId(containerId)
    if (!grid) return
    grid.innerHTML = items.map(it => `
        <div class="option-card${sm ? ' option-card-sm' : ''}${state[stateKey] === it.id ? ' selected' : ''}" data-value="${it.id}">
            ${icons?.[it.id] ? `<span class="icon">${icons[it.id]}</span>` : ''}
            ${it.label}
        </div>
    `).join('')
    grid.querySelectorAll('.option-card').forEach(el => {
        el.addEventListener('click', () => {
            state[stateKey] = (el as HTMLElement).dataset.value || ''
            grid.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'))
            el.classList.add('selected')
            updateSummary()
            postOptionChange(stateKey, (el as HTMLElement).dataset.value || '')
            onSelect?.(state[stateKey])
        })
    })
}

// Metal grid with real color swatches (cleaner than emoji on mobile)
function bindMetalGrid(onSelect: (id: string) => void) {
    const grid = byId('metal-grid')
    if (!grid) return
    grid.innerHTML = METAL_PRESETS.map(m => `
        <div class="option-card option-card-sm${state.metal === m.id ? ' selected' : ''}" data-value="${m.id}">
            <span class="metal-swatch" style="background:${m.color}"></span>
            ${m.label}
        </div>
    `).join('')
    grid.querySelectorAll('.option-card').forEach(el => {
        el.addEventListener('click', () => {
            state.metal = (el as HTMLElement).dataset.value || 'whiteGold'
            grid.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'))
            el.classList.add('selected')
            updateSummary()
            postOptionChange('metal', state.metal)
            onSelect(state.metal)
        })
    })
}

// Auto-rebuild the ring shortly after any part selection (debounced so rapid
// taps only trigger one build); waits out any in-progress build.
let rebuildTimer: any = null
function scheduleAutoBuild() {
    clearTimeout(rebuildTimer)
    rebuildTimer = setTimeout(function run() {
        if (isBuilding) { rebuildTimer = setTimeout(run, 180); return }
        buildRing()
    }, 320)
}

function bindSizes() {
    const grid = byId('size-grid')
    if (!grid) return
    grid.innerHTML = catalog.sizes.map(s => `
        <div class="size-btn${state.size === s ? ' selected' : ''}" data-value="${s}">${s}ct</div>
    `).join('')
    grid.querySelectorAll('.size-btn').forEach(el => {
        el.addEventListener('click', () => {
            state.size = (el as HTMLElement).dataset.value || '1.00'
            grid.querySelectorAll('.size-btn').forEach(c => c.classList.remove('selected'))
            el.classList.add('selected')
            updateSummary()
            postOptionChange('size', state.size)
            scheduleAutoBuild()
        })
    })
}

// Finger/ring size — line-item property, not a variant (no rebuild needed)
function bindFingerSizes() {
    const grid = byId('finger-size-grid')
    if (!grid) return
    grid.innerHTML = FINGER_SIZES.map(s => `
        <div class="size-btn${state.fingerSize === s ? ' selected' : ''}" data-value="${s}">${s}</div>
    `).join('')
    grid.querySelectorAll('.size-btn').forEach(el => {
        el.addEventListener('click', () => {
            state.fingerSize = (el as HTMLElement).dataset.value || '7'
            grid.querySelectorAll('.size-btn').forEach(c => c.classList.remove('selected'))
            el.classList.add('selected')
            updateSummary()
            postOptionChange('fingerSize', state.fingerSize)
        })
    })
}



function engravingFontCss(id: string) {
    return ENGRAVING_FONTS.find(f => f.id === id)?.css || 'inherit'
}

function updateEngravingPreview() {
    const preview = byId('engraving-preview')
    const txt = byId('engraving-preview-text')
    const counter = byId('engraving-count')
    if (counter) counter.textContent = `${state.engraving.length} / ${ENGRAVING_MAX}`
    if (!preview || !txt) return
    if (state.engraving.trim()) {
        preview.hidden = false
        txt.textContent = state.engraving
        ;(txt as HTMLElement).style.fontFamily = engravingFontCss(state.engravingFont)
    } else {
        preview.hidden = true
    }
}

function bindEngraving() {
    const input = byId('engraving-input') as HTMLInputElement | null
    if (input) {
        input.value = state.engraving
        input.addEventListener('input', () => {
            state.engraving = input.value.slice(0, ENGRAVING_MAX)
            updateEngravingPreview()
            updateSummary()
            postOptionChange('engraving', state.engraving)
            updateEngraving3D()
        })
    }
    const grid = byId('engraving-font-grid')
    if (grid) {
        grid.innerHTML = ENGRAVING_FONTS.map(f => `
            <div class="engraving-font${state.engravingFont === f.id ? ' selected' : ''}" data-value="${f.id}" style="font-family:${f.css.replace(/"/g, '&quot;')}">
                ${f.glyph}<span class="lbl">${f.label}</span>
            </div>
        `).join('')
        grid.querySelectorAll('.engraving-font').forEach(el => {
            el.addEventListener('click', () => {
                state.engravingFont = (el as HTMLElement).dataset.value || 'script'
                grid.querySelectorAll('.engraving-font').forEach(c => c.classList.remove('selected'))
                el.classList.add('selected')
                updateEngravingPreview()
                updateSummary()
                postOptionChange('engravingFont', state.engravingFont)
                updateEngraving3D()
            })
        })
    }
    updateEngravingPreview()
}

// Full configuration — the bridge to Shopify "add to cart" (line-item properties)
function getConfiguration() {
    const label = (arr: { id: string; label: string }[], id: string) => arr.find(x => x.id === id)?.label || id
    return {
        diamondShape: label(catalog.shapes, state.shape),
        diamondShapeId: state.shape,
        caratSize: state.size,
        prong: label(catalog.prongs, state.prong),
        prongId: state.prong,
        bandStyle: state.band === 'NONE' ? 'None' : label(catalog.bandStyles, state.band),
        bandId: state.band,
        shankStyle: label(catalog.shankStyles, state.shank),
        shankId: state.shank,
        metal: METAL_PRESETS.find(m => m.id === state.metal)?.label || state.metal,
        metalId: state.metal,
        ringSize: state.fingerSize,
        engraving: state.engraving,
        engravingFont: ENGRAVING_FONTS.find(f => f.id === state.engravingFont)?.label || state.engravingFont,
    }
}

// ── Shopify add-to-cart ────────────────────────────────────────────────
// Shape = a separate Shopify product (handle "<shape>-diamond-ring");
// Metal × Carat = the variant. Variant IDs are resolved live from the
// storefront product JSON (/products/{handle}.js) so the 72 IDs never need to
// be hand-copied. Prong, band, shank, ring size and engraving ride along as
// line-item properties. Only the store domain is configured in the HTML.
const SHOPIFY_CFG = (window as any).SHOPIFY_RING_CONFIG || { domain: '', variantByMetal: {} }

// Shapes that have a live Shopify product. All 7 catalog shapes have products.
const SHOPIFY_SHAPES = ['Round', 'Oval', 'Princess', 'Emerald', 'Marquise', 'Pear', 'Radiant']

function productHandleForShape(): string {
    const label = catalog.shapes.find(s => s.id === state.shape)?.label || ''
    if (!SHOPIFY_SHAPES.includes(label)) return ''
    return `custom-${label.toLowerCase()}-diamond-ring`
}

const _productCache: Record<string, any> = {}
async function fetchShopifyProduct(handle: string): Promise<any | null> {
    if (_productCache[handle]) return _productCache[handle]
    try {
        const res = await fetch(`https://${SHOPIFY_CFG.domain}/products/${handle}.js`)
        if (!res.ok) return null
        const data = await res.json()
        _productCache[handle] = data
        return data
    } catch { return null }
}

// Variant id for current shape+metal+carat. Metal = option1, carat = option2.
async function resolveVariantId(): Promise<string> {
    if (!SHOPIFY_CFG.domain) return ''
    const handle = productHandleForShape()
    if (!handle) return ''
    const product = await fetchShopifyProduct(handle)
    if (!product?.variants) return ''
    const metalLabel = METAL_PRESETS.find(m => m.id === state.metal)?.label || ''
    const v = product.variants.find((vr: any) =>
        vr.option1 === metalLabel && String(vr.option2) === String(state.size))
    return v ? String(v.id) : ''
}

async function addToCart() {
    if (!SHOPIFY_CFG.domain) {
        setError('Checkout not set up yet — add your Shopify store domain in the config, then re-deploy.')
        return
    }
    const handle = productHandleForShape()
    if (!handle) {
        const label = catalog.shapes.find(s => s.id === state.shape)?.label || 'this'
        setError(`The ${label} shape isn't available for purchase yet. Try Oval, Princess or Radiant.`)
        return
    }
    setStatus('Adding to cart…')
    const variant = await resolveVariantId()
    if (!variant) {
        setError('Could not find that ring in the store. Try a different metal or carat.')
        setStatus('')
        return
    }
    const c = getConfiguration()
    const props: Record<string, string> = {
        'Diamond Shape': c.diamondShape,
        'Carat': `${c.caratSize}ct`,
        'Prong': c.prong,
        'Band': c.bandStyle,
        'Shank': c.shankStyle,
        'Metal': c.metal,
        'Ring Size': `US ${c.ringSize}`,
    }
    if (c.engraving) { props['Engraving'] = c.engraving; props['Engraving Font'] = c.engravingFont }
    const qs = Object.entries(props)
        .map(([k, v]) => `properties[${encodeURIComponent(k)}]=${encodeURIComponent(v)}`)
        .join('&')
    // Cart permalink works cross-origin from the iframe; break out to the store cart
    const url = `https://${SHOPIFY_CFG.domain}/cart/${variant}:1?${qs}`
    try { (window.top || window)!.location.href = url } catch { window.location.href = url }
}

// ── Shopify embed: postMessage bridge ─────────────────────────────
// Sends the current selection to the parent Shopify page whenever
// an option changes, so line-item properties can be updated.
function postOptionChange(key: string, label: string) {
    try {
        const cfg = getConfiguration()
        window.parent.postMessage({
            type: 'rb:optionChange',
            key,
            value: state[key],
            label,
            config: cfg,
        }, '*')
    } catch {}
}

// Publishes the full option catalog to the Shopify parent page so it can render
// native selectors for the non-variant options (prong / band / shank / ring
// size). Values are the same ids the builder uses, so the parent can echo them
// straight back as rb:setOption.
function postCatalogToParent() {
    try {
        window.parent.postMessage({
            type: 'rb:catalog',
            catalog: {
                shapes: catalog.shapes,
                sizes: catalog.sizes,
                prongs: catalog.prongs,
                bands: [{ id: 'NONE', label: 'None' }, ...catalog.bandStyles],
                shanks: catalog.shankStyles,
                metals: METAL_PRESETS.map(m => ({ id: m.id, label: m.label })),
                fingerSizes: FINGER_SIZES,
                engravingFonts: ENGRAVING_FONTS.map(f => ({ id: f.id, label: f.label })),
                engravingMax: ENGRAVING_MAX,
            },
            state: { ...state },
            config: getConfiguration(),
        }, '*')
    } catch {}
}

// Listen for external option changes from the Shopify parent page
// (e.g. when a native variant selector is used).
function setupEmbedMessageListener() {
    const handler = (e: MessageEvent) => {
        if (e.data?.type === 'rb:requestCatalog') { postCatalogToParent(); return }
        if (e.data?.type === 'rb:autorotate') { autoRotate = !!e.data.value; if (typeof e.data.speed === 'number' && e.data.speed > 0) autoRotateSpeed = e.data.speed; viewer?.setDirty(); return }
        if (e.data?.type !== 'rb:setOption') return
        const { key, value } = e.data
        if (!key || value === undefined) return
        if (state[key] === value) return
        state[key] = value

        // Update the corresponding UI element
        const prop = key as string
        const gridMap: Record<string, string> = {
            shape: 'shape-grid',
            prong: 'prong-grid',
            band: 'band-grid',
            shank: 'shank-grid',
            metal: 'metal-grid',
        }
        const gridId = gridMap[prop]
        if (gridId) {
            const grid = byId(gridId)
            if (grid) {
                grid.querySelectorAll('.option-card').forEach(c =>
                    c.classList.toggle('selected', (c as HTMLElement).dataset.value === value))
            }
        }
        if (prop === 'size') {
            const grid = byId('size-grid')
            if (grid) {
                grid.querySelectorAll('.size-btn').forEach(c =>
                    c.classList.toggle('selected', (c as HTMLElement).dataset.value === value))
            }
        }

        updateSummary()

        // Trigger appropriate action
        if (prop === 'shape') { refreshProngAvailability(); scheduleAutoBuild() }
        else if (prop === 'prong' || prop === 'band' || prop === 'shank' || prop === 'size') scheduleAutoBuild()
        else if (prop === 'metal') {
            syncMetalProfileFromPreset(value)
            refreshMaterials()
        }
        else if (prop === 'engraving' || prop === 'engravingFont') updateEngraving3D()
    }
    window.addEventListener('message', handler)
}

function fmt(v: number, digits = 2) { return v.toFixed(digits) }

function setCtl(id: string, value: string | number, outText?: string) {
    const input = document.getElementById(id) as HTMLInputElement | null
    if (input) input.value = String(value)
    const out = document.getElementById(id + '-out')
    if (out && outText !== undefined) out.textContent = outText
}

function syncTuningInputs() {
    setCtl('tn-metal-color', metalProfile.color)
    setCtl('tn-metal-metalness', metalProfile.metalness, fmt(metalProfile.metalness))
    setCtl('tn-metal-roughness', metalProfile.roughness, fmt(metalProfile.roughness))
    setCtl('tn-metal-env', metalProfile.envIntensity, fmt(metalProfile.envIntensity))
    setCtl('tn-dia-color', DIAMOND_PROFILE.color)
    setCtl('tn-dia-env', DIAMOND_PROFILE.envMapIntensity, fmt(DIAMOND_PROFILE.envMapIntensity))
    setCtl('tn-dia-dispersion', DIAMOND_PROFILE.dispersion, fmt(DIAMOND_PROFILE.dispersion, 3))
    setCtl('tn-dia-ri', DIAMOND_PROFILE.refractiveIndex, fmt(DIAMOND_PROFILE.refractiveIndex))
    setCtl('tn-dia-absorption', DIAMOND_PROFILE.absorptionFactor, fmt(DIAMOND_PROFILE.absorptionFactor))
    setCtl('tn-dia-gamma', DIAMOND_PROFILE.gammaFactor, fmt(DIAMOND_PROFILE.gammaFactor))
    setCtl('tn-dia-transmission', DIAMOND_PROFILE.transmission, fmt(DIAMOND_PROFILE.transmission))
    setCtl('tn-dia-reflectivity', DIAMOND_PROFILE.reflectivity, fmt(DIAMOND_PROFILE.reflectivity))
    setCtl('tn-dia-bounces', DIAMOND_PROFILE.rayBounces, String(DIAMOND_PROFILE.rayBounces))
    setCtl('tn-menv-intensity', metalEnvIntensity, fmt(metalEnvIntensity))
    setCtl('tn-menv-rotation', metalEnvRotationDeg, `${metalEnvRotationDeg}°`)
    setCtl('tn-genv-rotation', DIAMOND_PROFILE.envMapRotation, `${DIAMOND_PROFILE.envMapRotation}°`)
}

function bindCtl(id: string, onInput: (v: string) => string | void) {
    const input = document.getElementById(id) as HTMLInputElement | null
    if (!input) return
    input.addEventListener('input', () => {
        const label = onInput(input.value)
        const out = document.getElementById(id + '-out')
        if (out && typeof label === 'string') out.textContent = label
    })
}

function metalEnvTweaked() {
    applyMetalEnvSettings()
    const pp = viewer?.getPlugin?.(ProgressivePlugin) as any
    if (pp && typeof pp.reset === 'function') pp.reset()
    try { (viewer.renderer as any).refreshPipeline() } catch {}
    viewer?.setDirty()
}

function setupTuningPanel() {
    // Metal
    bindCtl('tn-metal-color', v => { metalProfile.color = v; refreshMaterials() })
    bindCtl('tn-metal-metalness', v => { metalProfile.metalness = Number(v); refreshMaterials(); return fmt(metalProfile.metalness) })
    bindCtl('tn-metal-roughness', v => { metalProfile.roughness = Number(v); refreshMaterials(); return fmt(metalProfile.roughness) })
    bindCtl('tn-metal-env', v => { metalProfile.envIntensity = Number(v); refreshMaterials(); return fmt(metalProfile.envIntensity) })

    // Diamond
    bindCtl('tn-dia-color', v => { DIAMOND_PROFILE.color = v; refreshMaterials() })
    bindCtl('tn-dia-env', v => { DIAMOND_PROFILE.envMapIntensity = Number(v); refreshMaterials(); return fmt(DIAMOND_PROFILE.envMapIntensity) })
    bindCtl('tn-dia-dispersion', v => { DIAMOND_PROFILE.dispersion = Number(v); refreshMaterials(); return fmt(DIAMOND_PROFILE.dispersion, 3) })
    bindCtl('tn-dia-ri', v => { DIAMOND_PROFILE.refractiveIndex = Number(v); refreshMaterials(); return fmt(DIAMOND_PROFILE.refractiveIndex) })
    bindCtl('tn-dia-absorption', v => { DIAMOND_PROFILE.absorptionFactor = Number(v); refreshMaterials(); return fmt(DIAMOND_PROFILE.absorptionFactor) })
    bindCtl('tn-dia-gamma', v => { DIAMOND_PROFILE.gammaFactor = Number(v); refreshMaterials(); return fmt(DIAMOND_PROFILE.gammaFactor) })
    bindCtl('tn-dia-transmission', v => { DIAMOND_PROFILE.transmission = Number(v); refreshMaterials(); return fmt(DIAMOND_PROFILE.transmission) })
    bindCtl('tn-dia-reflectivity', v => { DIAMOND_PROFILE.reflectivity = Number(v); refreshMaterials(); return fmt(DIAMOND_PROFILE.reflectivity) })
    bindCtl('tn-dia-bounces', v => { DIAMOND_PROFILE.rayBounces = Math.round(Number(v)); refreshMaterials(); return String(DIAMOND_PROFILE.rayBounces) })

    // Metal environment (scene env)
    const menvSel = document.getElementById('tn-menv-select') as HTMLSelectElement | null
    menvSel?.addEventListener('change', () => { if (menvSel.value) setMetalEnvironment(menvSel.value) })
    const menvFile = document.getElementById('tn-menv-file') as HTMLInputElement | null
    menvFile?.addEventListener('change', () => { const f = menvFile.files?.[0]; if (f) setMetalEnvironment(f) })
    bindCtl('tn-menv-intensity', v => { metalEnvIntensity = Number(v); metalEnvTweaked(); return fmt(metalEnvIntensity) })
    bindCtl('tn-menv-rotation', v => { metalEnvRotationDeg = Number(v); metalEnvTweaked(); return `${metalEnvRotationDeg}°` })

    // Diamond environment (DiamondPlugin env map; sparkle slider = its intensity)
    const genvSel = document.getElementById('tn-genv-select') as HTMLSelectElement | null
    genvSel?.addEventListener('change', () => { if (genvSel.value) setGemEnvironment(genvSel.value) })
    const genvFile = document.getElementById('tn-genv-file') as HTMLInputElement | null
    genvFile?.addEventListener('change', () => { const f = genvFile.files?.[0]; if (f) setGemEnvironment(f) })
    bindCtl('tn-genv-rotation', v => { DIAMOND_PROFILE.envMapRotation = Number(v); refreshMaterials(); return `${DIAMOND_PROFILE.envMapRotation}°` })

    // Ground
    const groundToggle = document.getElementById('tn-ground-enable') as HTMLInputElement | null
    groundToggle?.addEventListener('change', () => {
        groundEnabled = !!groundToggle.checked
        if (groundPlugin) groundPlugin.visible = groundEnabled
        renderRefresh()
    })
    bindCtl('tn-ground-color', v => {
        const gm = groundPlugin?.material
        if (gm) { gm.color = linColor(v); gm.needsUpdate = true; renderRefresh() }
    })
    bindCtl('tn-ground-roughness', v => {
        const gm = groundPlugin?.material
        if (gm) { gm.roughness = Number(v); gm.needsUpdate = true; renderRefresh() }
        return fmt(Number(v))
    })

    // Scene
    bindCtl('tn-bg-color', v => { viewer?.scene.setBackground(linColor(v)); viewer?.setDirty() })
    // Background image (any image; the bone PNG is just a flat colour so the
    // picker above reproduces it exactly — this is for real backdrops/gradients)
    const bgImg = byId('tn-bg-image') as HTMLInputElement | null
    bgImg?.addEventListener('change', async () => {
        const f = bgImg.files?.[0]; if (!f) return
        const manager = viewer.getPlugin(AssetManagerPlugin) as any
        try {
            const url = URL.createObjectURL(f)
            const tex: any = await manager.importer.importSinglePath(url)
            URL.revokeObjectURL(url)
            if (tex && tex.assetType === 'texture') { tex.wrapS = 1000; tex.wrapT = 1000; ;(viewer.scene as any).background = tex; viewer.setDirty() }
            else setError('Not a valid image')
        } catch { setError('Failed to load background image') }
        bgImg.value = ''
    })
    byId('tn-bg-clear')?.addEventListener('click', () => {
        const c = (byId('tn-bg-color') as HTMLInputElement)?.value || BG_BONE_COLOR
        viewer.scene.setBackground(linColor(c)); viewer.setDirty()
    })
    bindCtl('tn-exposure', v => { if (tonemapPlugin) tonemapPlugin.exposure = Number(v); viewer?.setDirty(); return fmt(Number(v)) })
    bindCtl('tn-contrast', v => { if (tonemapPlugin) tonemapPlugin.contrast = Number(v); viewer?.setDirty(); return fmt(Number(v)) })
    bindCtl('tn-saturation', v => { if (tonemapPlugin) tonemapPlugin.saturation = Number(v); viewer?.setDirty(); return fmt(Number(v)) })
    // Shadow strength = contact-shadow ground opacity (white ground on white
    // bg reads as just the soft shadow under the ring)
    bindCtl('tn-shadow', v => {
        shadowOpacity = Number(v)
        const gm = groundPlugin?.material
        if (gm) { gm.transparent = true; gm.opacity = shadowOpacity; gm.needsUpdate = true; renderRefresh() }
        return fmt(shadowOpacity)
    })
    const autoR = document.getElementById('tn-autorotate') as HTMLInputElement | null
    autoR?.addEventListener('change', () => { autoRotate = !!autoR.checked; viewer?.setDirty() })
    bindCtl('tn-autorotate-speed', v => { autoRotateSpeed = Number(v); return fmt(autoRotateSpeed) })

    syncTuningInputs()
}

// Subtle studio backdrop helper (currently unused — background is flat white to
// match iJewel's 1_bg_white.svg). Kept for quick re-enable if a gradient is wanted.
function setStudioBackground() {
    try {
        const c = document.createElement('canvas')
        c.width = 1024; c.height = 1024
        const ctx = c.getContext('2d')!
        const g = ctx.createRadialGradient(512, 430, 100, 512, 512, 760)
        g.addColorStop(0, '#ffffff')
        g.addColorStop(0.65, '#f7f7f5')
        g.addColorStop(1, '#ececea')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, 1024, 1024)
        const tex: any = new CanvasTexture(c)
        tex.needsUpdate = true
        tex.encoding = 3001
        ;(viewer.scene as any).background = tex
        viewer.setDirty()
    } catch {
        viewer.scene.setBackground(linColor(BG_BONE_COLOR))
    }
}

async function init() {
    setLoader('Loading catalog...')
    try {
        const resp = await fetch('./assets/catalog.json')
        catalog = await resp.json()
    } catch { setError('Failed to load catalog'); hideLoader(); return }

    if (!state.shape && catalog.shapes.length) state.shape = catalog.shapes[0].id
    if (!state.size && catalog.sizes.length) state.size = catalog.sizes[0]
    if (!state.prong && catalog.prongs.length) state.prong = catalog.prongs[0].id
    if (!state.band && catalog.bandStyles.length) state.band = catalog.bandStyles[0].id
    if (!state.shank && catalog.shankStyles.length) state.shank = catalog.shankStyles[0].id

    // Embed: the Shopify product page can preset the starting selection via URL
    // params (?shape=OV&metal=whiteGold&carat=1.00). Metal/carat also keep
    // arriving live as rb:setOption messages when the native selectors change.
    {
        const qp = new URLSearchParams(location.search)
        const qShape = qp.get('shape'); if (qShape && catalog.shapes.some(s => s.id === qShape)) state.shape = qShape
        const qMetal = qp.get('metal'); if (qMetal && METAL_PRESETS.some(m => m.id === qMetal)) state.metal = qMetal
        const qCarat = qp.get('carat'); if (qCarat && catalog.sizes.includes(qCarat)) state.size = qCarat
        const qAuto = qp.get('autorotate'); if (qAuto === '1' || qAuto === 'true') autoRotate = true
        const qSpeed = parseFloat(qp.get('rotspeed') || ''); if (!isNaN(qSpeed) && qSpeed > 0) autoRotateSpeed = qSpeed
    }

    bindGrid('shape-grid', catalog.shapes, 'shape', SHAPE_ICONS, false, () => { refreshProngAvailability(); scheduleAutoBuild() })
    bindSizes()
    bindGrid('prong-grid', catalog.prongs, 'prong', undefined, true, scheduleAutoBuild)
    // 'NONE' = ring without an accent band (findBestBand returns null → skipped in buildRing)
    bindGrid('band-grid', [{ id: 'NONE', label: 'None' }, ...catalog.bandStyles], 'band', undefined, true, scheduleAutoBuild)
    bindGrid('shank-grid', catalog.shankStyles, 'shank', undefined, true, scheduleAutoBuild)
    // Metal preset recolors the loaded ring live — no rebuild needed
    bindMetalGrid(id => {
        syncMetalProfileFromPreset(id)
        refreshMaterials()
        setStatus(`${state.prong} ${state.shape} ${state.size}ct · ${state.metal}`)
    })
    syncMetalProfileFromPreset(state.metal)
    refreshProngAvailability()
    bindFingerSizes()
    bindEngraving()
    setupTuningPanel()
    setupEmbedMessageListener()
    updateSummary()

    setLoader('Starting 3D viewer...')
    const canvas = byId('webgi-canvas') as HTMLCanvasElement
    viewer = new ViewerApp({ canvas, useGBufferDepth: true, isAntialiased: false })

    const r = (viewer.renderer as any).rendererObject
    if (r) {
        r.shadowMap.enabled = true; r.shadowMap.type = 1
        r.physicallyCorrectLights = true; r.outputEncoding = 3001
        r.toneMapping = 4; r.toneMappingExposure = 1.2
    }
    // Supersample: render at 2x (min) and let it downscale to the canvas — this
    // is the real sharpness lever. On a standard 1x monitor the viewer was
    // rendering at CSS resolution (soft, especially with TAA jitter mid-motion);
    // 2x makes the whole frame and the diamonds crisp. Capped at 2.5x so
    // high-DPI phones stay performant.
    const _dpr = window.devicePixelRatio || 1
    ;(viewer.renderer as any).displayCanvasScaling = Math.min(Math.max(_dpr, 2), 2.5)
    // Re-sync the render buffer to the canvas size. This is the real blur fix:
    // the Shopify iframe mounts small then grows, and without a resize WebGI
    // keeps a tiny render buffer that gets upscaled (blurring the whole frame).
    const onViewerResize = () => { try { (viewer as any).resize?.() } catch {} ; viewer.setDirty() }
    window.addEventListener('resize', onViewerResize)

    await viewer.addPlugin(AssetManagerPlugin)
    await viewer.addPlugin(GBufferPlugin)
    const pp = await viewer.addPlugin(ProgressivePlugin)
    const tonemap = await viewer.addPlugin(TonemapPlugin)
    if (tonemap) { tonemap.exposure = 1.0; tonemap.saturation = 1.1; tonemap.contrast = 1.1 }
    tonemapPlugin = tonemap
    const ssao = await viewer.addPlugin(SSAOPlugin)
    if (ssao) (ssao as any).intensity = 0.25
    // Registers the .exr importer — without it env_gem_002.exr cannot load
    try { await viewer.addPlugin(EXRLoadPlugin) } catch (e) { console.warn('EXRLoadPlugin failed', e) }
    try { await viewer.addPlugin(FrameFadePlugin) } catch {}
    try { await viewer.addPlugin(TemporalAAPlugin) } catch {}

    // Add DiamondPlugin BEFORE loading models to avoid WebGI errors
    try {
        const dp = await viewer.addPlugin(DiamondPlugin)
        if (dp) (dp as any).forceSceneEnvMap = false
        diamondPluginInstance = dp
    } catch {}
    // NOTE: RandomizedDirectionalLightPlugin was removed — it jitters the light
    // every frame to build soft shadows via progressive accumulation, but since
    // the builder redraws continuously (rotation), it never converges and the
    // shadow + diamond reflections flicker/blink. A static directional light
    // (added below) gives stable, flicker-free shadows.

    // Soft contact shadow under the ring (white ground on white bg = shadow only).
    // NOTE: never use GroundPlugin.groundReflection — it breaks the viewer (see AGENTS.md)
    try {
        groundPlugin = await viewer.addPlugin(ContactShadowGroundPlugin)
        if (groundPlugin) {
            groundPlugin.visible = groundEnabled
            groundPlugin.contactShadows = true
            // Tighter, darker contact shadow so the ring reads grounded (less blur
            // + a focused ground size = a more visible shadow under the band).
            if ('blurAmount' in groundPlugin) groundPlugin.blurAmount = 0.7
            if ('shadowScale' in groundPlugin) groundPlugin.shadowScale = 1
            if ('size' in groundPlugin) groundPlugin.size = 48  // big default; frameModel refines per-model
        }
    } catch (e) { console.warn('ContactShadowGroundPlugin failed', e) }


    const dl = new DirectionalLight(0xffffff, 3)
    dl.position.set(5, 10, 7); dl.castShadow = true
    dl.shadow.mapSize.width = 4096; dl.shadow.mapSize.height = 4096
    dl.shadow.bias = -0.0001; dl.shadow.normalBias = 0.02
    dl.shadow.radius = 8
    dl.shadow.camera.near = 0.1; dl.shadow.camera.far = 100
    dl.shadow.camera.left = -20; dl.shadow.camera.right = 20
    dl.shadow.camera.top = 20; dl.shadow.camera.bottom = -20
    ;(viewer.scene as any).add(dl)
    ;(viewer.scene as any).add(new AmbientLight(0xffffff, 0.5))

    const cam = viewer.scene.activeCamera
    cam.near = 0.1; cam.far = 1000
    cam.setCameraOptions?.({ fov: 25 })
    // Aim at the ring centre so the elevated camera (below) frames it correctly.
    try { (cam as any).target?.set?.(0, 0, 0) } catch {}
    const ctrl = (cam as any).controls
    if (ctrl) ctrl.enabled = false

    // Flat white background — matches iJewel's 1_bg_white.svg (a plain #FFFFFF fill).
    viewer.scene.setBackground(linColor(BG_BONE_COLOR))

    await loadDefaultEnvironments()

    viewer.addEventListener('preFrame', () => {
        const root = getRotationTarget()
        if (modelLoaded && root) {
            if (autoRotate && !isRotating) targetRotationY += autoRotateSpeed * 0.01
            // Critically-damped style easing toward targets — the "ice smooth" feel
            rotationX += (targetRotationX - rotationX) * SMOOTHING
            rotationY += (targetRotationY - rotationY) * SMOOTHING
            rotationZ += (targetRotationZ - rotationZ) * SMOOTHING
            cameraZoom += (targetZoom - cameraZoom) * SMOOTHING
            const cam = viewer.scene.activeCamera
            cam.position.set(0, cameraZoom * CAM_ELEVATION, cameraZoom)
            if (typeof cam.positionUpdated === 'function') cam.positionUpdated(false)
            root.rotation.order = 'YXZ'
            root.rotation.y = rotationY
            root.rotation.x = rotationX
            root.rotation.z = rotationZ
            root.updateMatrixWorld?.(true)
            try { const rr = (viewer.renderer as any).rendererObject; if (rr?.shadowMap) rr.shadowMap.needsUpdate = true } catch {}
            viewer.setDirty()
        }
    })

    canvas.addEventListener('mousedown', (e) => { isRotating = true; lastX = e.clientX; lastY = e.clientY })
    window.addEventListener('mousemove', (e) => {
        if (!isRotating || !modelLoaded || !ringModel) return
        const dx = e.clientX - lastX; const dy = e.clientY - lastY
        if (e.altKey) { targetRotationZ += dx * 0.008 }
        else { targetRotationY += dx * 0.008; targetRotationX += dy * 0.006 }
        lastX = e.clientX; lastY = e.clientY; viewer.setDirty()
    })
    window.addEventListener('mouseup', () => { isRotating = false })

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isRotating = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY
        } else if (e.touches.length === 2) {
            // Two fingers = pinch-to-zoom (not rotate).
            isRotating = false
            lastPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY)
        }
    }, { passive: true })
    window.addEventListener('touchmove', (e) => {
        if (!modelLoaded || !ringModel) return
        if (e.touches.length === 1 && isRotating) {
            const dx = e.touches[0].clientX - lastX; const dy = e.touches[0].clientY - lastY
            targetRotationY += dx * 0.008; targetRotationX += dy * 0.006
            lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; viewer.setDirty()
        } else if (e.touches.length === 2) {
            // Pinch-to-zoom: spread fingers = zoom in, pinch = zoom out.
            e.preventDefault()
            const d = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY)
            if (lastPinchDist > 0) {
                const step = (zoomMax - zoomMin) * 0.004
                targetZoom = Math.max(zoomMin, Math.min(zoomMax, targetZoom + (lastPinchDist - d) * step))
            }
            lastPinchDist = d
            viewer.setDirty()
        }
    }, { passive: false })
    window.addEventListener('touchend', () => { isRotating = false; lastPinchDist = 0 })
    window.addEventListener('touchcancel', () => { isRotating = false; lastPinchDist = 0 })

    canvas.addEventListener('wheel', (e) => {
        if (modelLoaded) {
            e.preventDefault()
            const d = e.deltaY > 0 ? 1 : -1
            const step = (zoomMax - zoomMin) * 0.07
            targetZoom = Math.max(zoomMin, Math.min(zoomMax, targetZoom + d * step))
            viewer.setDirty()
        }
    }, { passive: false })

    hideLoader()
    setStatus('Loading default ring...')

    // Custom model upload (GLB / glTF / 3DM) with diamond patch
    const modelInput = byId('model-input') as HTMLInputElement | null
    modelInput?.addEventListener('change', () => {
        const f = modelInput.files?.[0]
        if (f) loadCustomModel(f)
        modelInput.value = ''  // allow re-selecting the same file
    })
    // "Back to catalog" rebuilds the configured ring
    byId('reset-catalog-btn')?.addEventListener('click', () => buildRing())
    // Snapshot / download PNG
    byId('btn-snapshot')?.addEventListener('click', downloadSnapshot)
    // Add to Cart (Shopify)
    byId('add-cart-btn')?.addEventListener('click', addToCart)

    await new Promise<void>(r => requestAnimationFrame(() => r()))
    await loadHand()
    await buildRing()

    // Embed: announce the starting configuration to the Shopify parent page so
    // the default prong/band/shank/ring-size become line-item properties even
    // before the shopper touches anything inside the iframe.
    try { postOptionChange('init', state.shape) } catch {}
    // Publish the option catalog so the parent page can render prong/band/shank
    // selectors. Sent once now; also re-sent on demand via 'rb:requestCatalog'.
    try { postCatalogToParent() } catch {}
    // Match the render buffer to the final canvas size (the embed iframe often
    // grows after first paint) so the result is sharp, not upscaled.
    requestAnimationFrame(() => { try { (viewer as any).resize?.() } catch {} ; viewer.setDirty() })
}

init().catch(e => { console.error(e); setError('Init: ' + (e?.message || e)); hideLoader() })

// Debug / external API
;(window as any).__ringBuilder = {
    get viewer() { return viewer },
    get metalEnvironment() { return metalEnvironment },
    get gemEnvironment() { return gemEnvironment },
    get groundPlugin() { return groundPlugin },
    setMetalEnvironment,
    setGemEnvironment,
    buildRing,
    loadCustomModel,
    downloadSnapshot,
    addToCart,
    getConfiguration,
    eng3d,
    updateEngraving3D,
    get engravingMesh() { return engravingMesh },
    get usingCustomModel() { return usingCustomModel },
    // Hand-mode placement tuning. Adjust then call replaceRingOnHand().
    hand,
    replaceRingOnHand() { attachRingToHand(getRingRoot()); frameModel(false) },
    get handRoot() { return handRoot },
}
