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
    TemporalAAPlugin,
    BloomPlugin,
    VignettePlugin,
    ContactShadowGroundPlugin,
    DiamondPlugin,
    Mesh,
    DoubleSide,
    PlaneGeometry,
    CanvasTexture,
    MeshBasicMaterial,
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
const initialUrlParams = new URLSearchParams(window.location.search)
const MODEL_PATH = initialUrlParams.get('model')
    ? decodeURIComponent(initialUrlParams.get('model') as string)
    : (runtimeConfig.modelPath || DEFAULT_MODEL_PATH)

// Env selection precedence: ?env=filename query param > runtimeConfig.environmentPath > default.
function resolveEnvPath(): string {
    const query = new URLSearchParams(window.location.search).get('env')
    if (query) return './assets/' + query
    if (runtimeConfig.environmentPath) return runtimeConfig.environmentPath
    return './assets/env_metal_001.hdr'
}
const ENV_PATH = resolveEnvPath()

const AUTO_ROTATE = runtimeConfig.autoRotate !== false
const ROTATION_SPEED = Number.isFinite(runtimeConfig.rotationSpeed) ? runtimeConfig.rotationSpeed : 0.35
const BG_BONE_COLOR = '#f4f4eb'

// Exact iJewel yellow-gold polished recipe (METAL_PRESETS yellowGold)
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
let staticShadow: any = null      // fixed soft radial shadow (does NOT rotate with ring)

// ---- CAMERA-ORBIT (ring stays fixed at xyz(0,0,0)) ----
// The ring is never rotated — it sits exactly at origin. Only the CAMERA orbits
// on a sphere around it (theta = yaw, phi = polar, radius = distance). Using
// webgi's property setters (set position / set target) which auto-sync the
// THREE camera and auto-lookAt the target, so the ring stays dead-centre.
const SMOOTHING = 0.12        // critically-damped easing per frame
const DEFAULT_FOV = 45
const DRAG_SPEED = 0.006      // += rad per pixel of drag
let theta = 0.7               // azimuth / yaw around ring (rad)
let phi = Math.PI / 2 - 0.52  // polar from model-up: lower phi = more overhead
let radius = 8                // camera distance from ring centre (origin)
let goalTheta = 0.7
let goalPhi = Math.PI / 2 - 0.52
let goalRadius = 8
const minPhi = 0.15           // ~near top-down
const maxPhi = Math.PI * 0.5  // level side view (never below floor)
let minRadius = 2
let maxRadius = 60
let idealRadius = 8
let boundingRadius = 4
let isOrbiting = false
let lastX = 0; let lastY = 0
let lastPinchDist = 0
let metalEnvIntensity = 1.0
let autoRotateGlobal = false

// ── LIVE TUNABLES (window.__viewerOpts) ────────────────────────────────
// Override the auto-computed camera/rotation/ground each frame. Setting any of
// the toggles turns control over to you; set them back to null to re-enable
// auto framing. Exposed on window.__viewerOpts for console tweaking (like the
// ring-builder's __ringBuilder debug API).
const camOverride = { on: false, x: 0, y: 0, z: 8, tx: 0, ty: 0, tz: 0, fov: 45 }
const rotOverride = { on: false, x: -0.25, y: 0, z: 0 }
const gndOverride = { on: false, size: 10, yOffset: -0.1, y: 0 }
const camAngle = { theta: 0.7, phi: Math.PI / 2 - 0.52 }  // spherical: drag = theta/phi

const loaderEl = document.getElementById('loader') as HTMLElement

let __optsInstalled = false

