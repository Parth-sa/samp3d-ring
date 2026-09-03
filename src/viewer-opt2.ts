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
    Mesh,
    PlaneGeometry,
    CanvasTexture,
    MeshBasicMaterial,
} from './webgi-re-exports'

const viewerRoot = (window as any) as any

const runtimeConfig = viewerRoot.WEBGI_VIEWER_CONFIG || {}
const DEFAULT_MODEL_PATH = './assets/m01_main.glb'
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

const BG_COLOR = '#f4f1ea'
const metalProfile = {
    color: '#c5ad6d', metalness: 1, roughness: 0, reflectivity: 0.5, envIntensity: 1.6,
    clearcoat: 0, clearcoatRoughness: 0.08, specularIntensity: 1.0, specularColor: '#ffffff',
    sheen: 0, sheenRoughness: 1, iridescence: 0, iridescenceIOR: 1.3,
    anisotropy: 0, anisotropyRotation: 0, emissive: '#000000',
    transmission: 0.0, thickness: 0, attenuationDistance: 0, attenuationColor: '#ffffff',
}
const DIAMOND_NAME_RE = /diamond|diamonds|gem|stone|solit(er|a)|soliter|brilliant|brillant|cz|moissanite|ruby|sapphire|emerald/i
const DIAMOND_PROFILE = {
    color: '#ffffff', envMapIntensity: 2.0, envMapRotation: 0, dispersion: 0.015,
    squashFactor: 0.98, geometryFactor: 0.5, gammaFactor: 1.2, absorptionFactor: 0.4,
    reflectivity: 0.7, transmission: 0.0, refractiveIndex: 2.6, rayBounces: 6,
    diamondOrientedEnvMap: 0, boostFactors: [1.0, 1.0, 1.0] as [number, number, number],
}

let viewer: any = null
let diamondPluginInstance: any = null
let ringModel: any = null
let modelLoaded = false
let groundPlugin: any = null
let staticShadow: any = null

// ---- CAMERA-ORBIT (3DJV-style): ring stays fixed, camera orbits ----
const SMOOTHING = 0.08        // damping
const DEFAULT_FOV = 45
const DRAG_SPEED = 0.005
let theta = 0.7
let phi = Math.PI / 2 - 0.35   // gentle look-down
let radius = 8
let goalTheta = 0.7
let goalPhi = Math.PI / 2 - 0.35
let goalRadius = 8
const minPhi = 0.2
const maxPhi = Math.PI * 0.5
let minRadius = 4
let maxRadius = 15
let idealRadius = 8
let boundingRadius = 4
let isOrbiting = false
let lastX = 0, lastY = 0
let lastPinchDist = 0

const loaderEl = document.getElementById('loader') as HTMLElement

function linColor(hex: string) { return new Color(hex).convertSRGBToLinear() }

function getRingRoot(): any {
    if (!ringModel) return null
    if (ringModel.modelObject) return ringModel.modelObject
    if (ringModel.scene) return ringModel.scene
    return ringModel
}

function isDiamondMesh(mesh: any): boolean {
    const n = (mesh.name || '') + ' ' + (mesh.material?.name || '')
    if (DIAMOND_NAME_RE.test(n)) return true
    const r = (mesh.geometry?.boundingSphere?.radius) ?? NaN
    return Number.isFinite(r) && r < 0.06
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
    } catch (e) { /* ignore */ }
}

function applyDiamond(mat: any) {
    if (!mat) return
    try {
        if (mat.userData && !mat.userData.separateEnvMapIntensity) mat.userData.separateEnvMapIntensity = true
        if ('color' in mat) mat.color = linColor(DIAMOND_PROFILE.color)
        if ('envMapIntensity' in mat) mat.envMapIntensity = DIAMOND_PROFILE.envMapIntensity
        if ('dispersion' in mat) mat.dispersion = DIAMOND_PROFILE.dispersion
        if ('reflectivity' in mat) mat.reflectivity = DIAMOND_PROFILE.reflectivity
        if ('transmission' in mat) mat.transmission = DIAMOND_PROFILE.transmission
        if ('refractiveIndex' in mat) mat.refractiveIndex = DIAMOND_PROFILE.refractiveIndex
    } catch (e) { /* ignore */ }
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

    // 3DJV auto-fit
    const r = maxDim / 2
    boundingRadius = r
    const d = r / Math.tan((DEFAULT_FOV / 2) * Math.PI / 180)
    const s = 1.4 * r
    idealRadius = d
    minRadius = Math.max(s, 0.7 * d)
    maxRadius = Math.max(s, 3 * d)
    radius = d * 1.15
    goalRadius = radius

    theta = 0.7; goalTheta = 0.7
    phi = Math.PI / 2 - 0.35; goalPhi = phi

    const cam = viewer.scene.activeCamera
    const co = cam.cameraObject
    if (co && 'fov' in co) co.fov = DEFAULT_FOV
    else if ('fov' in cam) cam.fov = DEFAULT_FOV
    positionCamera(cam)
    viewer.setDirty()
}

