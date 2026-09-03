import {
    Box3,
    Vector3,
    Color,
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
    ContactShadowGroundPlugin,
    DiamondPlugin,
    Mesh,
} from './webgi-re-exports'

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

const runtimeConfig = (window as any).WEBGI_VIEWER_CONFIG || {}
const DEFAULT_MODEL_PATH = './assets/lrs-01a.glb'
const MODEL_PATH = runtimeConfig.modelPath || DEFAULT_MODEL_PATH

const ENV_PATH = './assets/env_metal_001.hdr'
const AUTO_ROTATE = runtimeConfig.autoRotate === true
const ROTATION_SPEED = Number.isFinite(runtimeConfig.rotationSpeed) ? runtimeConfig.rotationSpeed : 0.35
const BG_BONE_COLOR = '#f4f4eb'

// Exact iJewel yellow-gold polished recipe
const metalProfile = {
    color: '#c5ad6d', metalness: 1, roughness: 0, reflectivity: 0.5, envIntensity: 1.6,
    clearcoat: 0, clearcoatRoughness: 0.08, specularIntensity: 1.0, specularColor: '#ffffff',
    sheen: 0, sheenRoughness: 1,
    iridescence: 0, iridescenceIOR: 1.3,
    anisotropy: 0, anisotropyRotation: 0,
    emissive: '#000000',
    transmission: 0.0, thickness: 0, attenuationDistance: 0, attenuationColor: '#ffffff',
}

const DIAMOND_NAME_RE = /diamond|diamonds|gem|stone|solit(er|a)|soliter|brilliant|brillant|cz|moissanite|ruby|sapphire|emerald/i

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
    transmission: 0.0,
    refractiveIndex: 2.6,
    rayBounces: 6,
    diamondOrientedEnvMap: 0,
    boostFactors: [1.0, 1.0, 1.0] as [number, number, number],
}

let viewer: any = null
let diamondPluginInstance: any = null
let ringModel: any = null
let modelLoaded = false
let groundPlugin: any = null

// ── PROVEN ring-rotation state (identical to ring-builder) ────────────
const CAM_ELEVATION = 0.62        // iJewel-style elevated hero view (~32° look-down)
const SMOOTHING = 0.12            // critically-damped easing per frame (ring-builder value)
const DRAG_SPEED = 0.008          // += rad per pixel of drag
let rotationX = -0.05             // tilt (rad)
let rotationY = 0                 // yaw — drag / auto-rotate spin
let rotationZ = 0
let targetRotationX = -0.05
let targetRotationY = 0
let targetRotationZ = 0
let cameraZoom = 8                // camera distance along +Z
let targetZoom = 8
let zoomMin = 2
let zoomMax = 60
let isRotating = false
let lastX = 0; let lastY = 0
let lastPinchDist = 0
let idealZoom = 8
let autoRotate = AUTO_ROTATE

const loaderEl = document.getElementById('loader') as HTMLElement

function linColor(hex: string) { return new Color(hex).convertSRGBToLinear() }

function getRingRoot(): any {
    if (!ringModel) return null
    if ((ringModel as any).modelObject) return (ringModel as any).modelObject
    if ((ringModel as any).scene) return (ringModel as any).scene
    return ringModel
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

function isDiamondMesh(m: any): boolean {
    const nm = (m.name || '').toLowerCase()
    if (DIAMOND_NAME_RE.test(nm)) return true
    try {
        const g = m.geometry
        if (g && g.boundingSphere) return g.boundingSphere.radius < 0.06
        if (g && g.computeBoundingSphere) { g.computeBoundingSphere(); return g.boundingSphere.radius < 0.06 }
    } catch { }
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
        if ('clearcoat' in mat) mat.clearcoat = metalProfile.clearcoat
        if ('clearcoatRoughness' in mat) mat.clearcoatRoughness = metalProfile.clearcoatRoughness
        if ('specularIntensity' in mat) mat.specularIntensity = metalProfile.specularIntensity
        if ('specularColor' in mat) mat.specularColor = linColor(metalProfile.specularColor)
        if ('anisotropy' in mat) mat.anisotropy = metalProfile.anisotropy
        if ('anisotropyRotation' in mat) mat.anisotropyRotation = metalProfile.anisotropyRotation
        if ('emissive' in mat) mat.emissive = linColor(metalProfile.emissive)
        if ('transmission' in mat) mat.transmission = metalProfile.transmission
        mat.needsUpdate = true
    } catch (e) { /* ignore */ }
}

function applyDiamond(mat: any, plugin: any) {
    if (!mat) return
    try {
        if (plugin) {
            mat.plugin = plugin
            Object.assign(mat, DIAMOND_PROFILE)
        }
        if ('color' in mat) mat.color = linColor(DIAMOND_PROFILE.color)
        if ('envMapIntensity' in mat) mat.envMapIntensity = DIAMOND_PROFILE.envMapIntensity
        if ('reflectivity' in mat) mat.reflectivity = DIAMOND_PROFILE.reflectivity
        if ('transmission' in mat) mat.transmission = DIAMOND_PROFILE.transmission
        mat.needsUpdate = true
    } catch (e) { /* ignore */ }
}

