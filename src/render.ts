// Standalone bulk GLB renderer — NOT the builder. Upload exported ring GLBs,
// render each at chosen angles with studio lighting + diamond shaders, download
// a ZIP of PNGs. Reuses the same WebGI pipeline as the ring builder.
import {
    ViewerApp,
    AssetManagerPlugin,
    GBufferPlugin,
    ProgressivePlugin,
    TonemapPlugin,
    SSAOPlugin,
    EXRLoadPlugin,
    ContactShadowGroundPlugin,
    FrameFadePlugin,
    TemporalAAPlugin,
    DiamondPlugin,
    BloomPlugin,
    VignettePlugin,
    SSBevelPlugin,
    SSGIPlugin,
    GammaCorrectionPlugin,
    FilmicGrainPlugin,
    ChromaticAberrationPlugin,
    DRACOLoader2,
    Color,
    Mesh,
    Vector3,
    Box3,
    Matrix4,
    DirectionalLight,
    AmbientLight,
    DoubleSide,
} from './webgi-re-exports'
import { patchGlbWithDiamondMetadata } from './webgiDiamondPatch'
import JSZip from 'jszip'

// Patch three r144+ removed method webgi's bundle expects
const _p = Object.getPrototypeOf(Mesh.prototype)
if (typeof _p.updateWorldMatrix !== 'function') {
    _p.updateWorldMatrix = function (up: boolean, down: boolean) {
        if (up && this.parent) this.parent.updateWorldMatrix(true, false)
        this.updateMatrix(); this.matrixWorld.copy(this.matrix)
        if (down) for (const c of this.children) c.updateWorldMatrix(false, true)
    }
    _p.updateMatrix = function () { this.matrix.compose(this.position, this.quaternion, this.scale); this.matrixWorldNeedsUpdate = true }
}

const METAL_ENV = './assets/env_metal_001.hdr'
const GEM_ENV = './assets/env_gem_002.exr'
const BONE = '#f4f4eb'
const DIAMOND_NAME_RE = /diamond|diamonds|gem|stone|solit(er|a)|brilliant|brillant|cz|moissanite|ruby|sapphire|emerald/i
// Full DiamondMaterial profile — matches the builder's DIAMOND_PROFILE so the
// gem renders identically here.
const DIAMOND = {
    color: '#ffffff', envMapIntensity: 2.0, envMapRotation: 0, dispersion: 0.015,
    squashFactor: 0.98, geometryFactor: 0.5, gammaFactor: 1.2, absorptionFactor: 0.4,
    reflectivity: 0.7, transmission: 0.0, refractiveIndex: 2.6, rayBounces: 6,
    diamondOrientedEnvMap: 0, boostFactors: [1.0, 1.0, 1.0] as [number, number, number],
}
const METALS: Record<string, string> = {
    whiteGold: '#c2c2c3', yellowGold: '#c5ad6d', roseGold: '#e6ac97', platinum: '#d6d6d9',
}
let metalChoice = 'whiteGold' // or 'original' to keep GLB colours
// Full metal profile — parity with the builder's tuning panel.
// color '' = use metalChoice preset colour.
const metalP = {
    roughness: 0.0, env: 1.6, metalness: 1, color: '',
    reflectivity: 0.5, clearcoat: 0, clearcoatRoughness: 0.08,
    specularIntensity: 1.0, specularColor: '#ffffff',
    sheen: 0, sheenRoughness: 1,
    iridescence: 0, iridescenceIOR: 1.3,
    anisotropy: 0, anisotropyRotation: 0,
    emissive: '#000000',
    transmission: 0.0, thickness: 0, attenuationDistance: 0, attenuationColor: '#ffffff',
}
let metalEnvRotationDeg = 0
let sceneEnvIntensity = 1.0
let tonemap: any = null
const ANGLES: Record<string, { x: number; y: number; z: number }> = {
    front: { x: -0.05, y: 0, z: 0 },
    threeq: { x: -0.12, y: 0.7, z: 0 },
    side: { x: -0.05, y: Math.PI / 2, z: 0 },
    top: { x: -1.2, y: 0, z: 0 },
}

let viewer: ViewerApp
let diamondPlugin: any = null
let groundPlugin: any = null
let model: any = null
let cameraZoom = 5
const raf = () => new Promise<void>(r => requestAnimationFrame(() => r()))
const byId = (id: string) => document.getElementById(id) as any
const linColor = (h: string) => new Color(h).convertSRGBToLinear()