function installViewerOpts() {
    const O: any = {
        cam: camOverride,
        rot: rotOverride,
        ground: gndOverride,
        angle: camAngle,
        help: 'Tune live (values apply next frame). Toggles: cam.on, rot.on, ground.on.\n' +
            '  __viewerOpts.cam    = {on:true, x,y,z (position), tx,ty,tz (target), fov}\n' +
            '  __viewerOpts.angle  = {theta, phi}  spherical camera orbit (rad): theta=yaw around ring, phi=polar (PI/2 = level height, lower = overhead)\n' +
            '  __viewerOpts.rot    = {on:true, x,y,z}  ring rotation (only if you want it to move)\n' +
            '  __viewerOpts.ground = {on:true, size, yOffset}  soft shadow disc\n' +
            '  __viewerOpts.distance = camera distance from ring (origin)\n' +
            '  __viewerOpts.theta / __viewerOpts.phi = camera yaw / polar (deg shortcuts)\n' +
            '  __viewerOpts.yawDeg / __viewerOpts.polarDeg = same in degrees\n' +
            '  __viewerOpts.reset() restores auto framing',
        get distance() { return radius },
        set distance(v) { goalRadius = radius = Math.max(minRadius, Math.min(maxRadius, Number(v))) },
        get thetaDeg() { return theta * 180 / Math.PI },
        set thetaDeg(v) { goalTheta = Number(v) * Math.PI / 180 },
        get phiDeg() { return phi * 180 / Math.PI },
        set phiDeg(v) { goalPhi = Math.min(maxPhi, Math.max(minPhi, Number(v) * Math.PI / 180)) },
        set yawDeg(v) { goalTheta = Number(v) * Math.PI / 180 },
        set polarDeg(v) { goalPhi = Math.min(maxPhi, Math.max(minPhi, Number(v) * Math.PI / 180)) },
        reset() {
            camOverride.on = false; rotOverride.on = false; gndOverride.on = false
            goalTheta = 0.7; goalPhi = Math.PI / 2 - 0.52; goalRadius = idealRadius * 1.5
            window.location.search = ''
        },
    }
    // Live re-apply on next frame is automatic (read from module state each frame).
    ;(window as any).__viewerOpts = O
    console.log('Tune live via window.__viewerOpts. Type __viewerOpts.help for usage.')
}

const debugOn = new URLSearchParams(window.location.search).has('debug')
let __dbgFrame = 0

if (debugOn) {
    const d = document.createElement('div')
    d.id = '__dbg'
    d.style.cssText = 'position:fixed;left:10px;top:10px;z-index:99999;background:rgba(0,0,0,.8);color:#0f0;font:11px monospace;white-space:pre;padding:8px;max-width:70vw'
    document.body.appendChild(d)
}

function linColor(hex: string) { return new Color(hex).convertSRGBToLinear() }
function __dbgUpdate() {
    try {
        const root = getRingRoot()
        const cam: any = viewer?.scene?.activeCamera
        const co = cam?.cameraObject
        const el = document.getElementById('__dbg')
        if (!el) return
        const camP = cam ? `(${cam.position.x.toFixed(2)},${cam.position.y.toFixed(2)},${cam.position.z.toFixed(2)})` : 'none'
        const rot = root ? `(${root.rotation.x.toFixed(2)},${root.rotation.y.toFixed(2)},${root.rotation.z.toFixed(2)})` : 'no-root'
        const aim = (cam && cam.target) ? `aim(${cam.target.x.toFixed(1)},${cam.target.y.toFixed(1)},${cam.target.z.toFixed(1)})` : 'no-target'
        el.textContent =
            `frame#${__dbgFrame++} cam=${camP} fov=${co?.fov?.toFixed?.(1) ?? '?'} ${aim}\n` +
            `orbit theta=${(theta * 180 / Math.PI).toFixed(1)}° phi=${(phi * 180 / Math.PI).toFixed(1)}° dist=${radius.toFixed(2)}\n` +
            `root.rot ${rot} autoRotate=${autoRotateGlobal}\n` +
            `ringModel.children=${ringModel?.children != null ? (ringModel as any).children?.length ?? '?' : 'n/a'} modelObject=${!!getRingRoot()}`
    } catch (e) { /* ignore */ }
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
        if ('side' in mat) mat.side = DoubleSide
        mat.needsUpdate = true
    } catch {}
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

