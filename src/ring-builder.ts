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

const METAL_PRESETS = [
    { id: 'yellowGold', label: 'Yellow Gold', color: '#d4af37', metalness: 1, roughness: 0.15, envIntensity: 2.2 },
    { id: 'whiteGold', label: 'White Gold', color: '#e8e8e8', metalness: 1, roughness: 0.1, envIntensity: 2.5 },
    { id: 'roseGold', label: 'Rose Gold', color: '#e8b4a0', metalness: 1, roughness: 0.12, envIntensity: 2.2 },
    { id: 'platinum', label: 'Platinum', color: '#d4d4d8', metalness: 1, roughness: 0.08, envIntensity: 2.8 },
    { id: 'silver', label: 'Silver', color: '#e2e2e6', metalness: 1, roughness: 0.05, envIntensity: 3.0 },
    { id: 'gold_14k', label: '14K Gold', color: '#c8a832', metalness: 1, roughness: 0.15, envIntensity: 2.0 },
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

let isRotating = false
let lastX = 0; let lastY = 0
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
let metalEnvIntensity = 1.0
let metalEnvRotationDeg = 0

// Live-tunable metal values (right panel) — initialised from the selected preset
const metalProfile = { color: '#e8e8e8', metalness: 1, roughness: 0.1, envIntensity: 2.5 }

const state: Record<string, string> = {
    shape: '', size: '', prong: '', band: '', shank: '', metal: 'whiteGold',
}

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
    ;(env as any).intensity = metalEnvIntensity
    ;(env as any).rotation = metalEnvRotationDeg * (Math.PI / 180)
    await viewer.scene.setEnvironment(env)
    metalEnvironment = env
    renderRefresh()
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

function applyMetal(mat: any) {
    if (!mat) return
    try {
        if ('color' in mat) mat.color = linColor(metalProfile.color)
        if ('metalness' in mat) mat.metalness = metalProfile.metalness
        if ('roughness' in mat) mat.roughness = metalProfile.roughness
        if ('envMapIntensity' in mat) mat.envMapIntensity = metalProfile.envIntensity
        if ('clearcoat' in mat) mat.clearcoat = Math.max(mat.clearcoat || 0, 0.15)
        if ('clearcoatRoughness' in mat) mat.clearcoatRoughness = 0.08
        if ('specularIntensity' in mat) mat.specularIntensity = 1.0
        mat.needsUpdate = true
    } catch {}
}

function syncMetalProfileFromPreset(presetId: string) {
    const p = METAL_PRESETS.find(m => m.id === presetId) || METAL_PRESETS[0]
    metalProfile.color = p.color
    metalProfile.metalness = p.metalness
    metalProfile.roughness = p.roughness
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

function frameModel() {
    if (!viewer || !ringModel) return
    const box = computeBounds()
    if (box.isEmpty()) return
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.01)
    const root = getRingRoot()
    if (!root) return
    root.position.set(-center.x, -center.y, -center.z)
    root.updateMatrixWorld?.(true)
    zoomMin = maxDim * 1.5
    zoomMax = maxDim * 6
    targetZoom = maxDim * 3.2
    // Entrance animation: start pulled back + turned away, ease into place
    cameraZoom = maxDim * 4.4
    rotationY = -0.9; targetRotationY = 0
    rotationX = -0.4; targetRotationX = -0.05
    rotationZ = 0; targetRotationZ = 0
    const cam = viewer.scene.activeCamera
    cam.position.set(0, 0, cameraZoom)
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

        setLoader('Framing view...')
        await new Promise<void>(r => requestAnimationFrame(() => r()))
        frameModel()

        modelLoaded = true
        const pp = viewer.getPlugin?.(ProgressivePlugin) as any
        if (pp && typeof pp.reset === 'function') pp.reset()
        try { (viewer.renderer as any).refreshPipeline() } catch {}
        viewer.setDirty()

        setStatus(`${state.prong} ${state.shape} ${state.size}ct · ${state.metal}`)
        updateSummary()
    } catch (e: any) {
        console.error('Build failed:', e)
        setError('Build failed: ' + (e?.message || e))
    } finally {
        canvasFade(false)
        hideLoader()
        isBuilding = false
    }
}