function patchDraco() {
    const proto = (DRACOLoader2 as any)?.prototype
    if (!proto || proto.__lp) return
    const orig = proto.preload
    if (typeof orig !== 'function') return
    proto.preload = function (...a: any[]) { try { this.setDecoderPath('assets/draco/'); this.setDecoderConfig({ type: 'js' }) } catch {} return orig.apply(this, a) }
    proto.__lp = true
}

function getRoot(r: any) { return r?.modelObject || r?.scene || r }

function isDiamond(mesh: any) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) { if (m?.extensions?.WEBGI_materials_diamond || m?.isDiamondMaterialParameters || m?.type === 'DiamondMaterial') return true }
    const name = `${mesh.name || ''} ${mats.map((m: any) => m?.name || '').join(' ')}`.toLowerCase()
    if (/\b(prong|shank|bezel|band)\b/.test(name) && !DIAMOND_NAME_RE.test(name)) return false
    return DIAMOND_NAME_RE.test(name)
}

function applyMaterials(root: any) {
    root?.traverse?.((c: any) => {
        if (!c.isMesh || !c.material) return
        c.castShadow = c.receiveShadow = true
        const mats = Array.isArray(c.material) ? c.material : [c.material]
        const dia = isDiamond(c)
        for (const m of mats) {
            if (!m) continue
            if (dia) {
                const d = DIAMOND
                const ext = m.extensions?.WEBGI_materials_diamond
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
                if ('color' in m) m.color = linColor(d.color)
                if ('envMapIntensity' in m) m.envMapIntensity = d.envMapIntensity
                if ('dispersion' in m) m.dispersion = d.dispersion
                if ('absorptionFactor' in m) m.absorptionFactor = d.absorptionFactor
                if ('refractiveIndex' in m) m.refractiveIndex = d.refractiveIndex
                if ('squashFactor' in m) m.squashFactor = d.squashFactor
                if ('geometryFactor' in m) m.geometryFactor = d.geometryFactor
                if ('gammaFactor' in m) m.gammaFactor = d.gammaFactor
                if ('transmission' in m) m.transmission = d.transmission
                if ('reflectivity' in m) m.reflectivity = d.reflectivity
                if ('rayBounces' in m) m.rayBounces = d.rayBounces
                if ('diamondOrientedEnvMap' in m) m.diamondOrientedEnvMap = d.diamondOrientedEnvMap
                if ('boostFactors' in m && m.boostFactors?.set) m.boostFactors.set(d.boostFactors[0], d.boostFactors[1], d.boostFactors[2])
            } else {
                const mcol = metalP.color || (metalChoice !== 'original' ? (METALS[metalChoice] || METALS.whiteGold) : '')
                if (mcol && 'color' in m) m.color = linColor(mcol)
                if ('metalness' in m) m.metalness = metalP.metalness
                if ('roughness' in m) m.roughness = metalP.roughness
                if ('envMapIntensity' in m) m.envMapIntensity = metalP.env
                if ('reflectivity' in m) m.reflectivity = metalP.reflectivity
                if ('specularIntensity' in m) m.specularIntensity = metalP.specularIntensity
                if ('specularColor' in m) m.specularColor = linColor(metalP.specularColor)
                if ('clearcoat' in m) m.clearcoat = metalP.clearcoat
                if ('clearcoatRoughness' in m) m.clearcoatRoughness = metalP.clearcoatRoughness
                if ('sheen' in m) m.sheen = metalP.sheen
                if ('sheenRoughness' in m) m.sheenRoughness = metalP.sheenRoughness
                if ('iridescence' in m) m.iridescence = metalP.iridescence
                if ('iridescenceIOR' in m) m.iridescenceIOR = metalP.iridescenceIOR
                if ('anisotropy' in m) m.anisotropy = metalP.anisotropy
                if ('anisotropyRotation' in m) m.anisotropyRotation = metalP.anisotropyRotation
                if ('emissive' in m) m.emissive = linColor(metalP.emissive)
                if ('transmission' in m) m.transmission = metalP.transmission
                if ('thickness' in m) m.thickness = metalP.thickness
                if ('attenuationDistance' in m) m.attenuationDistance = metalP.attenuationDistance
                if ('attenuationColor' in m) m.attenuationColor = linColor(metalP.attenuationColor)
                // iJewel .pmat sets "side": 2 (DoubleSide). Without this the thin
                // band's inner wall is culled and the ring reads hollow/fake.
                if ('side' in m) m.side = DoubleSide
            }
            m.needsUpdate = true
        }
    })
    if (diamondPlugin?.refreshEnvMaps) diamondPlugin.refreshEnvMaps()
}