function positionCamera(cam: any) {
    try {
        const sinPhi = Math.sin(phi)
        const px = radius * sinPhi * Math.sin(theta)
        const py = radius * Math.cos(phi)
        const pz = radius * sinPhi * Math.cos(theta)
        if (cam.target) cam.target = new Vector3(0, 0, 0)
        cam.position = new Vector3(px, py, pz)
        const co = cam.cameraObject
        if (co && 'fov' in co) { /* fov handled in frameModel */ }
        try { cam.setDirty?.() } catch {}
    } catch (e) { console.warn('positionCamera', e) }
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

        const key = new DirectionalLight(0xfff4e0, 2.8)
        key.position.set(6, 10, 7); key.castShadow = true
        key.shadow.mapSize.width = 4096; key.shadow.mapSize.height = 4096
        key.shadow.bias = -0.0001; key.shadow.normalBias = 0.02
        const fill = new DirectionalLight(0xbcd0e8, 0.7); fill.position.set(-7, 3, -4)
        const rim = new DirectionalLight(0xffffff, 1.2); rim.position.set(-2, 6, -9)
        ;(viewer.scene as any).add(key); (viewer.scene as any).add(fill)
        ;(viewer.scene as any).add(rim); (viewer.scene as any).add(new AmbientLight(0xffffff, 0.35))

        const cam = viewer.scene.activeCamera
        cam.near = 0.1; cam.far = 1000
        try { cam.setCameraOptions?.({ controlsEnabled: false, controlsMode: "" }); cam.autoLookAtTarget = true } catch {}
        try { const ctrl = (cam as any).controls; if (ctrl) ctrl.enabled = false } catch {}

        viewer.scene.setBackground(linColor(BG_COLOR))
        try { (viewer.scene as any).fixedEnvMapDirection = true } catch {}
        try { (viewer.renderer as any).stableNoise = true } catch {}

        // load env (correct WebGI pipeline: import texture, then setEnvironment)
        const envSrc = runtimeConfig.environmentPath || './assets/env_metal_001.hdr'
        let metalEnvironment: any = null
        try {
            const manager = viewer.getPlugin(AssetManagerPlugin) as any
            const env = await manager.importer.importSinglePath(envSrc)
            if (env && env.assetType === 'texture') {
                await viewer.scene.setEnvironment(env)
                metalEnvironment = env
                viewer.scene.envMapIntensity = 1.0
                if (typeof viewer.scene.refreshEnvMapIntensity === 'function') viewer.scene.refreshEnvMapIntensity()
            }
        } catch (e) { console.warn('env import', e) }

        // load ring model
        const manager = viewer.getPlugin(AssetManagerPlugin) as any
        const result = await manager.importer.importSingle({ path: MODEL_PATH })
        if (!result) throw new Error('importSingle returned null')
        viewer.scene.addSceneObject(result, { autoScale: false })
        ringModel = result

        if (diamondPluginInstance && metalEnvironment) {
            diamondPluginInstance.envMap = metalEnvironment
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

        // ---- preFrame: ease camera orbit toward goals (damping), no autorotate ----
        viewer.addEventListener('preFrame', () => {
            if (!modelLoaded) return
            theta += (goalTheta - theta) * SMOOTHING
            phi += (goalPhi - phi) * SMOOTHING
            radius = Math.max(minRadius, Math.min(maxRadius, radius + (goalRadius - radius) * SMOOTHING))
            positionCamera(viewer.scene.activeCamera)
            try { const rr = (viewer.renderer as any).rendererObject; if (rr?.shadowMap) rr.shadowMap.needsUpdate = true } catch {}
            viewer.setDirty()
        })

        const canvasEl = document.getElementById('webgi-canvas') as HTMLCanvasElement

        // drag = orbit camera
        canvasEl.addEventListener('mousedown', (e) => { isOrbiting = true; lastX = e.clientX; lastY = e.clientY })
        window.addEventListener('mousemove', (e) => {
            if (!isOrbiting || !modelLoaded) return
            const dx = e.clientX - lastX, dy = e.clientY - lastY
            goalTheta -= dx * DRAG_SPEED
            goalPhi = Math.max(minPhi, Math.min(maxPhi, goalPhi + dy * DRAG_SPEED))
            lastX = e.clientX; lastY = e.clientY; viewer.setDirty()
        })
        window.addEventListener('mouseup', () => { isOrbiting = false })

        canvasEl.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isOrbiting = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY
            } else if (e.touches.length === 2) {
                isOrbiting = false
                lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
            }
        }, { passive: true })
        window.addEventListener('touchmove', (e) => {
            if (!modelLoaded) return
            if (e.touches.length === 2) {
                e.preventDefault()
                const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
                if (lastPinchDist > 0) goalRadius = Math.max(minRadius, Math.min(maxRadius, radius + (lastPinchDist - d) * 0.06))
                lastPinchDist = d; viewer.setDirty()
            } else if (e.touches.length === 1 && isOrbiting) {
                const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY
                goalTheta -= dx * DRAG_SPEED
                goalPhi = Math.max(minPhi, Math.min(maxPhi, goalPhi + dy * DRAG_SPEED))
                lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; viewer.setDirty()
            }
        }, { passive: false })
        window.addEventListener('touchend', () => { isOrbiting = false; lastPinchDist = 0 })
        window.addEventListener('touchcancel', () => { isOrbiting = false; lastPinchDist = 0 })

        // wheel = zoom (radius)
        canvasEl.addEventListener('wheel', (e) => {
            if (!modelLoaded) return
            e.preventDefault()
            const d = e.deltaY * ((e as WheelEvent).deltaMode == 1 ? 18 : 1)
            goalRadius = Math.max(minRadius, Math.min(maxRadius, radius + d * 0.06))
            viewer.setDirty()
        }, { passive: false })

    } catch (err) {
        console.error('setup error', err)
        if (loaderEl) { loaderEl.textContent = 'Error: ' + (err as any)?.message; (loaderEl as any).style.color = '#e44' }
    }
}

setup()