function getRotationTarget() {
    return getRingRoot()
}

// Fixed soft radial shadow under the ring. parented to the SCENE ROOT (not the
// ring root) so it never rotates with the ring — exactly the ask (only the ring
// spins; the shadow stays put in one place). A static radial-gradient plane,
// cheaper and steadier than a per-frame dynamic contact shadow.
function buildStaticShadow(ringCenterY: number, radius: number) {
    const scene: any = viewer.scene
    if (!scene) return
    try {
        // Radial-gradient texture (soft centre → transparent edge)
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

        const geo = new PlaneGeometry(radius * 2.2, radius * 2.2)
        const mat = new MeshBasicMaterial({
            map: tex, transparent: true, depthWrite: false,
        })
        const mesh = new Mesh(geo, mat)
        mesh.rotation.x = -Math.PI / 2
        mesh.position.set(0, ringCenterY - radius * 0.18, 0)
        // Anchor to scene root (independent of the rotating ring root).
        scene.add(mesh)
        staticShadow = mesh
    } catch (e) { console.warn('buildStaticShadow', e) }
}

function frameModel() {
    if (!viewer || !ringModel) return
    const root = getRotationTarget()
    if (!root) return
    root.updateMatrixWorld?.(true)
    const box = worldBounds(root)
    if (box.isEmpty()) return
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.01)
    // CENTER the root at the origin. Now `root.rotation` spins the ring about
    // its own centre — the ring can never precess or drift off-screen.
    root.position.sub(center)
    root.updateMatrixWorld?.(true)

    // Fixed soft shadow: a static radial plane parented to the SCENE ROOT so it
    // never rotates with the ring. The dynamic contact-shadow pattern tracked the
    // ring's top-down silhouette and visibly spun — disable it, use our static one.
    const ringBottomY = -size.y / 2
    if (gndOverride.on) {
        buildStaticShadow(ringBottomY + gndOverride.yOffset, gndOverride.size)
    } else {
        buildStaticShadow(ringBottomY - 0.02 * maxDim, maxDim)
        if (groundPlugin) {
            try { if ('visible' in groundPlugin) groundPlugin.visible = false } catch {}
        }
    }

    // Framing: ring sits at origin; orbit radius images it via bounding radius
    // / sin(fov/2), standing the camera 1.5x back on the sphere so it fills frame.
    boundingRadius = maxDim / 2
    idealRadius = boundingRadius / Math.sin((DEFAULT_FOV / 2) * Math.PI / 180)
    minRadius = idealRadius * 0.35
    maxRadius = idealRadius * 4.5
    radius = idealRadius * 1.5
    goalRadius = radius

    // Default hero pose: camera yaw/polar for a slight showroom look-down.
    theta = 0.7; goalTheta = 0.7
    phi = Math.PI / 2 - 0.52; goalPhi = phi

    const cam = viewer.scene.activeCamera
    const co = cam.cameraObject
    if (co && 'fov' in co) co.fov = DEFAULT_FOV
    else if ('fov' in cam) cam.fov = DEFAULT_FOV
    positionCamera(cam)
    viewer.setDirty()
}

// Camera moves on a sphere around the origin while the RING stays fixed at
// xyz(0,0,0). Each frame we recompute the cartesian position from the spherical
// orbit variables and aim the camera at the origin. The ring never moves, so it
// can never drift — only the viewing angle changes.
function positionCamera(cam: any) {
    try {
        let px: number, py: number, pz: number
        let tx = 0, ty = 0, tz = 0
        let fov = DEFAULT_FOV
        if (camOverride.on) {
            // Manual Cartesian position + target (set cam.on=true).
            px = camOverride.x; py = camOverride.y; pz = camOverride.z
            tx = camOverride.tx; ty = camOverride.ty; tz = camOverride.tz
            fov = camOverride.fov
        } else {
            // Spherical orbit about the origin. theta = yaw around ring,
            // phi = polar from model-up (lower = more overhead, PI/2 = level height).
            const sinPhi = Math.sin(phi)
            px = radius * sinPhi * Math.sin(theta)
            py = radius * Math.cos(phi)
            pz = radius * sinPhi * Math.cos(theta)
        }
        if (cam.target) cam.target = new Vector3(tx, ty, tz)
        cam.position = new Vector3(px, py, pz)
        const co = cam.cameraObject
        if (co && 'fov' in co) { co.fov = fov; try { co.updateProjectionMatrix() } catch {} }
        try { cam.setDirty?.() } catch {}
    } catch (e) { console.warn('positionCamera', e) }
}