function worldBounds(root: any): Box3 {
    const box = new Box3(); const v = new Vector3()
    root.updateMatrixWorld?.(true)
    root.traverse((c: any) => {
        if (!c.geometry || c.visible === false) return
        const g = c.geometry
        if (!g.boundingBox && g.computeBoundingBox) g.computeBoundingBox()
        const bb = g.boundingBox; if (!bb) return
        for (let i = 0; i < 8; i++) { v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(c.matrixWorld); box.expandByPoint(v) }
    })
    return box
}

let baseZoom = 5, zoomFactor = 1, panX = 0, panY = 0, frameMaxDim = 1

let CAM_ELEV = 0.42        // top-front tilt (higher = more looking down)
let CAM_DROP = 0.24        // look above the ring centre → ring sits lower, headroom above
const STUDIO_BG = '#ece9e3' // warm neutral catalog backdrop
function applyCamera() {
    cameraZoom = baseZoom / zoomFactor
    const cam = viewer.scene.activeCamera
    const ty = panY + frameMaxDim * CAM_DROP
    cam.position.set(panX, cameraZoom * CAM_ELEV + ty, cameraZoom)
    cam.target?.set?.(panX, ty, 0)
    cam.positionUpdated?.(false); viewer.setDirty()
}

function frame() {
    const root = getRoot(model); if (!root) return
    root.position.set(0, 0, 0); root.updateMatrixWorld?.(true)
    const box = worldBounds(root); if (box.isEmpty()) return
    const center = box.getCenter(new Vector3()); const size = box.getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.01)
    root.position.set(-center.x, -center.y, -center.z); root.updateMatrixWorld?.(true)
    frameMaxDim = maxDim
    baseZoom = maxDim * 3.0
    panX = 0; panY = 0  // recentre on new model (keep user's zoom)
    if (groundPlugin) { if ('size' in groundPlugin) groundPlugin.size = maxDim * 4.5; if ('yOffset' in groundPlugin) groundPlugin.yOffset = -0.008 * maxDim }
    applyCamera()
}

function setAngle(a: { x: number; y: number; z: number }) {
    const root = getRoot(model); if (!root) return
    root.rotation.order = 'YXZ'; root.rotation.set(a.x, a.y, a.z); root.updateMatrixWorld?.(true); viewer.setDirty()
}

function disposeModel() {
    const root = getRoot(model)
    if (root?.parent) {
        root.traverse?.((c: any) => { if (c.isMesh) { c.geometry?.dispose?.(); const ms = Array.isArray(c.material) ? c.material : [c.material]; for (const m of ms) m?.dispose?.() } })
        root.parent.remove(root)
    }
    model = null
}

async function loadFile(file: File) {
    disposeModel()
    patchDraco()
    const mgr = viewer.getPlugin(AssetManagerPlugin) as any
    const importer = mgr.importer
    const patched = await patchGlbWithDiamondMetadata(file, undefined, { fallbackToFirst: false } as any)
    const result = await importer.importSingle({ path: file.name, file: patched })
    if (!result) throw new Error('import failed')
    viewer.scene.addSceneObject(result, { autoScale: false })
    model = result
    applyMaterials(getRoot(model))
    await raf()
    frame()
    await raf(); await raf()
}

async function setBg(mode: string) {
    const r = (viewer.renderer as any)
    const ro = r.rendererObject
    if (mode === 'transparent') { ro.setClearAlpha?.(0); try { viewer.scene.setBackground(null as any) } catch {} ; if (viewer.scene as any) (viewer.scene as any).background = null }
    else { ro.setClearAlpha?.(1); viewer.scene.setBackground(linColor(mode === 'white' ? '#ffffff' : mode === 'studio' ? STUDIO_BG : BONE)) }
    viewer.setDirty()
}

// One-click soft studio catalog look (warm backdrop, soft realistic ground
// shadow, gentle lighting + clean diamond) — matches a typical product photo.
async function applyCatalogLook() {
    await setBg('studio')
    // soft, clean tone (less punchy than the default)
    if (tonemap) { tonemap.exposure = 1.12; tonemap.contrast = 1.22; tonemap.saturation = 1.35 }
    // strong, visible soft shadow on the surface
    if (groundPlugin) {
        groundPlugin.visible = true
        if ('blurAmount' in groundPlugin) groundPlugin.blurAmount = 2.0
        const gm = groundPlugin.material; if (gm) { gm.transparent = true; gm.opacity = 1.4; gm.needsUpdate = true }
        if ('darkness' in groundPlugin) (groundPlugin as any).darkness = 1.4
    }
    const sh = byId('shadow') as HTMLInputElement | null; if (sh) sh.checked = true
    // soft neutral metal env
    const menv = await loadEnvTexture('./assets/env_metal_001.hdr')
    if (menv?.assetType === 'texture') { await viewer.scene.setEnvironment(menv); const sc = viewer.scene as any; sc.envMapIntensity = sceneEnvIntensity; sc.refreshEnvMapIntensity?.() }
    // moderate top-front catalog angle
    CAM_ELEV = 0.30; CAM_DROP = 0.20
    applyCamera()
    reapply()
    prog('Catalog studio look applied')
}