function updateSummary() {
    const sl = catalog.shapes.find(s => s.id === state.shape)?.label || state.shape
    const pl = catalog.prongs.find(p => p.id === state.prong)?.label || state.prong
    const bl = catalog.bandStyles.find(b => b.id === state.band)?.label || state.band
    const shl = catalog.shankStyles.find(s => s.id === state.shank)?.label || state.shank
    const ml = METAL_PRESETS.find(m => m.id === state.metal)?.label || state.metal
    byId('summary-diamond').textContent = `${sl} · ${state.size}ct`
    byId('summary-prong').textContent = pl
    byId('summary-band').textContent = bl
    byId('summary-shank').textContent = shl
    byId('summary-metal').textContent = ml
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
            onSelect?.(state[stateKey])
        })
    })
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
        })
    })
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
    if (metalEnvironment) {
        ;(metalEnvironment as any).intensity = metalEnvIntensity
        ;(metalEnvironment as any).rotation = metalEnvRotationDeg * (Math.PI / 180)
    }
    const pp = viewer?.getPlugin?.(ProgressivePlugin) as any
    if (pp && typeof pp.reset === 'function') pp.reset()
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

    bindGrid('shape-grid', catalog.shapes, 'shape', SHAPE_ICONS)
    bindSizes()
    bindGrid('prong-grid', catalog.prongs, 'prong', undefined, true)
    bindGrid('band-grid', catalog.bandStyles, 'band', undefined, true)
    bindGrid('shank-grid', catalog.shankStyles, 'shank', undefined, true)
    // Metal preset recolors the loaded ring live — no rebuild needed
    bindGrid('metal-grid', METAL_PRESETS, 'metal', METAL_ICONS, true, id => {
        syncMetalProfileFromPreset(id)
        refreshMaterials()
        setStatus(`${state.prong} ${state.shape} ${state.size}ct · ${state.metal}`)
    })
    syncMetalProfileFromPreset(state.metal)
    setupTuningPanel()
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
    try { await viewer.addPlugin(RandomizedDirectionalLightPlugin) } catch {}

    // Soft contact shadow under the ring (white ground on white bg = shadow only).
    // NOTE: never use GroundPlugin.groundReflection — it breaks the viewer (see AGENTS.md)
    try {
        groundPlugin = await viewer.addPlugin(ContactShadowGroundPlugin)
        if (groundPlugin) {
            groundPlugin.visible = groundEnabled
            groundPlugin.contactShadows = true
            if ('blurAmount' in groundPlugin) groundPlugin.blurAmount = 1.6
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
    const ctrl = (cam as any).controls
    if (ctrl) ctrl.enabled = false

    viewer.scene.setBackground(linColor('#ffffff'))

    await loadDefaultEnvironments()

    viewer.addEventListener('preFrame', () => {
        const root = getRingRoot()
        if (modelLoaded && root) {
            if (autoRotate && !isRotating) targetRotationY += autoRotateSpeed * 0.01
            // Critically-damped style easing toward targets — the "ice smooth" feel
            rotationX += (targetRotationX - rotationX) * SMOOTHING
            rotationY += (targetRotationY - rotationY) * SMOOTHING
            rotationZ += (targetRotationZ - rotationZ) * SMOOTHING
            cameraZoom += (targetZoom - cameraZoom) * SMOOTHING
            const cam = viewer.scene.activeCamera
            cam.position.set(0, 0, cameraZoom)
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
        if (e.touches.length !== 1 && e.touches.length !== 2) return
        isRotating = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY
    }, { passive: true })
    window.addEventListener('touchmove', (e) => {
        if (!isRotating || !modelLoaded || !ringModel) return
        if (e.touches.length === 1) {
            const dx = e.touches[0].clientX - lastX; const dy = e.touches[0].clientY - lastY
            targetRotationY += dx * 0.008; targetRotationX += dy * 0.006
            lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; viewer.setDirty()
        } else if (e.touches.length === 2) {
            targetRotationZ += ((e.touches[0].clientX + e.touches[1].clientX) / 2 - lastX) * 0.008
            lastX = (e.touches[0].clientX + e.touches[1].clientX) / 2; viewer.setDirty()
        }
    }, { passive: false })
    window.addEventListener('touchend', () => { isRotating = false })
    window.addEventListener('touchcancel', () => { isRotating = false })

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
    byId('build-btn')?.addEventListener('click', buildRing)

    await new Promise<void>(r => requestAnimationFrame(() => r()))
    await buildRing()
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
}
