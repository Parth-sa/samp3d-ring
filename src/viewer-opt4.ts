import {
    Vector3,
    Color,
    Box3,
    DirectionalLight,
    AmbientLight,
    ViewerApp,
    AssetManagerPlugin,
    GBufferPlugin,
    ProgressivePlugin,
    TonemapPlugin,
    SSAOPlugin,
    EXRLoadPlugin,
    FrameFadePlugin,
    TemporalAAPlugin,
    BloomPlugin,
    VignettePlugin,
    ContactShadowGroundPlugin,
    DiamondPlugin,
    RandomizedDirectionalLightPlugin,
    Mesh,
    PlaneGeometry,
    CanvasTexture,
    MeshBasicMaterial,
} from './webgi-re-exports'
import { patchGlbWithDiamondMetadata } from './webgiDiamondPatch'

const viewerRoot = (window as any) as any

const runtimeConfig = viewerRoot.WEBGI_VIEWER_CONFIG || {}
const DEFAULT_MODEL_PATH = './assets/LRS-02.glb'
const initialUrlParams = new URLSearchParams(window.location.search)
const MODEL_PATH = initialUrlParams.get('model')
    ? decodeURIComponent(initialUrlParams.get('model') as string)
    : (runtimeConfig.modelPath || DEFAULT_MODEL_PATH)

// ---- material recipes (reused from the main pipeline) ----
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

const BG_COLOR = '#ffffff'
const metalProfile = {
    color: '#c2c2c3', metalness: 1, roughness: 0, reflectivity: 0.5, envIntensity: 1.6,
    clearcoat: 0, clearcoatRoughness: 0.08, specularIntensity: 1.0, specularColor: '#ffffff',
    sheen: 0, sheenRoughness: 1, iridescence: 0, iridescenceIOR: 1.3,
    anisotropy: 0, anisotropyRotation: 0, emissive: '#000000',
    transmission: 0.0, thickness: 0, attenuationDistance: 0, attenuationColor: '#ffffff',
}
// metal color override: ?metal=#hex or named (e.g. ?metal=whitegold, ?metal=platinum)
const _metalParam = initialUrlParams.get('metal')
if (_metalParam) metalProfile.color = decodeURIComponent(_metalParam) as string
else if (runtimeConfig.metalColor) metalProfile.color = runtimeConfig.metalColor as string

const DIAMOND_NAME_RE = /diamond|diamonds|gem|stone|solit(er|a)|soliter|brilliant|brillant|cz|moissanite|ruby|sapphire|emerald/i
const DIAMOND_PROFILE = {
    color: '#ffffff', envMapIntensity: 2.8, envMapRotation: 0, dispersion: 0.02,
    squashFactor: 0.98, geometryFactor: 0.5, gammaFactor: 1.3, absorptionFactor: 0.4,
    reflectivity: 0.85, transmission: 0.0, refractiveIndex: 2.6, rayBounces: 8,
    diamondOrientedEnvMap: 0, boostFactors: [1.3, 1.3, 1.3] as [number, number, number],
}

let viewer: any = null
let diamondPluginInstance: any = null
let ringModel: any = null
let modelLoaded = false
let groundPlugin: any = null
let staticShadow: any = null
let metalEnvironment: any = null

// ---- CAMERA: 3DJV / Option 1 style via WebGI built-in OrbitControls ----
const DEFAULT_FOV = 45
let controls: any = null
let minRadius = 4
let maxRadius = 15
let fitDistance = 8

const loaderEl = document.getElementById('loader') as HTMLElement

function linColor(hex: string) { return new Color(hex).convertSRGBToLinear() }

function getRingRoot(): any {
    if (!ringModel) return null
    if (ringModel.modelObject) return ringModel.modelObject
    if (ringModel.scene) return ringModel.scene
    return ringModel
}

function isDiamondMesh(mesh: any) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
        if (m?.extensions?.WEBGI_materials_diamond) return true
        if (m?.isDiamondMaterialParameters || m?.type === 'DiamondMaterial') return true
    }
    const name = `${mesh.name || ''} ${mats.map((m: any) => m?.name || '').join(' ')}`.toLowerCase()
    if (/\b(prong|shank|bezel)\b/i.test(name) && !DIAMOND_NAME_RE.test(name)) return false
    if (DIAMOND_NAME_RE.test(name)) return true
    for (const m of mats) {
        if (m?.transmission !== undefined && m.transmission > 0.5) return true
        if (m?.ior !== undefined && m.ior > 1.8) return true
    }
    return false
}