// Centre-crop the render to a target aspect (4:5 etc.) at a chosen output width
function cropToAspect(src: HTMLCanvasElement, aspect: string, outW: number): Promise<Blob | null> {
    const [aw, ah] = aspect.split(':').map(Number)
    const ratio = aw / ah
    const sw = src.width, sh = src.height
    let cw = sw, ch = sw / ratio
    if (ch > sh) { ch = sh; cw = sh * ratio }
    const cx = (sw - cw) / 2, cy = (sh - ch) / 2
    const W = Math.round(outW), H = Math.round(outW / ratio)
    const o = document.createElement('canvas'); o.width = W; o.height = H
    const ctx = o.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, cx, cy, cw, ch, 0, 0, W, H)  // transparent bg preserved
    return new Promise(res => o.toBlob(res, 'image/png'))
}

async function captureBlob(pr: number, aspect = '', outW = 1600): Promise<Blob | null> {
    const wr = viewer.renderer as any; const ro = wr.rendererObject; const canvas: HTMLCanvasElement = ro.domElement
    const orig = ro.getPixelRatio()
    ro.setPixelRatio(pr); wr.displayCanvasScaling = pr; wr.refreshPipeline?.(); viewer.setDirty()
    // Let the progressive + diamond ray-trace converge so gems render crisp,
    // not noisy/dark (single-frame grabs the unconverged image)
    const pp = viewer.getPlugin?.(ProgressivePlugin) as any
    pp?.reset?.()
    for (let i = 0; i < 48; i++) { viewer.setDirty(); await raf() }
    const blob = aspect
        ? await cropToAspect(canvas, aspect, outW)
        : await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
    ro.setPixelRatio(orig); wr.displayCanvasScaling = orig; wr.refreshPipeline?.(); viewer.setDirty()
    return blob
}

