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
    DRACOLoader2,
    Color,
    Mesh,
    Vector3,
    Box3,
    Matrix4,
    DirectionalLight,
    AmbientLight,
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
const DIAMOND = {
    color: '#ffffff', envMapIntensity: 2.0, dispersion: 0.015, refractiveIndex: 2.6,
    absorptionFactor: 0.4, gammaFactor: 1.2, transmission: 0.0, reflectivity: 0.7, rayBounces: 6,
}
const METALS: Record<string, string> = {
    whiteGold: '#c2c2c3', yellowGold: '#c5ad6d', roseGold: '#e6ac97', platinum: '#d6d6d9',
}
let metalChoice = 'whiteGold' // or 'original' to keep GLB colours
const metalP = { roughness: 0.0, env: 1.6, metalness: 1, color: '' }  // color '' = use metalChoice preset
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
                const ext = m.extensions?.WEBGI_materials_diamond
                if (ext) { ext.color = new Color(DIAMOND.color).getHex(); ext.dispersion = DIAMOND.dispersion; ext.refractiveIndex = DIAMOND.refractiveIndex; ext.envMapIntensity = DIAMOND.envMapIntensity; ext.transmission = DIAMOND.transmission; ext.rayBounces = DIAMOND.rayBounces; ext.gammaFactor = DIAMOND.gammaFactor; ext.absorptionFactor = DIAMOND.absorptionFactor; ext.reflectivity = DIAMOND.reflectivity }
                if ('color' in m) m.color = linColor(DIAMOND.color)
                if ('envMapIntensity' in m) m.envMapIntensity = DIAMOND.envMapIntensity
                if ('transmission' in m) m.transmission = DIAMOND.transmission
                if ('refractiveIndex' in m) m.refractiveIndex = DIAMOND.refractiveIndex
            } else {
                const mcol = metalP.color || (metalChoice !== 'original' ? (METALS[metalChoice] || METALS.whiteGold) : '')
                if (mcol && 'color' in m) m.color = linColor(mcol)
                if ('metalness' in m) m.metalness = metalP.metalness
                if ('roughness' in m) m.roughness = metalP.roughness
                if ('reflectivity' in m) m.reflectivity = 0.5
                if ('clearcoat' in m) m.clearcoat = 0
                if ('envMapIntensity' in m) m.envMapIntensity = metalP.env
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

function frame() {
    const root = getRoot(model); if (!root) return
    root.position.set(0, 0, 0); root.updateMatrixWorld?.(true)
    const box = worldBounds(root); if (box.isEmpty()) return
    const center = box.getCenter(new Vector3()); const size = box.getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.01)
    root.position.set(-center.x, -center.y, -center.z); root.updateMatrixWorld?.(true)
    cameraZoom = maxDim * 3.0
    if (groundPlugin) { if ('size' in groundPlugin) groundPlugin.size = maxDim * 4.5; if ('yOffset' in groundPlugin) groundPlugin.yOffset = -0.008 * maxDim }
    const cam = viewer.scene.activeCamera
    cam.position.set(0, cameraZoom * 0.18, cameraZoom)
    cam.positionUpdated?.(false); viewer.setDirty()
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
    else { ro.setClearAlpha?.(1); viewer.scene.setBackground(linColor(mode === 'white' ? '#ffffff' : BONE)) }
    viewer.setDirty()
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
    for (let i = 0; i < 32; i++) { viewer.setDirty(); await raf() }
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
    try { const dp = await viewer.addPlugin(DiamondPlugin); if (dp) (dp as any).forceSceneEnvMap = false; diamondPlugin = dp } catch {}
    try { groundPlugin = await viewer.addPlugin(ContactShadowGroundPlugin); if (groundPlugin) { groundPlugin.contactShadows = true; if ('blurAmount' in groundPlugin) groundPlugin.blurAmount = 1.6 } } catch {}

    const dl = new DirectionalLight(0xffffff, 3); dl.position.set(5, 10, 7); dl.castShadow = true
    dl.shadow.mapSize.width = dl.shadow.mapSize.height = 2048; dl.shadow.bias = -0.0001; dl.shadow.normalBias = 0.02; (dl.shadow as any).radius = 8
    ;(viewer.scene as any).add(dl); (viewer.scene as any).add(new AmbientLight(0xffffff, 0.5))

    const cam = viewer.scene.activeCamera; cam.near = 0.1; cam.far = 1000; cam.setCameraOptions?.({ fov: 25 })
    const ctrl = (cam as any).controls; if (ctrl) ctrl.enabled = false
    viewer.scene.setBackground(linColor(BONE))

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
        poseY += (e.clientX - lastX) * 0.008
        poseX += (e.clientY - lastY) * 0.008
        lastX = e.clientX; lastY = e.clientY
        const root = getRoot(model); if (root) { root.rotation.order = 'YXZ'; root.rotation.set(poseX, poseY, 0); root.updateMatrixWorld?.(true); viewer.setDirty() }
    })
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