function applyMetal(mat: any) {
    if (!mat) return
    try {
        if ('color' in mat) mat.color = linColor(metalProfile.color)
        if ('metalness' in mat) mat.metalness = metalProfile.metalness
        if ('roughness' in mat) mat.roughness = metalProfile.roughness
        if ('envMapIntensity' in mat) mat.envMapIntensity = metalProfile.envIntensity
        if ('reflectivity' in mat) mat.reflectivity = metalProfile.reflectivity
        if ('specularIntensity' in mat) mat.specularIntensity = metalProfile.specularIntensity
        if ('specularColor' in mat) mat.specularColor = linColor(metalProfile.specularColor)
        if ('clearcoat' in mat) mat.clearcoat = metalProfile.clearcoat
        if ('clearcoatRoughness' in mat) mat.clearcoatRoughness = metalProfile.clearcoatRoughness
        if ('sheen' in mat) mat.sheen = metalProfile.sheen
        if ('sheenRoughness' in mat) mat.sheenRoughness = metalProfile.sheenRoughness
        if ('iridescence' in mat) mat.iridescence = metalProfile.iridescence
        if ('iridescenceIOR' in mat) mat.iridescenceIOR = metalProfile.iridescenceIOR
        if ('anisotropy' in mat) mat.anisotropy = metalProfile.anisotropy
        if ('anisotropyRotation' in mat) mat.anisotropyRotation = metalProfile.anisotropyRotation
        if ('emissive' in mat) mat.emissive = linColor(metalProfile.emissive)
        if ('transmission' in mat) mat.transmission = metalProfile.transmission
        if ('thickness' in mat) mat.thickness = metalProfile.thickness
        if ('attenuationDistance' in mat) mat.attenuationDistance = metalProfile.attenuationDistance
        if ('attenuationColor' in mat) mat.attenuationColor = linColor(metalProfile.attenuationColor)
        if ('envMap' in mat && metalEnvironment) mat.envMap = metalEnvironment
        if ('needsUpdate' in mat) mat.needsUpdate = true
    } catch (e) { /* ignore */ }
}

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

function applyMaterials(root: any) {
    if (!root?.traverse) return
    root.traverse((child: any) => {
        if (!child?.isMesh || !child.material) return
        child.castShadow = true; child.receiveShadow = true
        const dd = isDiamondMesh(child)
        const ms = Array.isArray(child.material) ? child.material : [child.material]
        for (const m of ms) { if (dd) applyDiamond(m); else applyMetal(m) }
    })
    if (diamondPluginInstance?.refreshEnvMaps) diamondPluginInstance.refreshEnvMaps()
}

function reapplyMetalMaterials() {
    const root = getRingRoot()
    if (!root?.traverse) return
    root.traverse((child: any) => {
        if (!child?.isMesh || !child.material) return
        if (isDiamondMesh(child)) return
        const ms = Array.isArray(child.material) ? child.material : [child.material]
        for (const m of ms) applyMetal(m)
    })
    viewer?.setDirty?.()
}

const METAL_PROFILE_DEFAULTS = { ...metalProfile }
function setMetalProfile(hex: string, overrides: any) {
    Object.assign(metalProfile, METAL_PROFILE_DEFAULTS, overrides || {})
    metalProfile.color = hex
    reapplyMetalMaterials()
    try { (viewer.renderer as any).refreshPipeline() } catch {}
    viewer?.setDirty?.()
}
function setMetalColor(hex: string) {
    setMetalProfile(hex, null)
}
(window as any).__opt3SetMetalColor = setMetalColor;
(window as any).__optSetMetalProfile = setMetalProfile;

let currentBg = BG_COLOR
function setBackgroundColor(hex: string) {
    currentBg = hex
    try { viewer.scene.setBackground(linColor(hex)) } catch (e) { console.warn('setBackground', e) }
    viewer?.setDirty?.()
}
(window as any).__optSetBackground = setBackgroundColor

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

function buildStaticShadow(ringCenterY: number, radiusV: number) {
    const scene: any = viewer.scene
    if (!scene) return
    try {
        const canvas = document.createElement('canvas')
        canvas.width = 256; canvas.height = 256
        const ctx = canvas.getContext('2d')!
        const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 128)
        grad.addColorStop(0, 'rgba(30,24,16,0.42)')
        grad.addColorStop(0.45, 'rgba(30,24,16,0.28)')
        grad.addColorStop(0.75, 'rgba(30,24,16,0.12)')
        grad.addColorStop(1, 'rgba(30,24,16,0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, 256, 256)
        const tex = new CanvasTexture(canvas)
        const geo = new PlaneGeometry(radiusV * 2.2, radiusV * 2.2)
        const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
        const mesh = new Mesh(geo, mat)
        mesh.rotation.x = -Math.PI / 2
        mesh.position.set(0, ringCenterY - radiusV * 0.18, 0)
        scene.add(mesh)
        staticShadow = mesh
    } catch (e) { console.warn('buildStaticShadow', e) }
}