async function init() {
    const canvas = byId('c') as HTMLCanvasElement
    viewer = new ViewerApp({ canvas, useGBufferDepth: true, isAntialiased: false })
    const r = (viewer.renderer as any).rendererObject
    if (r) { r.shadowMap.enabled = true; r.shadowMap.type = 1; r.physicallyCorrectLights = true; r.outputEncoding = 3001; r.toneMapping = 4; r.toneMappingExposure = 1.2 }

    await viewer.addPlugin(AssetManagerPlugin)
    await viewer.addPlugin(GBufferPlugin)
    await viewer.addPlugin(ProgressivePlugin)
    const tm = await viewer.addPlugin(TonemapPlugin); if (tm) { tm.exposure = 1.16; tm.saturation = 1.91; tm.contrast = 1.48 } tonemap = tm
    const ssao = await viewer.addPlugin(SSAOPlugin); if (ssao) (ssao as any).intensity = 0.25
    try { await viewer.addPlugin(EXRLoadPlugin) } catch {}
    try { await viewer.addPlugin(FrameFadePlugin) } catch {}
    try { await viewer.addPlugin(TemporalAAPlugin) } catch {}
    // Realism post-FX (iJewel-style). Conservative so the ring doesn't blow out.
    try { const bl = await viewer.addPlugin(BloomPlugin) as any; if (bl) { bl.pass && (bl.pass.bloomIterations = 6); bl.intensity = 0.22; bl.threshold = 0.9 } } catch (e) { console.warn('Bloom', e) }
    try { const vg = await viewer.addPlugin(VignettePlugin) as any; if (vg) vg.power = 0.7 } catch (e) { console.warn('Vignette', e) }
    try { await viewer.addPlugin(SSBevelPlugin) } catch (e) { console.warn('SSBevel', e) }
    try { const gi = await viewer.addPlugin(SSGIPlugin) as any; if (gi) gi.intensity = 0.5 } catch (e) { console.warn('SSGI', e) }
    // iJewel post stack: gamma-correct output + subtle grain & chromatic aberration
    try { await viewer.addPlugin(GammaCorrectionPlugin) } catch (e) { console.warn('Gamma', e) }
    try { const fg = await viewer.addPlugin(FilmicGrainPlugin) as any; if (fg && 'intensity' in fg) fg.intensity = Math.min(fg.intensity ?? 0.4, 0.4) } catch (e) { console.warn('Grain', e) }
    try { await viewer.addPlugin(ChromaticAberrationPlugin) } catch (e) { console.warn('ChromAb', e) }
    try { const dp = await viewer.addPlugin(DiamondPlugin); if (dp) (dp as any).forceSceneEnvMap = false; diamondPlugin = dp } catch {}
    try { groundPlugin = await viewer.addPlugin(ContactShadowGroundPlugin); if (groundPlugin) { groundPlugin.contactShadows = true; if ('blurAmount' in groundPlugin) groundPlugin.blurAmount = 1.6 } } catch {}

    // Three-point studio rig (key + fill + rim). On mirror metal the env map
    // drives the reflections, but these sculpt form, brighten the diamond and
    // prongs, and lay a bright edge highlight (rim) for a photographic look.
    // Only the key casts a shadow so we get one clean contact shadow, at 4096.
    const key = new DirectionalLight(0xffffff, 3); key.position.set(5, 10, 7); key.castShadow = true
    key.shadow.mapSize.width = key.shadow.mapSize.height = 4096
    key.shadow.bias = -0.0001; key.shadow.normalBias = 0.02; (key.shadow as any).radius = 8
    const fill = new DirectionalLight(0xffffff, 0.9); fill.position.set(-6, 4, 5)   // soft opposite fill, no shadow
    const rim = new DirectionalLight(0xffffff, 1.6); rim.position.set(-4, 7, -8)     // back/rim catches edges + gem
    ;(viewer.scene as any).add(key); (viewer.scene as any).add(fill); (viewer.scene as any).add(rim)
    ;(viewer.scene as any).add(new AmbientLight(0xffffff, 0.4))

    const cam = viewer.scene.activeCamera; cam.near = 0.1; cam.far = 1000; cam.setCameraOptions?.({ fov: 25 })
    const ctrl = (cam as any).controls; if (ctrl) ctrl.enabled = false
    viewer.scene.setBackground(linColor(BONE))
    // iJewel scene flags: world-anchored reflections + stable progressive noise
    try { (viewer.scene as any).fixedEnvMapDirection = true } catch {}
    try { (viewer.renderer as any).stableNoise = true } catch {}

    await raf()
    const mgr = viewer.getPlugin(AssetManagerPlugin) as any
    let sceneEnvOk = false
    try { const env = await mgr.importer.importSinglePath(METAL_ENV); if (env?.assetType === 'texture') { await viewer.scene.setEnvironment(env); sceneEnvOk = true } } catch (e) { console.warn('metal env', e) }
    // env brightness lives on the scene — without this, metals render black
    const sc = viewer.scene as any
    sc.envMapIntensity = 1.0
    sc.refreshEnvMapIntensity?.()
    try { const gem = await mgr.importer.importSinglePath(GEM_ENV); if (gem?.assetType === 'texture' && diamondPlugin) { diamondPlugin.envMap = gem; diamondPlugin.forceSceneEnvMap = false; diamondPlugin.refreshEnvMaps?.() } else if (!sceneEnvOk && diamondPlugin) { diamondPlugin.refreshEnvMaps?.() } } catch (e) { console.warn('gem env', e) }
    ;(viewer.renderer as any).refreshPipeline?.()
    ;(window as any).__render = { viewer, get scene() { return viewer.scene } }

    wireUI()
}

let pickedFiles: File[] = []
function wireUI() {
    const input = byId('in') as HTMLInputElement
    const go = byId('go') as HTMLButtonElement
    input.addEventListener('change', () => {
        pickedFiles = input.files ? Array.from(input.files) : []
        byId('files').textContent = pickedFiles.length ? `${pickedFiles.length} file(s) selected` : ''
        go.disabled = pickedFiles.length === 0
        // preview first
        if (pickedFiles[0]) loadFile(pickedFiles[0]).catch(e => prog('Preview failed: ' + e.message, true))
    })
    const metalSel = byId('metal') as HTMLSelectElement
    metalSel?.addEventListener('change', () => { metalChoice = metalSel.value; if (model) { applyMaterials(getRoot(model)); viewer.setDirty() } })
    go.addEventListener('click', renderAll)
    byId('catalog-look')?.addEventListener('click', () => applyCatalogLook())
    wireTuning()
}