function applyMaterials(root: any) {
    if (!root) return
    root.traverse((c: any) => {
        if (!c.isMesh || !c.material) return
        const mats = Array.isArray(c.material) ? c.material : [c.material]
        for (const m of mats) {
            if (isDiamondMesh(c)) applyDiamond(m, diamondPluginInstance)
            else applyMetal(m)
        }
    })
}

async function importEnvTexture(src: string): Promise<any> {
    const manager = viewer.getPlugin(AssetManagerPlugin) as any
    if (!manager) return null
    try {
        const env = await manager.importer.importSinglePath(src)
        if (env && env.assetType === 'texture') return env
    } catch (e) { console.warn('Env import failed', src, e) }
    return null
}

async function loadDefaultEnvironment() {
    try {
        viewer.getPlugin(EXRLoadPlugin)
        const env = await importEnvTexture(ENV_PATH)
        if (env) {
            viewer.scene.setEnvironment(env)
            ;(viewer.scene as any).envMapIntensity = 1.0
            ;(viewer.scene as any).refreshEnvMapIntensity?.()
        }
    } catch (e) { console.warn('loadDefaultEnvironment', e) }
}

// ── frame + rotate (PROVEN ring-builder pattern) ──────────────────────
function frameModel() {
    if (!viewer || !ringModel) return
    const root = getRingRoot()
    if (!root) return
    root.position.set(0, 0, 0)
    root.updateMatrixWorld?.(true)
    const box = worldBounds(root)
    if (box.isEmpty()) return
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.01)
    // Recentre at scene origin → rotation spins ring exactly in place.
    root.position.set(-center.x, -center.y, -center.z)
    root.updateMatrixWorld?.(true)

    zoomMin = maxDim * 1.2
    zoomMax = maxDim * 6
    if (groundPlugin) {
        if ('size' in groundPlugin) groundPlugin.size = maxDim * 3.5
        if ('yOffset' in groundPlugin) groundPlugin.yOffset = -0.008 * maxDim
    }
    idealZoom = maxDim * 3.2
    targetZoom = idealZoom
    cameraZoom = maxDim * 4.4
    rotationX = -0.4; targetRotationX = -0.05
    rotationY = -0.9; targetRotationY = 0
    rotationZ = 0; targetRotationZ = 0
    isRotating = false

    const cam = viewer.scene.activeCamera
    cam.position.set(0, cameraZoom * CAM_ELEVATION, cameraZoom)
    if (typeof cam.positionUpdated === 'function') cam.positionUpdated(false)
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

        const pp = viewer.getPlugin(ProgressivePlugin) as any
        if (pp) pp.maxFrameNumber = 60

        try {
            diamondPluginInstance = await viewer.addPlugin(DiamondPlugin)
        } catch (e) { console.warn('DiamondPlugin', e) }
        try {
            const gp = await viewer.addPlugin(ContactShadowGroundPlugin)
            if (gp) groundPlugin = gp
        } catch (e) { console.warn('Ground', e) }

        // Three-point studio lighting
        const key = new DirectionalLight(0xfff4e0, 2.8)
        key.position.set(6, 10, 7)
        key.castShadow = true
        if (key.shadow) { key.shadow.mapSize.width = 4096; key.shadow.mapSize.height = 4096; key.shadow.radius = 10 }
        const fill = new DirectionalLight(0xbcd0e8, 0.7)
        fill.position.set(-7, 3, -4)
        const rim = new DirectionalLight(0xffffff, 1.2)
        rim.position.set(-2, 6, -9)
        ;(viewer.scene as any).add(key)
        ;(viewer.scene as any).add(fill)
        ;(viewer.scene as any).add(rim)
        ;(viewer.scene as any).add(new AmbientLight(0xffffff, 0.35))

        const cam = viewer.scene.activeCamera
        cam.near = 0.1; cam.far = 1000
        cam.setCameraOptions?.({ fov: 25 })
        try { const ctrl = (cam as any).controls; if (ctrl) ctrl.enabled = false } catch {}
        ;(cam as any).target?.set?.(0, 0, 0)

        viewer.scene.setBackground(linColor(BG_BONE_COLOR))
        try { (viewer.scene as any).fixedEnvMapDirection = true } catch {}
        try { (viewer.renderer as any).stableNoise = true } catch {}

        await loadDefaultEnvironment()

        const manager = viewer.getPlugin(AssetManagerPlugin) as any
        const result = await manager.importer.importSingle({ path: MODEL_PATH })
        if (!result) throw new Error('importSingle returned null')
        viewer.scene.addSceneObject(result, { autoScale: false })
        ringModel = result

        applyMaterials(getRingRoot())
        await new Promise<void>(res => requestAnimationFrame(() => res()))
        frameModel()
        modelLoaded = true

        if (pp && typeof pp.reset === 'function') pp.reset()
        try { (viewer.renderer as any).refreshPipeline() } catch {}
        viewer.setDirty()
        if (loaderEl) loaderEl.classList.add('hidden')
        ;(window as any).__spinViewer = viewer

        // ── THE rotation loop (identical to ring-builder) ──
        viewer.addEventListener('preFrame', () => {
            if (!modelLoaded) return
            const root = getRingRoot()
            if (!root) return
            if (autoRotate && !isRotating) targetRotationY += ROTATION_SPEED * 0.01
            rotationX += (targetRotationX - rotationX) * SMOOTHING
            rotationY += (targetRotationY - rotationY) * SMOOTHING
            rotationZ += (targetRotationZ - rotationZ) * SMOOTHING
            cameraZoom += (targetZoom - cameraZoom) * SMOOTHING
            cameraZoom = Math.max(zoomMin, Math.min(zoomMax, cameraZoom))
            const cam = viewer.scene.activeCamera
            cam.position.set(0, cameraZoom * CAM_ELEVATION, cameraZoom)
            if (typeof cam.positionUpdated === 'function') cam.positionUpdated(false)
            root.rotation.order = 'YXZ'
            root.rotation.x = rotationX
            root.rotation.y = rotationY
            root.rotation.z = rotationZ
            root.updateMatrixWorld?.(true)
            try { const rr = (viewer.renderer as any).rendererObject; if (rr?.shadowMap) rr.shadowMap.needsUpdate = true } catch {}
            viewer.setDirty()
        })

        // ── Drag spins the RING (static camera) ──
        canvas.addEventListener('mousedown', (e) => { isRotating = true; lastX = e.clientX; lastY = e.clientY })
        window.addEventListener('mousemove', (e) => {
            if (!isRotating || !modelLoaded) return
            const dx = e.clientX - lastX; const dy = e.clientY - lastY
            if (e.altKey) { targetRotationZ += dx * DRAG_SPEED }
            else { targetRotationY += dx * DRAG_SPEED; targetRotationX = Math.max(-1.3, Math.min(1.3, targetRotationX + dy * DRAG_SPEED * 0.75)) }
            lastX = e.clientX; lastY = e.clientY; viewer.setDirty()
        })
        window.addEventListener('mouseup', () => { isRotating = false })

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isRotating = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY
            } else if (e.touches.length === 2) {
                isRotating = false
                lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
            }
        }, { passive: true })
        window.addEventListener('touchmove', (e) => {
            if (!modelLoaded) return
            if (e.touches.length === 2) {
                e.preventDefault()
                const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
                if (lastPinchDist > 0) targetZoom = Math.max(zoomMin, Math.min(zoomMax, cameraZoom + (lastPinchDist - d) * 0.06))
                lastPinchDist = d; viewer.setDirty()
            } else if (e.touches.length === 1 && isRotating) {
                const dx = e.touches[0].clientX - lastX; const dy = e.touches[0].clientY - lastY
                targetRotationY += dx * DRAG_SPEED
                targetRotationX = Math.max(-1.3, Math.min(1.3, targetRotationX + dy * DRAG_SPEED * 0.75))
                lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; viewer.setDirty()
            }
        }, { passive: false })
        window.addEventListener('touchend', () => { isRotating = false; lastPinchDist = 0 })
        window.addEventListener('touchcancel', () => { isRotating = false; lastPinchDist = 0 })

        canvas.addEventListener('wheel', (e) => {
            if (!modelLoaded) return
            e.preventDefault()
            const d = e.deltaY * ((e as WheelEvent).deltaMode == 1 ? 18 : 1)
            targetZoom = Math.max(zoomMin, Math.min(zoomMax, cameraZoom + d * 0.12))
            viewer.setDirty()
        }, { passive: false })

        // Expose toggles
        ;(window as any).__setSpin = (v: boolean) => { autoRotate = !!v }
        const spinBtn = document.getElementById('spin-btn') as HTMLButtonElement
        const syncBtn = () => { if (spinBtn) spinBtn.classList.toggle('on', autoRotate) }
        if (spinBtn) {
            spinBtn.addEventListener('click', () => { autoRotate = !autoRotate; syncBtn() })
            syncBtn()
        }
        console.log('SPIN VIEWER READY — drag to rotate the ring. __setSpin(true) for auto-rotate.')
    } catch (e: any) {
        console.error('spin-viewer setup failed', e)
        const el = document.getElementById('err') as HTMLElement
        if (el) { el.textContent = 'Error: ' + (e?.message || e); el.style.display = 'block' }
    }
}

setup()