// ---- 3DJV-style adjustCamera: auto-fit orbit limits from bounding sphere ----
// Matches 3DJewelryViewer's adjustCamera():
//   s = 1.4 * radius
//   d = radius / tan(fov/2)
//   minDist = max(s, 0.7*d)
//   maxDist = max(s, 3*d)
function frameModel() {
    if (!viewer || !ringModel) return
    const root = getRingRoot()
    if (!root) return
    root.updateMatrixWorld?.(true)
    const box = worldBounds(root)
    if (box.isEmpty()) return
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.01)

    // ring fixed at origin — centre it so it never drifts
    root.position.sub(center)
    root.updateMatrixWorld?.(true)

    const ringBottomY = -size.y / 2
    buildStaticShadow(ringBottomY - 0.02 * maxDim, maxDim)
    if (groundPlugin) { try { if ('visible' in groundPlugin) groundPlugin.visible = false } catch {} }

    // 3DJV / Option 1 auto-fit (orbit camera around fixed ring)
    const r = maxDim / 2
    const d = r / Math.tan((DEFAULT_FOV / 2) * Math.PI / 180)
    const s = 1.4 * r
    minRadius = Math.max(s, 0.7 * d)
    maxRadius = Math.max(s, 3 * d)
    fitDistance = d * 1.15

    const cam = viewer.scene.activeCamera
    const co = cam.cameraObject
    if (co && 'fov' in co) co.fov = DEFAULT_FOV
    else if ('fov' in cam) cam.fov = DEFAULT_FOV

    // configure OrbitControls (Option 1 / 3DJV style): orbit, damping, no pan, no autorotate
    if (controls) {
        controls.target.set(0, 0, 0)
        controls.enablePan = false
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        controls.autoRotate = false
        controls.minDistance = minRadius
        controls.maxDistance = maxRadius
        const raw = co || cam
        raw.position.set(0, fitDistance * 0.35, fitDistance)
        controls.update()
    }
    cam.setDirty?.()
    viewer.setDirty()
}