function reapply() { if (model) applyMaterials(getRoot(model)); diamondPlugin?.refreshEnvMaps?.(); (viewer.renderer as any).refreshPipeline?.(); viewer.setDirty() }

async function loadEnvTexture(path: string) { const mgr = viewer.getPlugin(AssetManagerPlugin) as any; try { return await mgr.importer.importSinglePath(path) } catch { return null } }

function wireTuning() {
    const toggle = byId('tune-toggle'), panel = byId('tune')
    const openTune = () => panel.classList.add('open')
    toggle?.addEventListener('click', () => panel.classList.toggle('open'))
    byId('tune-close')?.addEventListener('click', () => panel.classList.remove('open'))
    const on = (id: string, fn: (v: number) => void) => byId(id)?.addEventListener('input', (e: any) => { fn(Number(e.target.value)); reapply() })
    const onColor = (id: string, fn: (v: string) => void) => byId(id)?.addEventListener('input', (e: any) => { fn(e.target.value); reapply() })
    // Metal
    onColor('t-mcolor', v => metalP.color = v)
    on('t-mmetal', v => metalP.metalness = v)
    on('t-rough', v => metalP.roughness = v)
    on('t-menv', v => metalP.env = v)
    on('t-mrefl', v => metalP.reflectivity = v)
    on('t-mspec', v => metalP.specularIntensity = v)
    onColor('t-mspecc', v => metalP.specularColor = v)
    on('t-mcc', v => metalP.clearcoat = v)
    on('t-mccr', v => metalP.clearcoatRoughness = v)
    on('t-msheen', v => metalP.sheen = v)
    on('t-msheenr', v => metalP.sheenRoughness = v)
    on('t-miri', v => metalP.iridescence = v)
    on('t-miriior', v => metalP.iridescenceIOR = v)
    on('t-maniso', v => metalP.anisotropy = v)
    on('t-manisor', v => metalP.anisotropyRotation = v)
    onColor('t-memis', v => metalP.emissive = v)
    on('t-mtrans', v => metalP.transmission = v)
    on('t-mthick', v => metalP.thickness = v)
    on('t-mattd', v => metalP.attenuationDistance = v)
    onColor('t-mattc', v => metalP.attenuationColor = v)
    // Diamond
    onColor('t-dcolor', v => DIAMOND.color = v)
    on('t-spark', v => DIAMOND.envMapIntensity = v)
    on('t-disp', v => DIAMOND.dispersion = v)
    on('t-ri', v => DIAMOND.refractiveIndex = v)
    on('t-abs', v => DIAMOND.absorptionFactor = v)
    on('t-gamma', v => DIAMOND.gammaFactor = v)
    on('t-trans', v => DIAMOND.transmission = v)
    on('t-refl', v => DIAMOND.reflectivity = v)
    on('t-bounce', v => DIAMOND.rayBounces = Math.round(v))
    // Scene
    on('t-exp', v => { if (tonemap) tonemap.exposure = v; viewer.setDirty() })
    on('t-contrast', v => { if (tonemap) tonemap.contrast = v; viewer.setDirty() })
    on('t-sat', v => { if (tonemap) tonemap.saturation = v; viewer.setDirty() })
    on('t-shadow', v => { const gm = groundPlugin?.material; if (gm) { gm.opacity = v; gm.transparent = true; gm.needsUpdate = true } if (groundPlugin && 'darkness' in groundPlugin) groundPlugin.darkness = v; viewer.setDirty() })
    on('t-env', v => { sceneEnvIntensity = v; const sc = viewer.scene as any; sc.envMapIntensity = v; sc.refreshEnvMapIntensity?.(); viewer.setDirty() })
    byId('t-menv-sel')?.addEventListener('change', async (e: any) => {
        const env = await loadEnvTexture(e.target.value)
        if (env?.assetType === 'texture') { await viewer.scene.setEnvironment(env); const sc = viewer.scene as any; sc.envMapIntensity = sceneEnvIntensity; sc.refreshEnvMapIntensity?.(); reapply() }
    })
    byId('t-genv-sel')?.addEventListener('change', async (e: any) => {
        const env = await loadEnvTexture(e.target.value)
        if (env?.assetType === 'texture' && diamondPlugin) { diamondPlugin.envMap = env; diamondPlugin.forceSceneEnvMap = false; diamondPlugin.refreshEnvMaps?.(); viewer.setDirty() }
    })
    // Env rotations (parity with builder)
    on('t-menv-rot', v => {
        metalEnvRotationDeg = v
        const env: any = (viewer.scene as any).environment || (viewer.scene as any).getEnvironment?.()
        if (env) env.rotation = v * (Math.PI / 180)
        const sc = viewer.scene as any; sc.refreshEnvMapIntensity?.()
    })
    on('t-genv-rot', v => { DIAMOND.envMapRotation = v })
    // Env file uploads (File-with-name so importer detects .hdr/.exr)
    const loadEnvFile = async (f: File) => { const mgr = viewer.getPlugin(AssetManagerPlugin) as any; try { const t = await mgr.importer.importSingle({ path: f.name, file: f }); return t?.assetType === 'texture' ? t : null } catch { return null } }
    byId('t-menv-file')?.addEventListener('change', async (e: any) => {
        const f = e.target.files?.[0]; if (!f) return
        const env: any = await loadEnvFile(f)
        if (env) { await viewer.scene.setEnvironment(env); env.rotation = metalEnvRotationDeg * (Math.PI / 180); const sc = viewer.scene as any; sc.envMapIntensity = sceneEnvIntensity; sc.refreshEnvMapIntensity?.(); reapply() }
        else prog('Not a valid HDR/EXR', true)
        e.target.value = ''
    })
    byId('t-genv-file')?.addEventListener('change', async (e: any) => {
        const f = e.target.files?.[0]; if (!f) return
        const env: any = await loadEnvFile(f)
        if (env && diamondPlugin) { diamondPlugin.envMap = env; diamondPlugin.forceSceneEnvMap = false; diamondPlugin.refreshEnvMaps?.(); viewer.setDirty() }
        else prog('Not a valid HDR/EXR', true)
        e.target.value = ''
    })
    // Ground color + roughness
    onColor('t-gcolor', v => { const gm = groundPlugin?.material; if (gm) { gm.color = linColor(v); gm.needsUpdate = true } })
    on('t-grough', v => { const gm = groundPlugin?.material; if (gm) { gm.roughness = v; gm.needsUpdate = true } })
    // Background color (any colour, beyond the 3 radios)
    onColor('t-bgcolor', v => { (viewer.renderer as any).rendererObject.setClearAlpha?.(1); viewer.scene.setBackground(linColor(v)) })
    // Background + ground image upload (File-with-name so the importer detects type)
    const loadImg = async (f: File) => { const mgr = viewer.getPlugin(AssetManagerPlugin) as any; try { const t = await mgr.importer.importSingle({ path: f.name, file: f }); return t?.assetType === 'texture' ? t : null } catch { return null } }
    byId('t-bg-image')?.addEventListener('change', async (e: any) => {
        const f = e.target.files?.[0]; if (!f) return
        const tex: any = await loadImg(f)
        if (tex) { tex.wrapS = 1000; tex.wrapT = 1000; (viewer.renderer as any).rendererObject.setClearAlpha?.(1); (viewer.scene as any).background = tex; viewer.setDirty() }
        else prog('Not a valid image — use JPG/PNG', true)
        e.target.value = ''
    })
    byId('t-ground-image')?.addEventListener('change', async (e: any) => {
        const f = e.target.files?.[0]; if (!f) return
        const gm = groundPlugin?.material; if (!gm) { prog('Ground not available', true); return }
        const tex: any = await loadImg(f)
        if (tex) { tex.wrapS = 1000; tex.wrapT = 1000; gm.map = tex; gm.transparent = false; gm.opacity = 1; gm.needsUpdate = true; if (groundPlugin) groundPlugin.visible = true; reapply() }
        else prog('Not a valid image — use JPG/PNG', true)
        e.target.value = ''
    })
    byId('t-img-clear')?.addEventListener('click', () => {
        const bg = (document.querySelector('input[name=bg]:checked') as HTMLInputElement)?.value || 'bone'
        setBg(bg)
        const gm = groundPlugin?.material; if (gm) { gm.map = null; gm.transparent = true; gm.opacity = 1; gm.needsUpdate = true }
        reapply()
    })
}