function dumpMatDiag() {
    try {
        if (!viewer) return
        const root = getRingRoot()
        const scene: any = viewer.scene
        const lines: string[] = []
        lines.push(`envMap set: ${!!scene.environment}, scene.envMapIntensity: ${scene.envMapIntensity}, metalEnvIntensity: ${metalEnvIntensity}`)
        let met = 0, dia = 0, envless = 0, noColor = 0
        root?.traverse?.((c: any) => {
            if (!c.isMesh || !c.material) return
            const mats = Array.isArray(c.material) ? c.material : [c.material]
            for (const m of mats) {
                const isDia = isDiamondMesh(c)
                if (isDia) dia++; else met++
                if (!m.envMap && !isDia) envless++
                if (!m.color) noColor++
                lines.push(`  ${JSON.stringify(m.name)} type=${m.type || m.constructor?.name} color=#${m.color?.getHexString?.() ?? '?'} metal=${m.metalness} rough=${m.roughness} envI=${m.envMapIntensity} env=${!!m.envMap} ${isDia ? 'DIAMOND' : 'METAL'}`)
            }
        })
        lines.push(`METAL meshes: ${met}, DIAMOND meshes: ${dia}, metal-without-env: ${envless}, no-color: ${noColor}`)
        const msg = 'DIAG ' + lines.join('\nDIAG  ')
        if (new URLSearchParams(window.location.search).has('debug')) {
            const el = document.createElement('pre')
            el.style.position = 'fixed'; el.style.left = '0'; el.style.top = '0'; el.style.zIndex = '99999'
            el.style.background = 'rgba(0,0,0,0.8)'; el.style.color = '#0f0'; el.style.fontSize = '11px'
            el.style.padding = '8px'; el.style.maxHeight = '50vh'; el.style.overflow = 'auto'
            el.textContent = msg
            document.body.appendChild(el)
        }
        console.log(msg)
    } catch (e) { console.warn('DIAG err', e) }
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

let metalEnvironment: any = null

async function setMetalEnvironment(src: string | File) {
    const env = await importEnvTexture(src)
    if (!env) { console.warn('Failed to load metal environment'); return }
    await viewer.scene.setEnvironment(env)
    metalEnvironment = env
    applyMetalEnvSettings()
    renderRefresh()
}

function applyMetalEnvSettings() {
    const scene: any = viewer?.scene
    if (!scene) return
    scene.envMapIntensity = metalEnvIntensity
    if (typeof scene.refreshEnvMapIntensity === 'function') scene.refreshEnvMapIntensity()
}

async function loadDefaultEnvironment() {
    await new Promise<void>(r => requestAnimationFrame(() => r()))
    await setMetalEnvironment(ENV_PATH)
    if (diamondPluginInstance) {
        diamondPluginInstance.envMap = metalEnvironment
        diamondPluginInstance.forceSceneEnvMap = false
        if (typeof diamondPluginInstance.refreshEnvMaps === 'function')
            diamondPluginInstance.refreshEnvMaps()
    }
}

async function setup() {
    try {
        const canvas = document.getElementById('webgi-canvas') as HTMLCanvasElement

        viewer = new ViewerApp({ canvas, useGBufferDepth: true, isAntialiased: false })
        installViewerOpts()

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
        try { await viewer.addPlugin(EXRLoadPlugin) } catch (e) { console.warn('EXRLoadPlugin failed', e) }
        try { await viewer.addPlugin(FrameFadePlugin) } catch {}
        try { await viewer.addPlugin(TemporalAAPlugin) } catch {}
        try { const bl = await viewer.addPlugin(BloomPlugin) as any; if (bl) { bl.intensity = 0.16; bl.threshold = 0.92 } } catch (e) { console.warn('Bloom', e) }
        try { const vg = await viewer.addPlugin(VignettePlugin) as any; if (vg) vg.power = 0.78 } catch (e) { console.warn('Vignette', e) }

        try {
            const dp = await viewer.addPlugin(DiamondPlugin)
            if (dp) (dp as any).forceSceneEnvMap = false
            diamondPluginInstance = dp
        } catch {}

        try {
            const gp = await viewer.addPlugin(ContactShadowGroundPlugin)
            if (gp) {
                gp.contactShadows = true
                if ('blurAmount' in gp) gp.blurAmount = 0.95
                if ('shadowScale' in gp) gp.shadowScale = 1
                groundPlugin = gp
            }
        } catch (e) { console.warn('ContactShadowGroundPlugin failed', e) }

        // --- Studio three-point lighting ---
        // Key / "softbox" light: warm white, front-left, high. Casts the soft main
        // shadow that grounds the ring. Large soft shadow area for a studio feel.
        const key = new DirectionalLight(0xfff4e0, 2.8)
        key.position.set(6, 10, 7); key.castShadow = true
        key.shadow.mapSize.width = 4096; key.shadow.mapSize.height = 4096
        key.shadow.bias = -0.0001; key.shadow.normalBias = 0.02
        key.shadow.radius = 10
        key.shadow.camera.near = 0.1; key.shadow.camera.far = 100
        key.shadow.camera.left = -20; key.shadow.camera.right = 20
        key.shadow.camera.top = 20; key.shadow.camera.bottom = -20
        // Fill light: cool, low from the opposite side — lifts the shadows without
        // a second cast shadow.
        const fill = new DirectionalLight(0xbcd0e8, 0.7)
        fill.position.set(-7, 3, -4)
        // Rim / back light: cool-white from behind — separates the ring from the
        // ivory background and catches the polished edges.
        const rim = new DirectionalLight(0xffffff, 1.2)
        rim.position.set(-2, 6, -9)
        ;(viewer.scene as any).add(key)
        ;(viewer.scene as any).add(fill)
        ;(viewer.scene as any).add(rim)
        ;(viewer.scene as any).add(new AmbientLight(0xffffff, 0.35))

        const cam = viewer.scene.activeCamera
        cam.near = 0.1; cam.far = 1000
        cam.setCameraOptions?.({ fov: 25 })
        try { (cam as any).target?.set?.(0, 0, 0) } catch {}
        // Fully drop webgi's built-in OrbitControls. We drive the camera manually,
        // so any built-in controls would fight our orbit and re-aim at a stale
        // target (ring swinging off-screen). autoLookAtTarget handles aiming.
        try {
            cam.setCameraOptions?.({ controlsEnabled: false, controlsMode: "" })
            cam.autoLookAtTarget = true
        } catch (e) { console.warn('disable controls', e) }
        try { const ctrl = (cam as any).controls; if (ctrl) ctrl.enabled = false } catch {}

        viewer.scene.setBackground(linColor(BG_BONE_COLOR))

        try { (viewer.scene as any).fixedEnvMapDirection = true } catch {}
        try { (viewer.renderer as any).stableNoise = true } catch {}

        await loadDefaultEnvironment()

        // Load the single ring model directly via the same WebGI pipeline
        const manager = viewer.getPlugin(AssetManagerPlugin) as any
        const result = await manager.importer.importSingle({ path: MODEL_PATH })
        if (!result) throw new Error('importSingle returned null')
        viewer.scene.addSceneObject(result, { autoScale: false })
        ringModel = result

        applyMaterials(getRingRoot())
        await new Promise<void>(r => requestAnimationFrame(() => r()))
        frameModel()
        modelLoaded = true

        if (pp && typeof pp.reset === 'function') pp.reset()
        try { (viewer.renderer as any).refreshPipeline() } catch {}
        viewer.setDirty()

        loaderEl.classList.add('hidden')
        dumpMatDiag()
        ;(window as any).__ringViewer = viewer

        viewer.addEventListener('preFrame', () => {
            if (!modelLoaded) return
            const root = getRotationTarget()
            if (root) {
                // Auto-rotate = camera orbits (theta keeps growing).
                if (autoRotate && !isOrbiting) goalTheta += ROTATION_SPEED * 0.012
                // Critically-damped easing of the orbit angles toward goals.
                theta += (goalTheta - theta) * SMOOTHING
                phi += (goalPhi - phi) * SMOOTHING
                radius = Math.max(minRadius, Math.min(maxRadius, radius + (goalRadius - radius) * SMOOTHING))
                const cam = viewer.scene.activeCamera
                positionCamera(cam)
                // Ring STAYS FIXED at xyz(0,0,0) — only rotates if explicitly
                // overridden (rot.on). Default: untouched, dead-centred.
                if (rotOverride.on) {
                    root.rotation.order = 'YXZ'
                    root.rotation.x = rotOverride.x
                    root.rotation.y = rotOverride.y
                    root.rotation.z = rotOverride.z
                    root.updateMatrixWorld?.(true)
                }
            }
            try { const rr = (viewer.renderer as any).rendererObject; if (rr?.shadowMap) rr.shadowMap.needsUpdate = true } catch {}
            if (debugOn && __dbgFrame % 5 === 0) __dbgUpdate()
            viewer.setDirty()
        })

        const resetView = () => {
            isOrbiting = false
            // Ease the camera back to the default hero orbit + framing distance.
            goalTheta = 0.7
            goalPhi = Math.PI / 2 - 0.52
            goalRadius = idealRadius * 1.5
            viewer.setDirty()
        }

        // ---- Drag to ORBIT the camera (ring stays fixed at origin) ----
        canvas.addEventListener('mousedown', (e) => { isOrbiting = true; lastX = e.clientX; lastY = e.clientY })
        window.addEventListener('mousemove', (e) => {
            if (!isOrbiting || !modelLoaded) return
            const dx = e.clientX - lastX; const dy = e.clientY - lastY
            goalTheta -= dx * DRAG_SPEED
            goalPhi = Math.max(minPhi, Math.min(maxPhi, goalPhi + dy * DRAG_SPEED * 0.75))
            lastX = e.clientX; lastY = e.clientY; viewer.setDirty()
        })
        window.addEventListener('mouseup', () => { isOrbiting = false })

        // ---- Touch: single-finger orbit (camera), two-finger pinch zoom ----
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isOrbiting = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY
            } else if (e.touches.length === 2) {
                isOrbiting = false
                lastPinchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY)
            }
        }, { passive: true })
        window.addEventListener('touchmove', (e) => {
            if (!modelLoaded) return
            if (e.touches.length === 2) {
                e.preventDefault()
                const d = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY)
                if (lastPinchDist > 0) {
                    goalRadius = Math.max(minRadius, Math.min(maxRadius, radius + (lastPinchDist - d) * 0.06))
                }
                lastPinchDist = d; viewer.setDirty()
            } else if (e.touches.length === 1 && isOrbiting) {
                const dx = e.touches[0].clientX - lastX; const dy = e.touches[0].clientY - lastY
                goalTheta -= dx * DRAG_SPEED
                goalPhi = Math.max(minPhi, Math.min(maxPhi, goalPhi + dy * DRAG_SPEED * 0.75))
                lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; viewer.setDirty()
            }
        }, { passive: false })
        window.addEventListener('touchend', () => { isOrbiting = false; lastPinchDist = 0 })
        window.addEventListener('touchcancel', () => { isOrbiting = false; lastPinchDist = 0 })

        // ---- Wheel zoom: move the camera toward/away (radius), ring stays put ----
        canvas.addEventListener('wheel', (e) => {
            if (!modelLoaded) return
            e.preventDefault()
            const d = e.deltaY * ((e as WheelEvent).deltaMode == 1 ? 18 : 1)
            goalRadius = Math.max(minRadius, Math.min(maxRadius, radius + d * 0.06))
            viewer.setDirty()
        }, { passive: false })

        // ---- Double-click / double-tap: focus the ring (smooth reset to hero view) ----
        canvas.addEventListener('dblclick', (e) => { e.preventDefault(); resetView() })
        let lastTap = 0
        canvas.addEventListener('touchend', (e) => {
            const now = Date.now()
            if (now - lastTap < 320) { e.preventDefault(); resetView() }
            lastTap = now
        }, { passive: false })

        // ---- UI wiring ----
        const autoBtn = document.getElementById('ctl-auto') as HTMLButtonElement
        const resetBtn = document.getElementById('ctl-reset') as HTMLButtonElement
        const fullBtn = document.getElementById('ctl-full') as HTMLButtonElement
        const panelToggle = document.getElementById('panel-toggle') as HTMLButtonElement
        const panel = document.getElementById('panel') as HTMLElement
        const panelClose = document.getElementById('panel-close') as HTMLButtonElement
        const certBtn = document.getElementById('cert-btn') as HTMLButtonElement
        const hintEl = document.getElementById('hint') as HTMLElement

        let autoRotate = AUTO_ROTATE
        const setAuto = (on: boolean) => {
            autoRotate = on
            autoRotateGlobal = on
            if (on) autoBtn.classList.add('on'); else autoBtn.classList.remove('on')
        }
        setAuto(autoRotate)
        autoBtn.addEventListener('click', () => setAuto(!autoRotate))

        resetBtn.addEventListener('click', resetView)

        const fullIcon = fullBtn.innerHTML
        fullBtn.addEventListener('click', () => {
            const fs = document as any
            if (!fs.fullscreenElement) {
                (document.documentElement as any).requestFullscreen?.()
                fullBtn.classList.add('on')
            } else {
                fs.exitFullscreen?.()
                fullBtn.classList.remove('on')
            }
        })
        document.addEventListener('fullscreenchange', () => {
            const fs = document as any
            if (fs.fullscreenElement) fullBtn.classList.add('on'); else fullBtn.classList.remove('on')
        })

        panelToggle.addEventListener('click', () => panel.classList.add('open'))
        panelClose.addEventListener('click', () => panel.classList.remove('open'))
        ;(window as any).__openPanel = () => panel.classList.add('open')

        // Certificate button — points at the IGI verification page (override via
        // window.WEBGI_VIEWER_CONFIG.certUrl). Placeholder opens in new tab.
        defaultCertificateUrl((url) => {
            certBtn.addEventListener('click', () => { window.open(url, '_blank', 'noopener') })
        })

        setTimeout(() => hintEl.classList.add('fade'), 9000)
    } catch (e) {
        console.error('Bare viewer setup failed:', e)
        loaderEl.classList.add('hidden')
    }
}

// Resolve the IGI certificate URL. Config `certUrl` wins; otherwise we emit a
// placeholder into the console and open the IGI homepage.
function defaultCertificateUrl(done: (url: string) => void) {
    const cfg = (window as any).WEBGI_VIEWER_CONFIG || {}
    if (cfg.certUrl) { done(cfg.certUrl); return }
    console.warn('No WEBGI_VIEWER_CONFIG.certUrl set — IGI button opens the IGI home page.')
    done('https://www.igi.org/')
}

setup()