async function setup() {
    try {
        const canvas = document.getElementById('webgi-canvas') as HTMLCanvasElement
        viewer = new ViewerApp({ canvas, useGBufferDepth: true, isAntialiased: false })

        const r = (viewer.renderer as any).rendererObject
        if (r) {
            r.shadowMap.enabled = true; r.shadowMap.type = 1
            r.physicallyCorrectLights = true; r.outputEncoding = 3001
            r.toneMapping = 4; r.toneMappingExposure = 1.2
        }
        const _dpr = window.devicePixelRatio || 1
        ;(viewer.renderer as any).displayCanvasScaling = Math.min(Math.max(_dpr, 2), 2.5)
        const onViewerResize = () => { try { (viewer as any).resize?.() } catch {} ; viewer.setDirty() }
        window.addEventListener('resize', onViewerResize)

        await viewer.addPlugin(AssetManagerPlugin)
        await viewer.addPlugin(GBufferPlugin)
        const pp = await viewer.addPlugin(ProgressivePlugin)
        const tonemap = await viewer.addPlugin(TonemapPlugin)
        if (tonemap) { tonemap.exposure = 1.16; tonemap.saturation = 1.91; tonemap.contrast = 1.48 }
        const ssao = await viewer.addPlugin(SSAOPlugin)
        if (ssao) (ssao as any).intensity = 0.25
        try { await viewer.addPlugin(EXRLoadPlugin) } catch (e) { console.warn('EXRLoadPlugin', e) }
        try { await viewer.addPlugin(FrameFadePlugin) } catch {}
        try { await viewer.addPlugin(TemporalAAPlugin) } catch {}
        try { const bl = await viewer.addPlugin(BloomPlugin) as any; if (bl) { bl.intensity = 0.16; bl.threshold = 0.92 } } catch {}
        try { const vg = await viewer.addPlugin(VignettePlugin) as any; if (vg) vg.power = 0.78 } catch {}

        try { const dp = await viewer.addPlugin(DiamondPlugin); if (dp) (dp as any).forceSceneEnvMap = false; diamondPluginInstance = dp } catch {}

        try {
            const gp = await viewer.addPlugin(ContactShadowGroundPlugin)
            if (gp) { gp.contactShadows = true; groundPlugin = gp }
        } catch (e) { console.warn('ContactShadowGroundPlugin', e) }

        try { await viewer.addPlugin(RandomizedDirectionalLightPlugin) } catch (e) { console.warn('RandomizedDirectionalLightPlugin', e) }

        const key = new DirectionalLight(0xffffff, 3)
        key.position.set(5, 10, 7); key.castShadow = true
        key.shadow.mapSize.width = 4096; key.shadow.mapSize.height = 4096
        key.shadow.bias = -0.0001; key.shadow.normalBias = 0.02
        key.shadow.camera.near = 0.1; key.shadow.camera.far = 100
        key.shadow.camera.left = -20; key.shadow.camera.right = 20
        key.shadow.camera.top = 20; key.shadow.camera.bottom = -20
        const ambient = new AmbientLight(0xffffff, 0.5)
        ;(viewer.scene as any).add(key); (viewer.scene as any).add(ambient)

        const cam = viewer.scene.activeCamera
        cam.near = 0.1; cam.far = 1000
        try { cam.setCameraOptions?.({ controlsEnabled: true, controlsMode: "orbit" }); cam.autoLookAtTarget = true } catch {}
        try { controls = (cam as any).controls || null } catch {}

        viewer.scene.setBackground(linColor(BG_COLOR))
        try { (viewer.scene as any).fixedEnvMapDirection = true } catch {}
        try { (viewer.renderer as any).stableNoise = true } catch {}

        // load metal env for the scene (lights metal)
        const envSrc = runtimeConfig.environmentPath || './assets/env_metal_001.hdr'
        try {
            const manager = viewer.getPlugin(AssetManagerPlugin) as any
            const env = await manager.importer.importSinglePath(envSrc)
            if (env && env.assetType === 'texture') {
                await viewer.scene.setEnvironment(env)
                metalEnvironment = env
                viewer.scene.envMapIntensity = 1.6
                if (typeof viewer.scene.refreshEnvMapIntensity === 'function') viewer.scene.refreshEnvMapIntensity()
            }
        } catch (e) { console.warn('env import', e) }

        // load dedicated GEM env for the DiamondPlugin (drives diamond sparkle)
        const gemEnvSrc = './assets/env_gem_002.exr'
        let gemEnvironment: any = null
        try {
            const manager = viewer.getPlugin(AssetManagerPlugin) as any
            const env = await manager.importer.importSinglePath(gemEnvSrc)
            if (env && env.assetType === 'texture') gemEnvironment = env
        } catch (e) { console.warn('gem env import', e) }

        // load ring model — fetch GLB, patch diamond metadata, import through WebGI pipeline
        const modelPath = MODEL_PATH
        const mgr = viewer.getPlugin(AssetManagerPlugin) as any
        const res = await fetch(modelPath)
        if (!res.ok) throw new Error('Failed to fetch ' + modelPath + ' (' + res.status + ')')
        const blob = await res.blob()
        const file = new File([blob], modelPath.split('/').pop() || 'model.glb', { type: 'model/gltf-binary' })
        const patched = await patchGlbWithDiamondMetadata(file, undefined, { fallbackToFirst: false } as any)
        const result = await mgr.importer.importSingle({ path: file.name, file: patched })
        if (!result) throw new Error('importSingle returned null')
        viewer.scene.addSceneObject(result, { autoScale: false })
        ringModel = result

        if (diamondPluginInstance) {
            diamondPluginInstance.envMap = gemEnvironment || metalEnvironment
            diamondPluginInstance.forceSceneEnvMap = false
            if (typeof diamondPluginInstance.refreshEnvMaps === 'function') diamondPluginInstance.refreshEnvMaps()
        }

        applyMaterials(getRingRoot())
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        frameModel()
        modelLoaded = true

        if (pp && typeof pp.reset === 'function') pp.reset()
        try { (viewer.renderer as any).refreshPipeline() } catch {}
        viewer.setDirty()

        if (loaderEl) loaderEl.classList.add('hidden')

        // ---- preFrame: drive WebGI built-in OrbitControls (damping, orbit, no autorotate) ----
        viewer.addEventListener('preFrame', () => {
            if (!modelLoaded) return
            if (controls) controls.update()
            try { const rr = (viewer.renderer as any).rendererObject; if (rr?.shadowMap) rr.shadowMap.needsUpdate = true } catch {}
            viewer.setDirty()
        })

        // ---- metal color control UI ----
        const panel = document.getElementById('metal-panel') as HTMLElement
        const colorInput = document.getElementById('metal-color') as HTMLInputElement
        panel?.querySelectorAll('.swatch').forEach((sw: any) => {
            sw.addEventListener('click', () => {
                const hex = sw.getAttribute('data-color') as string
                if (colorInput) colorInput.value = hex
                setMetalColor(hex)
            })
        })
        colorInput?.addEventListener('input', (e: any) => {
            setMetalColor(e.target.value)
        })

    } catch (err) {
        console.error('setup error', err)
        if (loaderEl) { loaderEl.textContent = 'Error: ' + (err as any)?.message; (loaderEl as any).style.color = '#e44' }
    }
}

setup()