function prog(msg: string, err = false) { const e = byId('prog'); e.textContent = msg; e.className = err ? 'err' : '' }

async function renderAll() {
    const angleKeys = Array.from(document.querySelectorAll('#angles input:checked')).map((c: any) => c.value)
    if (!pickedFiles.length || !angleKeys.length) { prog('Pick files + angles', true); return }
    const pr = Number(byId('q').value || '3')
    const aspect = (byId('aspect') as HTMLSelectElement)?.value || ''
    const outW = Number((byId('outw') as HTMLInputElement)?.value) || 1600
    const bg = (document.querySelector('input[name=bg]:checked') as HTMLInputElement)?.value || 'bone'
    byId('go').disabled = true
    if (byId('shadow')) groundPlugin && (groundPlugin.visible = (byId('shadow') as HTMLInputElement).checked)
    await setBg(bg)

    const zip = new JSZip()
    const expand = (keys: string[]) => { const out: { name: string; a: any }[] = []; for (const k of keys) { if (k === 'spin') { for (let i = 0; i < 24; i++) out.push({ name: `spin/${String(i).padStart(3, '0')}`, a: { x: -0.05, y: (i / 24) * Math.PI * 2, z: 0 } }) } else out.push({ name: k, a: ANGLES[k] }) } return out }
    const shots = expand(angleKeys)
    // include user-saved custom poses
    customPoses.forEach((p, i) => shots.push({ name: `pose-${i + 1}`, a: p }))
    if (!shots.length) { prog('Pick angles or save a pose', true); byId('go').disabled = false; return }
    let done = 0; const total = pickedFiles.length * shots.length
    for (const file of pickedFiles) {
        prog(`Loading ${file.name}…`)
        try { await loadFile(file) } catch (e: any) { prog('Failed: ' + file.name, true); continue }
        const folder = zip.folder(file.name.replace(/\.(glb|gltf)$/i, '')) as any
        for (const s of shots) {
            setAngle(s.a); await raf(); await raf()
            const blob = await captureBlob(pr, aspect, outW)
            if (blob && folder) folder.file(`${s.name}.png`, blob)
            done++; prog(`${done}/${total} (${Math.round(done / total * 100)}%)`)
        }
    }
    prog('Zipping…')
    const content = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(content); a.download = `renders-${Date.now()}.zip`; a.click(); URL.revokeObjectURL(a.href)
    prog(`Done — ${pickedFiles.length} models, ${total} images.`)
    byId('go').disabled = false
    await setBg(bg)
}

// ── Drag-to-pose + save custom angles ──────────────────────────────────
const customPoses: { x: number; y: number; z: number }[] = []
let dragging = false, lastX = 0, lastY = 0, poseX = -0.05, poseY = 0

function setupInteraction() {
    const canvas = byId('c') as HTMLCanvasElement
    canvas.style.cursor = 'grab'
    canvas.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.style.cursor = 'grabbing' })
    window.addEventListener('mouseup', () => { dragging = false; canvas.style.cursor = 'grab' })
    window.addEventListener('mousemove', e => {
        if (!dragging || !model) return
        const dx = e.clientX - lastX, dy = e.clientY - lastY
        lastX = e.clientX; lastY = e.clientY
        if (e.shiftKey || e.buttons === 2) {
            // Shift-drag (or right-drag) = pan the camera
            panX -= dx * 0.0016 * frameMaxDim * 6
            panY += dy * 0.0016 * frameMaxDim * 6
            applyCamera()
        } else {
            // Left-drag = rotate the ring (pose)
            poseY += dx * 0.008
            poseX += dy * 0.008
            const root = getRoot(model); if (root) { root.rotation.order = 'YXZ'; root.rotation.set(poseX, poseY, 0); root.updateMatrixWorld?.(true); viewer.setDirty() }
        }
    })
    // Wheel = zoom
    canvas.addEventListener('wheel', e => {
        if (!model) return
        e.preventDefault()
        zoomFactor *= e.deltaY > 0 ? 0.92 : 1.08
        zoomFactor = Math.max(0.3, Math.min(4, zoomFactor))
        applyCamera()
    }, { passive: false })
    canvas.addEventListener('contextmenu', e => e.preventDefault())  // allow right-drag pan
    byId('save-pose')?.addEventListener('click', () => {
        if (!model) { prog('Load a ring first', true); return }
        customPoses.push({ x: poseX, y: poseY, z: 0 })
        renderPoseList()
    })
}

function renderPoseList() {
    const el = byId('poses'); if (!el) return
    el.innerHTML = customPoses.length
        ? customPoses.map((_, i) => `Pose ${i + 1} <a href="#" data-i="${i}" style="color:#a12d2d;text-decoration:none;">✕</a>`).join(' &nbsp; ')
        : ''
    el.querySelectorAll('a[data-i]').forEach((a: any) => a.addEventListener('click', (e: any) => { e.preventDefault(); customPoses.splice(Number(a.dataset.i), 1); renderPoseList() }))
}

init().then(() => setupInteraction()).catch(e => { console.error(e); prog('Init failed: ' + (e?.message || e), true) })
