import {
    ViewerApp,
    AssetManagerPlugin,
    ProgressivePlugin,
    TonemapPlugin,
    SSAOPlugin,
    Color,
    DiamondPlugin,
    Mesh,
    Vector3,
    Box3,
    EquirectangularReflectionMapping,
    PMREMGenerator,
    DataTexture,
} from './webgi-re-exports'
import { IjewelViewer } from './ijewel-viewer'
import { DiamondPlacementSystem } from './anchorDiamondPlacement'
import JSZip from 'jszip'

// Patch three.js r144+ removed methods needed by webgi's bundled Box3.expandByObject
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
const DEFAULT_MODEL_PATH = runtimeConfig.modelPath || './assets/main.glb'
const LOCAL_DRACO_DECODER_PATH = runtimeConfig.dracoDecoderPath || './assets/draco/'
const DEFAULT_ENVIRONMENT_PATH = runtimeConfig.environmentPath || './assets/env_gem_002.exr'
const DEFAULT_METAL_ENVIRONMENT_PATH = runtimeConfig.metalEnvironmentPath || './assets/env_metal_001.hdr'
const DEFAULT_BACKGROUND_COLOR = runtimeConfig.backgroundColor || '#ffffff'
const DEFAULT_BACKGROUND_IMAGE = runtimeConfig.backgroundImage || './assets/background.jpg'
const INITIAL_ZOOM_PERCENT = Number.isFinite(runtimeConfig.initialZoomPercent) ? Number(runtimeConfig.initialZoomPercent) : 95
const DIAMOND_NAME_REGEX = /diamond|diamonds|gem|stone|solit(er|a)|soliter|brilliant|brillant|cz|moissanite|ruby|sapphire|emerald/i

const METAL_PRESETS: Record<string, { color: string; metalness: number; roughness: number; envMapIntensity: number; label: string }> = {
    yellowGold: { color: '#d4af37', metalness: 1, roughness: 0.15, envMapIntensity: 2.2, label: 'Yellow Gold' },
    whiteGold: { color: '#e8e8e8', metalness: 1, roughness: 0.1, envMapIntensity: 2.5, label: 'White Gold' },
    roseGold: { color: '#e8b4a0', metalness: 1, roughness: 0.12, envMapIntensity: 2.2, label: 'Rose Gold' },
    platinum: { color: '#d4d4d8', metalness: 1, roughness: 0.08, envMapIntensity: 2.8, label: 'Platinum' },
    palladium: { color: '#c0c0c8', metalness: 1, roughness: 0.1, envMapIntensity: 2.6, label: 'Palladium' },
    silver: { color: '#e2e2e6', metalness: 1, roughness: 0.05, envMapIntensity: 3.0, label: 'Silver' },
    gold_24k: { color: '#ffd700', metalness: 1, roughness: 0.1, envMapIntensity: 2.5, label: '24K Gold' },
    gold_18k: { color: '#d4af37', metalness: 1, roughness: 0.12, envMapIntensity: 2.3, label: '18K Gold' },
    gold_14k: { color: '#c8a832', metalness: 1, roughness: 0.15, envMapIntensity: 2.0, label: '14K Gold' },
    gold_9k: { color: '#b8962e', metalness: 1, roughness: 0.18, envMapIntensity: 1.8, label: '9K Gold' },
}

const GEMSTONE_PRESETS: Record<string, { color: string; label: string }> = {
    diamond: { color: '#ffffff', label: 'Diamond' },
    ruby: { color: '#e0115f', label: 'Ruby' },
    sapphire_blue: { color: '#0f52ba', label: 'Blue Sapphire' },
    sapphire_pink: { color: '#ffb7c5', label: 'Pink Sapphire' },
    emerald: { color: '#50c878', label: 'Emerald' },
    amethyst: { color: '#9966cc', label: 'Amethyst' },
    aquamarine: { color: '#7fffd4', label: 'Aquamarine' },
    topaz: { color: '#ffc87c', label: 'Topaz' },
    morganite: { color: '#f5b7c5', label: 'Morganite' },
    tanzanite: { color: '#6f00ff', label: 'Tanzanite' },
    garnet: { color: '#8b0000', label: 'Garnet' },
    peridot: { color: '#9acd32', label: 'Peridot' },
    moissanite: { color: '#f0f0f4', label: 'Moissanite' },
    cz: { color: '#f8f8fc', label: 'Cubic Zirconia' },
}

const DIAMOND_CUT_PRESETS: Record<string, { dispersion: number; refractiveIndex: number; absorptionFactor: number; gammaFactor: number; label: string }> = {
    ideal: { dispersion: 0.012, refractiveIndex: 2.6, absorptionFactor: 1.0, gammaFactor: 1.0, label: 'Ideal Cut' },
    premium: { dispersion: 0.010, refractiveIndex: 2.5, absorptionFactor: 0.95, gammaFactor: 0.95, label: 'Premium Cut' },
    good: { dispersion: 0.008, refractiveIndex: 2.4, absorptionFactor: 0.9, gammaFactor: 0.9, label: 'Good Cut' },
    fair: { dispersion: 0.006, refractiveIndex: 2.35, absorptionFactor: 0.85, gammaFactor: 0.85, label: 'Fair Cut' },
    poor: { dispersion: 0.004, refractiveIndex: 2.3, absorptionFactor: 0.8, gammaFactor: 0.8, label: 'Poor Cut' },
}

const SCENE_PRESETS: Record<string, { env: string; bgColor: string; envIntensity: number; label: string }> = {
    studioGem: { env: './assets/env_gem_002.exr', bgColor: '#ffffff', envIntensity: 1.2, label: 'Studio (Gem)' },
    warmGem: { env: './assets/env_gem_002.exr', bgColor: '#f5f0e8', envIntensity: 1.0, label: 'Warm (Gem)' },
    darkGem: { env: './assets/env_gem_002.exr', bgColor: '#1a1a1a', envIntensity: 0.8, label: 'Dark (Gem)' },
    studioMetal: { env: './assets/env_metal_001.hdr', bgColor: '#ffffff', envIntensity: 1.2, label: 'Studio (Metal)' },
    outdoor: { env: './assets/env_gem_002.exr', bgColor: '#87ceeb', envIntensity: 1.5, label: 'Outdoor' },
}

interface DiamondProfile {
    color: string
    envMapIntensity: number
    envMapRotation: number
    dispersion: number
    squashFactor: number
    geometryFactor: number
    gammaFactor: number
    absorptionFactor: number
    reflectivity: number
    transmission: number
    refractiveIndex: number
    rayBounces: number
    diamondOrientedEnvMap: number
    boostFactors: [number, number, number]
}

interface MetalProfile {
    color: string
    metalness: number
    roughness: number
    envMapIntensity: number
}

let isRotating = false
let lastX = 0; let lastY = 0
let rotationX = 0; let rotationY = 0; let rotationZ = 0
const MAX_TILT = 15 * Math.PI / 180
let modelLoaded = false
let viewer: ViewerApp
let ijewelViewer: IjewelViewer
let diamondPluginInstance: any = null
let ringModel: Mesh | any = null
let shadowFloor: any = null
let shadowLight: any = null
let selectedFile: File | null = null
let selectedHdrFile: File | null = null
let hdrIntensity = 1.0
let hdrRotation = 0
let activeCameraDistance = 6
let viewerMinDistance = 4
let viewerMaxDistance = 10
let diamondPlacement: DiamondPlacementSystem
let currentEnvironment: any = null
let backgroundTexture: any = null
let progressivePlugin: any = null
let tonemapPlugin: any = null
let ssaoPlugin: any = null
let environmentIntensityValue = 1.5

const ringFitCenter = new Vector3()
const ringFitSize = new Vector3()

const initialUrlParams = new URLSearchParams(window.location.search)
const initialModelPath = initialUrlParams.get('model') ? decodeURIComponent(initialUrlParams.get('model') as string) : DEFAULT_MODEL_PATH

const diamondProfile: DiamondProfile = {
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
    boostFactors: [1.0, 1.0, 1.0]
}

const metalProfile: MetalProfile = {
    color: '#c2bfc3',
    metalness: 1,
    roughness: 0,
    envMapIntensity: 1.0
}

function applyRuntimeConfig() {
    const m: any = runtimeConfig.metal || {}
    const d: any = runtimeConfig.diamond || {}
    if (typeof m.color === 'string' && m.color) metalProfile.color = m.color
    if (Number.isFinite(m.metalness)) metalProfile.metalness = Number(m.metalness)
    if (Number.isFinite(m.roughness)) metalProfile.roughness = Number(m.roughness)
    if (Number.isFinite(m.envMapIntensity)) metalProfile.envMapIntensity = Number(m.envMapIntensity)
    if (typeof d.color === 'string' && d.color) diamondProfile.color = d.color
    if (Number.isFinite(d.transmission)) diamondProfile.transmission = Number(d.transmission)
    if (Number.isFinite(d.refractiveIndex)) diamondProfile.refractiveIndex = Number(d.refractiveIndex)
    if (Number.isFinite(d.ior)) diamondProfile.refractiveIndex = Number(d.ior)
    if (Number.isFinite(d.sparkle)) diamondProfile.envMapIntensity = Number(d.sparkle)
    if (typeof runtimeConfig.metalEnvironmentPath === 'string') (DEFAULT_METAL_ENVIRONMENT_PATH as any) = runtimeConfig.metalEnvironmentPath
}
applyRuntimeConfig()

function createLinearColor(hex: string) { return new Color(hex).convertSRGBToLinear() }

function setStatus(msg: string, isError = false) {
    const el = document.getElementById('setup-status') as HTMLElement | null
    if (!el) return; el.textContent = msg; el.style.color = isError ? '#a12d2d' : '#6f5c4a'
}
function setLoaderMessage(msg: string) {
    const l = document.getElementById('loader') as HTMLElement | null
    const p = l?.querySelector('p') as HTMLElement | null; if (p) p.textContent = msg
}
function getErrorMessage(e: any) {
    if (!e) return 'Unknown error.'
    if (typeof e === 'string') return e
    if (typeof e?.message === 'string' && e.message) return e.message
    try { return JSON.stringify(e) } catch { return String(e) }
}
function setFrontendError(msg: string, details?: any) {
    const b = document.getElementById('frontend-error') as HTMLElement | null
    if (!b) return; b.textContent = msg + (details ? ' ' + getErrorMessage(details) : ''); b.hidden = false
}
function clearFrontendError() {
    const b = document.getElementById('frontend-error') as HTMLElement | null
    if (!b) return; b.textContent = ''; b.hidden = true
}

function markSelectedFile(file: File | null) {
    selectedFile = file
    const fn = document.getElementById('file-name') as HTMLElement | null
    if (!fn) return
    fn.textContent = file ? `Selected: ${file.name}` : `Model: ${initialModelPath.split('/').pop() || 'main.glb'}`
}

// ─── Diamond Material (WebGI DiamondMaterial / ShaderMaterial) ───
// The DiamondPlugin replaces MeshPhysicalMaterial with a custom
// DiamondMaterial (ShaderMaterial). Only properties in
// DiamondMaterialParameters take effect. MeshPhysicalMaterial-only
// props (roughness, metalness, clearcoat, iridescence, sheen, etc.)
// do NOT exist on DiamondMaterial and are silently ignored.

function syncDiamondExtension(material: any) {
    const ext = material?.extensions?.WEBGI_materials_diamond
    if (!ext) return
    ext.color = new Color(diamondProfile.color).getHex()
    ext.envMapIntensity = diamondProfile.envMapIntensity
    ext.envMapRotationOffset = diamondProfile.envMapRotation * (Math.PI / 180)
    ext.dispersion = diamondProfile.dispersion
    ext.squashFactor = diamondProfile.squashFactor
    ext.geometryFactor = diamondProfile.geometryFactor
    ext.gammaFactor = diamondProfile.gammaFactor
    ext.absorptionFactor = diamondProfile.absorptionFactor
    ext.reflectivity = diamondProfile.reflectivity
    ext.transmission = diamondProfile.transmission
    ext.refractiveIndex = diamondProfile.refractiveIndex
    ext.rayBounces = diamondProfile.rayBounces
    ext.diamondOrientedEnvMap = diamondProfile.diamondOrientedEnvMap
    ext.boostFactors = { x: diamondProfile.boostFactors[0], y: diamondProfile.boostFactors[1], z: diamondProfile.boostFactors[2], isVector3: true }
}

function applyDiamondMaterial(material: any) {
    if (!material) return
    // 1. Sync the WEBGI_materials_diamond extension data (DiamondPlugin reads this)
    syncDiamondExtension(material)
    // 2. Set DiamondMaterial-supported properties directly on the shader
    try {
        if ('color' in material) material.color = createLinearColor(diamondProfile.color)
        if ('envMapIntensity' in material) material.envMapIntensity = diamondProfile.envMapIntensity
        if ('dispersion' in material) material.dispersion = diamondProfile.dispersion
        if ('absorptionFactor' in material) material.absorptionFactor = diamondProfile.absorptionFactor
        if ('refractiveIndex' in material) material.refractiveIndex = diamondProfile.refractiveIndex
        if ('squashFactor' in material) material.squashFactor = diamondProfile.squashFactor
        if ('geometryFactor' in material) material.geometryFactor = diamondProfile.geometryFactor
        if ('gammaFactor' in material) material.gammaFactor = diamondProfile.gammaFactor
        if ('transmission' in material) material.transmission = diamondProfile.transmission
        if ('reflectivity' in material) material.reflectivity = diamondProfile.reflectivity
        if ('rayBounces' in material) material.rayBounces = diamondProfile.rayBounces
        if ('diamondOrientedEnvMap' in material) material.diamondOrientedEnvMap = diamondProfile.diamondOrientedEnvMap
        if ('boostFactors' in material) {
            const b = diamondProfile.boostFactors
            material.boostFactors.set(b[0], b[1], b[2])
        }
        // Apply gamma + boost via color multiplication
        if ('color' in material && material.color) {
            const g = diamondProfile.gammaFactor
            const [r, gb, b] = diamondProfile.boostFactors
            material.color.multiplyScalar(Math.pow(2, g - 1))
            material.color.r *= r; material.color.g *= gb; material.color.b *= b
        }
        material.needsUpdate = true
    } catch (error) {
        console.warn('applyDiamondMaterial failed', error)
    }
}

function applyMetalMaterial(material: any) {
    if (!material) return
    try {
        if ('color' in material) material.color = createLinearColor(metalProfile.color)
        if ('metalness' in material) material.metalness = metalProfile.metalness
        if ('roughness' in material) material.roughness = metalProfile.roughness
        if ('envMapIntensity' in material) material.envMapIntensity = metalProfile.envMapIntensity
        if ('clearcoat' in material) material.clearcoat = Math.max(material.clearcoat || 0, 0.15)
        if ('clearcoatRoughness' in material) material.clearcoatRoughness = 0.08
        if ('specularIntensity' in material) material.specularIntensity = 1.0
        material.needsUpdate = true
    } catch (error) {
        console.warn('applyMetalMaterial failed', error)
    }
}

function isLikelyDiamondMesh(mesh: any) {
    const materialName = Array.isArray(mesh?.material)
        ? mesh.material.map((m: any) => m?.name || '').join(' ')
        : mesh?.material?.name || ''
    const meshName = `${mesh?.name || ''} ${materialName}`
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
        if (mat?.extensions?.WEBGI_materials_diamond) return true
    }
    const lower = meshName.toLowerCase()
    if (/\b(prong|band|shank|bezel)\b/i.test(lower) && !DIAMOND_NAME_REGEX.test(lower)) return false
    if (DIAMOND_NAME_REGEX.test(meshName)) return true
    const geometry = mesh?.geometry
    if (!geometry) return false
    try {
        if (!geometry.boundingSphere && typeof geometry.computeBoundingSphere === 'function') geometry.computeBoundingSphere()
        const radius = geometry.boundingSphere?.radius
        if (typeof radius === 'number' && radius > 0.008 && radius < 0.15) {
            const bbox = geometry.boundingBox || (geometry.computeBoundingBox?.(), geometry.boundingBox) || new Box3()
            const dims = bbox.getSize(new Vector3())
            const ar = Math.max(dims.x, dims.y, dims.z) / (Math.min(dims.x, dims.y, dims.z) || 0.001)
            if (ar < 3.5) return true
        }
    } catch { }
    for (const mat of mats) {
        if (!mat) continue
        if (mat.transmission !== undefined && mat.transmission > 0.5) return true
        if (mat.ior !== undefined && mat.ior > 1.8) return true
    }
    return false
}

function computeRingBounds(root: any): Box3 {
    const box = new Box3()
    if (!root) return box
    if (typeof root.updateWorldMatrix === 'function') {
        box.setFromObject(root)
    } else if (typeof root.traverse === 'function') {
        root.traverse((child: any) => {
            if (!child.geometry) return
            const geom = child.geometry
            if (!geom.boundingBox && typeof geom.computeBoundingBox === 'function') geom.computeBoundingBox()
            if (geom.boundingBox) {
                box.min.min(geom.boundingBox.min)
                box.max.max(geom.boundingBox.max)
            }
        })
    } else if (root.geometry?.boundingBox) {
        box.copy(root.geometry.boundingBox)
    }
    return box
}

function computeRingFitMetrics() {
    if (!ringModel) return
    ringModel.position.set(0, 0, 0); ringModel.rotation.order = 'YXZ'
    ringModel.rotation.x = -0.05; ringModel.rotation.y = 0; ringModel.rotation.z = 0
    const box = computeRingBounds(ringModel)
    if (box.isEmpty()) return
    box.getCenter(ringFitCenter); box.getSize(ringFitSize)
    const maxDim = Math.max(ringFitSize.x, ringFitSize.y, ringFitSize.z, 0.001)
    const zf = 2.5
    activeCameraDistance = maxDim * zf; viewerMinDistance = maxDim * 1.5; viewerMaxDistance = maxDim * 5.0
}

function frameRingInViewer() {
    if (!viewer || !ringModel) return
    const cam = viewer.scene.activeCamera; if (!cam) return
    ringModel.position.set(-ringFitCenter.x, -ringFitCenter.y, -ringFitCenter.z)
    ringModel.rotation.order = 'YXZ'; ringModel.rotation.x = rotationX; ringModel.rotation.y = rotationY; ringModel.rotation.z = rotationZ
    ringModel.updateMatrixWorld?.(true)
    cam.position.set(0, 0, activeCameraDistance); cam.target?.set?.(0, 0, 0); cam.positionUpdated?.(false)
    viewer.setDirty()
}

function applyMaterialProfileToScene(scene: any): { diamondMeshes: number; metalMeshes: number } {
    const stats = { diamondMeshes: 0, metalMeshes: 0 }
    scene.traverse((obj: any) => {
        if (!obj?.isMesh || !obj.material || obj === shadowFloor) return
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        const isDiamond = isLikelyDiamondMesh(obj)
        for (const m of mats) { if (isDiamond) applyDiamondMaterial(m); else applyMetalMaterial(m) }
        if (isDiamond) stats.diamondMeshes++; else stats.metalMeshes++
    })
    return stats
}

function refreshActiveMaterials() {
    if (!viewer || !modelLoaded) return
    const stats = applyMaterialProfileToScene(viewer.scene)
    if (diamondPluginInstance) {
        const dp = diamondPluginInstance as any
        if (typeof dp.refreshEnvMaps === 'function') dp.refreshEnvMaps()
    }
    viewer.renderer.refreshPipeline()
    viewer.setDirty()
    const el = document.getElementById('diamond-mesh-count-value')
    if (el) el.textContent = `${stats.diamondMeshes}`
    setStatus(`Updated. Diamonds: ${stats.diamondMeshes}, metal: ${stats.metalMeshes}.`)
}

async function loadEnvironmentMap(manager: any, path?: string) {
    try {
        const env = await manager.importer.importSinglePath(path || DEFAULT_ENVIRONMENT_PATH)
        if (env && env.assetType === 'texture') {
            ;(env as any).intensity = environmentIntensityValue
            await viewer.scene.setEnvironment(env)
            if (diamondPluginInstance) {
                diamondPluginInstance.envMap = env
                diamondPluginInstance.forceSceneEnvMap = false
                if (typeof diamondPluginInstance.refreshEnvMaps === 'function') diamondPluginInstance.refreshEnvMaps()
            }
            currentEnvironment = env
            viewer.renderer.refreshPipeline(); viewer.setDirty()
            return env
        }
    } catch (e) { console.warn('Environment load failed', e) }
    return null
}

async function loadAndSetBackgroundImage(manager: any, path?: string) {
    try {
        const tex = await manager.importer.importSinglePath(path || DEFAULT_BACKGROUND_IMAGE)
        if (tex && tex.assetType === 'texture') { tex.wrapS = 1000; tex.wrapT = 1000; backgroundTexture = tex; viewer.scene.background = tex; return true }
    } catch { }
    return false
}

async function loadHdrEnvironment(hdrFile: File) {
    if (!viewer) return null
    try {
        setStatus(`Loading HDR: ${hdrFile.name}...`)
        const manager = (viewer.getPlugin && viewer.getPlugin(AssetManagerPlugin)) || null
        if (!manager) throw new Error('AssetManagerPlugin not available')
        const url = URL.createObjectURL(hdrFile)
        const texture = await manager.importer.importSinglePath(url)
        URL.revokeObjectURL(url)
        if (!texture || texture.assetType !== 'texture') throw new Error('importSinglePath did not return a texture')
        ;(texture as any).intensity = environmentIntensityValue
        texture.name = hdrFile.name
        await viewer.scene.setEnvironment(texture)
        if (diamondPluginInstance) {
            diamondPluginInstance.envMap = texture
            diamondPluginInstance.forceSceneEnvMap = true
            if (typeof diamondPluginInstance.refreshEnvMaps === 'function') diamondPluginInstance.refreshEnvMaps()
        }
        currentEnvironment = texture
        viewer.renderer.refreshPipeline()
        viewer.setDirty()
        if (progressivePlugin && typeof progressivePlugin.reset === 'function') progressivePlugin.reset()
        setStatus(`Environment loaded: ${hdrFile.name}`)
        return texture
    } catch (e) { console.warn('HDR load failed:', e); setStatus('Failed to load HDR.', true) }
    return null
}

async function loadHdrFromPath(path: string) {
    if (!viewer) return null
    try {
        setStatus(`Loading HDR from ${path}...`)
        const manager = (viewer.getPlugin && viewer.getPlugin(AssetManagerPlugin)) || null
        if (!manager) throw new Error('AssetManagerPlugin not available')
        const env = await manager.importer.importSinglePath(path)
        if (env && env.assetType === 'texture') {
            ;(env as any).intensity = environmentIntensityValue
            await viewer.scene.setEnvironment(env)
            if (diamondPluginInstance) {
                diamondPluginInstance.envMap = env
                diamondPluginInstance.forceSceneEnvMap = false
                if (typeof diamondPluginInstance.refreshEnvMaps === 'function') diamondPluginInstance.refreshEnvMaps()
            }
            currentEnvironment = env
            viewer.renderer.refreshPipeline()
            viewer.setDirty()
            if (progressivePlugin && typeof progressivePlugin.reset === 'function') progressivePlugin.reset()
            setStatus(`Environment loaded: ${path}`)
            return env
        }
        throw new Error('importSinglePath did not return a texture')
    } catch (e) { console.warn('HDR path load failed:', e); setStatus('Failed to load HDR from path.', true) }
    return null
}

async function loadRingSource(source: string | File) {
    if (!ijewelViewer) throw new Error('IJewelViewer not initialized')
    const loader = document.getElementById('loader') as HTMLElement
    modelLoaded = false; loader.classList.remove('hidden')
    setLoaderMessage(source instanceof File ? `Preparing ${source.name}...` : 'Loading model...')
    try {
        clearFrontendError()
        const wasEnabled = viewer.enabled; viewer.enabled = false

        // Let IjewelViewer handle model loading, materials, and shadow floor
        if (source instanceof File) {
            await ijewelViewer.loadFile(source)
            markSelectedFile(source)
        } else {
            await ijewelViewer.loadModel(source)
            markSelectedFile(null)
        }

        ringModel = ijewelViewer.getRingModel()
        diamondPlacement = ijewelViewer.getDiamondPlacement()!
        if (diamondPlacement) diamondPlacement.setRingModel(ringModel)

        if (!ringModel) throw new Error('No ring model found after loading')

        // Apply rotation from global state
        ringModel.rotation.order = 'YXZ'
        ringModel.rotation.x = rotationX
        ringModel.rotation.y = rotationY
        ringModel.rotation.z = rotationZ
        ringModel.updateMatrixWorld?.(true)

        computeRingFitMetrics()
        frameRingInViewer()

        // Background
        const manager = viewer.getPlugin?.(AssetManagerPlugin) || null
        const bgUseImage = document.getElementById('bg-use-image') as HTMLInputElement | null
        const bgColorInput = document.getElementById('bg-color') as HTMLInputElement | null
        const bgUrlInput = document.getElementById('bg-image-url') as HTMLInputElement | null
        const backgroundUrl = bgUrlInput?.value || ''
        if (bgUseImage?.checked && backgroundUrl && manager) {
            try {
                const tex: any = await manager.importer.importSinglePath(backgroundUrl)
                if (tex && tex.assetType === 'texture') { tex.wrapS = 1000; tex.wrapT = 1000; viewer.scene.background = tex }
            } catch {
                viewer.scene.setBackground(new Color(bgColorInput?.value || DEFAULT_BACKGROUND_COLOR).convertSRGBToLinear())
            }
        } else if (bgUseImage?.checked) { await loadAndSetBackgroundImage(manager) }
        else { viewer.scene.setBackground(new Color(bgColorInput?.value || DEFAULT_BACKGROUND_COLOR).convertSRGBToLinear()) }

        modelLoaded = true; viewer.enabled = wasEnabled !== false
        refreshActiveMaterials()
        if (progressivePlugin && typeof progressivePlugin.reset === 'function') progressivePlugin.reset()
        viewer.renderer.refreshPipeline(); viewer.setDirty(); loader.classList.add('hidden')
        const ln = source instanceof File ? source.name : (source.split('/').pop() || 'main.glb')
        const fn = document.getElementById('file-name') as HTMLElement | null; if (fn) fn.textContent = `Model: ${ln}`
        if (source instanceof File) selectedFile = null
        setStatus(`Loaded. Model: ${ln}`)
    } catch (error) {
        console.error('loadRingSource error:', error); viewer.enabled = true; loader.classList.add('hidden')
        setStatus('Model loading failed.', true); setFrontendError('Model loading failed.', error); throw error
    }
}

const QUALITY_PRESETS: Record<string, { label: string; width: number; height: number }> = {
    low: { label: 'Low', width: 1280, height: 720 }, medium: { label: 'Medium', width: 1920, height: 1080 },
    high: { label: 'High', width: 3840, height: 2160 }, ultra: { label: 'Ultra', width: 7680, height: 4320 },
}
const BATCH_ANGLES: Record<string, { label: string; x: number; y: number; z: number; camAz: number; camPol: number }> = {
    front: { label: 'Front', x: -2.9, y: 0, z: 0, camAz: 0, camPol: 90 },
    'threequarter-left': { label: '3-4-Left', x: -2.9, y: 45, z: 0, camAz: 0, camPol: 90 },
    side: { label: 'Side', x: -2.9, y: 90, z: 0, camAz: 0, camPol: 90 },
    'threequarter-right': { label: '3-4-Right', x: -2.9, y: -45, z: 0, camAz: 0, camPol: 90 },
    back: { label: 'Back', x: -2.9, y: 180, z: 0, camAz: 0, camPol: 90 },
    top: { label: 'Top', x: -60, y: 0, z: 0, camAz: 0, camPol: 90 },
    bottom: { label: 'Bottom', x: 60, y: 0, z: 0, camAz: 0, camPol: 90 },
}

interface CapturedImage { modelName: string; angleLabel: string; blob: Blob }
let batchFiles: File[] = []
let capturedImages: CapturedImage[] = []
let isBatchRunning = false
let customAngles: { label: string; x: number; y: number; z: number; camAz: number; camPol: number }[] = []

function getThreeRenderer() { return (viewer?.renderer as any)?.rendererObject as any | null }
function downloadBlob(blob: Blob, filename: string) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href)
}

function updateBatchFileList() {
    const list = document.getElementById('batch-file-list'); if (!list) return
    if (batchFiles.length === 0) { list.textContent = 'No files added yet.'; return }
    list.innerHTML = batchFiles.map((f, i) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;"><span>${f.name}</span><button data-index="${i}" style="background:none;border:none;color:#a12d2d;cursor:pointer;font-size:14px;line-height:1;">✕</button></div>`
    ).join('')
    list.querySelectorAll('[data-index]').forEach(b => {
        b.addEventListener('click', () => { batchFiles.splice(parseInt((b as HTMLElement).dataset.index || '0', 10), 1); updateBatchFileList() })
    })
}
function setBatchProgress(msg: string, isError = false) {
    const el = document.getElementById('batch-progress'); if (!el) return; el.textContent = msg; el.style.color = isError ? '#a12d2d' : '#6f5c4a'
}
function getSelectedAngles() {
    const checks = document.querySelectorAll('#angle-list input[type=checkbox]:checked')
    return [...Array.from(checks).map(c => BATCH_ANGLES[(c as HTMLInputElement).value]).filter(Boolean), ...customAngles]
}
function updateCustomAngleList() {
    const list = document.getElementById('custom-angle-list'); if (!list) return
    if (customAngles.length === 0) { list.textContent = ''; return }
    list.innerHTML = customAngles.map((a, i) =>
        `<span style="display:inline-block;background:var(--surface);border:1px solid rgba(74,57,39,0.12);border-radius:6px;padding:2px 8px;margin:2px;font-size:11px;">R${a.x.toFixed(1)}°/${a.y.toFixed(1)}°/${a.z.toFixed(1)}° C${a.camAz.toFixed(1)}°/${a.camPol.toFixed(1)}°<button data-ci="${i}" style="background:none;border:none;color:#a12d2d;cursor:pointer;font-size:12px;padding:0 2px;">✕</button></span>`
    ).join('')
    list.querySelectorAll('[data-ci]').forEach(b => {
        b.addEventListener('click', () => { customAngles.splice(parseInt((b as HTMLElement).dataset.ci || '0', 10), 1); updateCustomAngleList() })
    })
}

async function captureHighResBlob(qualityPR: number): Promise<Blob | null> {
    const r = getThreeRenderer(); if (!r) return null
    const canvas = r.domElement; const origPR = r.getPixelRatio(); const wr = viewer.renderer as any
    r.setPixelRatio(qualityPR); wr.displayCanvasScaling = qualityPR; wr.refreshPipeline?.(); viewer.setDirty()
    await new Promise<void>(r => requestAnimationFrame(() => r()))
    await new Promise<void>(r => requestAnimationFrame(() => r()))
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
    r.setPixelRatio(origPR); wr.displayCanvasScaling = origPR; wr.refreshPipeline?.(); viewer.setDirty()
    return blob
}

async function startBatchCapture() {
    if (!viewer || isBatchRunning) return
    const quality = QUALITY_PRESETS[(document.getElementById('capture-quality') as HTMLSelectElement)?.value || 'medium']
    const angles = getSelectedAngles()
    if (batchFiles.length === 0) { setBatchProgress('Add at least one GLB file first.', true); return }
    if (angles.length === 0) { setBatchProgress('Select at least one angle.', true); return }
    isBatchRunning = true; capturedImages = []
    const startBtn = document.getElementById('batch-start') as HTMLButtonElement; const zipBtn = document.getElementById('batch-download-zip') as HTMLButtonElement
    if (startBtn) startBtn.disabled = true; if (zipBtn) zipBtn.style.display = 'none'
    const r = getThreeRenderer(); if (!r) { isBatchRunning = false; return }
    const canvas = r.domElement; const cssW = canvas.clientWidth || 1; const cssH = canvas.clientHeight || 1
    const pr = Math.ceil(Math.max(quality.width / cssW, quality.height / cssH))
    let completed = 0; const total = batchFiles.length * angles.length
    for (const file of batchFiles) {
        setBatchProgress(`Loading ${file.name}...`)
        try { await loadRingSource(file); await new Promise<void>(r => requestAnimationFrame(() => r())); await new Promise<void>(r => requestAnimationFrame(() => r())) }
        catch { setBatchProgress(`Failed to load ${file.name}`, true); continue }
        for (const angle of angles) {
            rotationX = angle.x * Math.PI / 180; rotationY = angle.y * Math.PI / 180; rotationZ = angle.z * Math.PI / 180
            if (ringModel) { ringModel.rotation.x = rotationX; ringModel.rotation.y = rotationY; ringModel.rotation.z = rotationZ; ringModel.updateMatrixWorld?.(true) }
            const cam = viewer.scene.activeCamera; const ctrl = (cam as any)?.controls
            if (ctrl && typeof ctrl.setAzimuthalAngle === 'function') { ctrl.setAzimuthalAngle(angle.camAz * Math.PI / 180); ctrl.setPolarAngle(angle.camPol * Math.PI / 180) }
            viewer.setDirty()
            await new Promise<void>(r => requestAnimationFrame(() => r())); await new Promise<void>(r => requestAnimationFrame(() => r()))
            const blob = await captureHighResBlob(pr)
            if (blob) capturedImages.push({ modelName: file.name.replace(/\.glb$/i, ''), angleLabel: angle.label, blob })
            completed++; setBatchProgress(`${completed}/${total} captures (${Math.round((completed / total) * 100)}%)`)
        }
    }
    isBatchRunning = false; if (startBtn) startBtn.disabled = false
    if (capturedImages.length > 0) { if (zipBtn) zipBtn.style.display = 'block'; setBatchProgress(`Done! ${capturedImages.length} images captured.`) }
    else { setBatchProgress('No images were captured.', true) }
}

async function downloadAllAsZip() {
    if (capturedImages.length === 0) return
    setBatchProgress('Creating ZIP...')
    const zip = new JSZip(); const folders = new Map<string, any>()
    for (const img of capturedImages) {
        if (!folders.has(img.modelName)) folders.set(img.modelName, zip.folder(img.modelName))
        const f = folders.get(img.modelName); if (f) f.file(`${img.angleLabel}.png`, img.blob)
    }
    const content = await zip.generateAsync({ type: 'blob' }); downloadBlob(content, `batch-capture-${Date.now()}.zip`)
    setBatchProgress(`ZIP downloaded (${(content.size / 1024 / 1024).toFixed(1)} MB)`)
}

function bindInput(id: string, onChange: (value: string) => string) {
    const input = document.getElementById(id) as HTMLInputElement | null
    const output = document.getElementById(`${id}-value`) as HTMLElement | null
    if (!input || !output) return
    const sync = () => { output.textContent = onChange(input.value); refreshActiveMaterials() }
    input.addEventListener('input', sync); sync()
}

function applyMetalPreset(key: string) {
    const p = METAL_PRESETS[key]; if (!p) return
    metalProfile.color = p.color; metalProfile.metalness = p.metalness; metalProfile.roughness = p.roughness; metalProfile.envMapIntensity = p.envMapIntensity
    ;(document.getElementById('metal-color') as HTMLInputElement).value = p.color
    ;(document.getElementById('metalness') as HTMLInputElement).value = String(p.metalness)
    ;(document.getElementById('metal-roughness') as HTMLInputElement).value = String(p.roughness)
    ;(document.getElementById('metal-env-intensity') as HTMLInputElement).value = String(p.envMapIntensity)
    ;(document.getElementById('metalness-value') as HTMLElement).textContent = p.metalness.toFixed(2)
    ;(document.getElementById('metal-roughness-value') as HTMLElement).textContent = p.roughness.toFixed(2)
    ;(document.getElementById('metal-env-intensity-value') as HTMLElement).textContent = p.envMapIntensity.toFixed(2)
    ;(document.getElementById('metal-color-value') as HTMLElement).textContent = p.color
    refreshActiveMaterials(); setStatus(`Metal: ${p.label}`)
}

function applyGemstonePreset(key: string) {
    const p = GEMSTONE_PRESETS[key]; if (!p) return
    diamondProfile.color = p.color
    ;(document.getElementById('diamond-color') as HTMLInputElement).value = p.color
    ;(document.getElementById('diamond-color-value') as HTMLElement).textContent = p.color
    refreshActiveMaterials(); setStatus(`Gemstone: ${p.label}`)
}

function applyDiamondCutPreset(key: string) {
    const p = DIAMOND_CUT_PRESETS[key]; if (!p) return
    diamondProfile.dispersion = p.dispersion; diamondProfile.refractiveIndex = p.refractiveIndex
    diamondProfile.absorptionFactor = p.absorptionFactor; diamondProfile.gammaFactor = p.gammaFactor
    ;(document.getElementById('diamond-dispersion') as HTMLInputElement).value = String(p.dispersion)
    ;(document.getElementById('diamond-refractive-index') as HTMLInputElement).value = String(p.refractiveIndex)
    ;(document.getElementById('diamond-absorption-factor') as HTMLInputElement).value = String(p.absorptionFactor)
    ;(document.getElementById('diamond-gamma-factor') as HTMLInputElement).value = String(p.gammaFactor)
    ;(document.getElementById('diamond-dispersion-value') as HTMLElement).textContent = p.dispersion.toFixed(4)
    ;(document.getElementById('diamond-refractive-index-value') as HTMLElement).textContent = p.refractiveIndex.toFixed(2)
    ;(document.getElementById('diamond-absorption-factor-value') as HTMLElement).textContent = p.absorptionFactor.toFixed(2)
    ;(document.getElementById('diamond-gamma-factor-value') as HTMLElement).textContent = p.gammaFactor.toFixed(2)
    refreshActiveMaterials(); setStatus(`Cut: ${p.label}`)
}

async function applyScenePreset(key: string) {
    const p = SCENE_PRESETS[key]; if (!p) return
    try {
        const manager = (viewer.getPlugin && viewer.getPlugin(AssetManagerPlugin)) || null
        if (manager) { setStatus(`Loading scene: ${p.label}...`); await loadEnvironmentMap(manager, p.env) }
        ;(document.getElementById('bg-color') as HTMLInputElement).value = p.bgColor
        ;(document.getElementById('bg-color-value') as HTMLElement).textContent = p.bgColor
        viewer.scene.setBackground(new Color(p.bgColor).convertSRGBToLinear())
        environmentIntensityValue = p.envIntensity
        if (currentEnvironment) (currentEnvironment as any).intensity = p.envIntensity
        if (diamondPluginInstance && typeof diamondPluginInstance.refreshEnvMaps === 'function') diamondPluginInstance.refreshEnvMaps()
        if (progressivePlugin && typeof progressivePlugin.reset === 'function') progressivePlugin.reset()
        viewer.setDirty(); setStatus(`Scene: ${p.label}`)
    } catch { console.warn('Scene preset failed') }
}

function setupConfigurator() {
    markSelectedFile(null)

    bindInput('metal-color', v => { metalProfile.color = v; return v })
    bindInput('metalness', v => { metalProfile.metalness = Number(v); return Number(v).toFixed(2) })
    bindInput('metal-roughness', v => { metalProfile.roughness = Number(v); return Number(v).toFixed(2) })
    bindInput('metal-env-intensity', v => { metalProfile.envMapIntensity = Number(v); return Number(v).toFixed(2) })

    // Diamond controls — only DiamondMaterial-supported properties
    bindInput('diamond-color', v => { diamondProfile.color = v; return v })
    bindInput('diamond-env-intensity', v => { diamondProfile.envMapIntensity = Number(v); return Number(v).toFixed(2) })
    bindInput('diamond-env-rotation', v => { diamondProfile.envMapRotation = Number(v); return Number(v).toFixed(2) })
    bindInput('diamond-dispersion', v => { diamondProfile.dispersion = Number(v); return Number(v).toFixed(4) })
    bindInput('diamond-absorption-factor', v => { diamondProfile.absorptionFactor = Number(v); return Number(v).toFixed(2) })
    bindInput('diamond-refractive-index', v => { diamondProfile.refractiveIndex = Number(v); return Number(v).toFixed(2) })
    bindInput('diamond-gamma-factor', v => { diamondProfile.gammaFactor = Number(v); return Number(v).toFixed(2) })
    bindInput('diamond-squash-factor', v => { diamondProfile.squashFactor = Number(v); return Number(v).toFixed(2) })
    bindInput('diamond-geometry-factor', v => { diamondProfile.geometryFactor = Number(v); return Number(v).toFixed(2) })
    bindInput('diamond-boost-r', v => {
        diamondProfile.boostFactors[0] = Number(v)
        const el = document.getElementById('diamond-boost-value')
        if (el) el.textContent = `${diamondProfile.boostFactors[0].toFixed(2)}, ${diamondProfile.boostFactors[1].toFixed(2)}, ${diamondProfile.boostFactors[2].toFixed(2)}`
        return Number(v).toFixed(2)
    })
    bindInput('diamond-boost-g', v => {
        diamondProfile.boostFactors[1] = Number(v)
        const el = document.getElementById('diamond-boost-value')
        if (el) el.textContent = `${diamondProfile.boostFactors[0].toFixed(2)}, ${diamondProfile.boostFactors[1].toFixed(2)}, ${diamondProfile.boostFactors[2].toFixed(2)}`
        return Number(v).toFixed(2)
    })
    bindInput('diamond-boost-b', v => {
        diamondProfile.boostFactors[2] = Number(v)
        const el = document.getElementById('diamond-boost-value')
        if (el) el.textContent = `${diamondProfile.boostFactors[0].toFixed(2)}, ${diamondProfile.boostFactors[1].toFixed(2)}, ${diamondProfile.boostFactors[2].toFixed(2)}`
        return Number(v).toFixed(2)
    })
    bindInput('diamond-transmission', v => { diamondProfile.transmission = Number(v); return Number(v).toFixed(2) })
    bindInput('diamond-reflectivity', v => { diamondProfile.reflectivity = Number(v); return Number(v).toFixed(2) })
    bindInput('diamond-ray-bounces', v => { diamondProfile.rayBounces = Number(v); return String(Number(v)) })
    bindInput('diamond-oriented-envmap', v => { diamondProfile.diamondOrientedEnvMap = Number(v); return String(Number(v)) })

    bindInput('bg-color', v => { if (viewer) { viewer.scene.setBackground(new Color(v).convertSRGBToLinear()); viewer.setDirty() }; return v })
    bindInput('surface-color', v => {
        if (shadowFloor?.material) { shadowFloor.material.color.copy(new Color(v).convertSRGBToLinear()); shadowFloor.material.needsUpdate = true; viewer?.setDirty() }
        return v
    })
    bindInput('surface-roughness', v => {
        if (shadowFloor?.material) { shadowFloor.material.opacity = Number(v); shadowFloor.material.needsUpdate = true; viewer?.setDirty() }
        return Number(v).toFixed(2)
    })
    bindInput('exposure', v => {
        if (tonemapPlugin) tonemapPlugin.exposure = Number(v)
        viewer?.setDirty(); return Number(v).toFixed(2)
    })
    bindInput('contrast', v => {
        if (tonemapPlugin) tonemapPlugin.contrast = Number(v)
        viewer?.setDirty(); return Number(v).toFixed(2)
    })
    bindInput('saturation', v => {
        if (tonemapPlugin) tonemapPlugin.saturation = Number(v)
        viewer?.setDirty(); return Number(v).toFixed(2)
    })
    bindInput('fov', v => {
        const cam = viewer.scene.activeCamera; if (cam) cam.setCameraOptions?.({ fov: Number(v) })
        viewer?.setDirty(); return `${Number(v)}°`
    })
    bindInput('hdr-intensity', v => {
        hdrIntensity = Number(v); environmentIntensityValue = hdrIntensity
        if (currentEnvironment) (currentEnvironment as any).intensity = hdrIntensity
        viewer?.setDirty(); return Number(v).toFixed(2)
    })
    bindInput('hdr-rotation', v => {
        hdrRotation = Number(v)
        if (currentEnvironment) (currentEnvironment as any).rotation = (hdrRotation * Math.PI) / 180
        viewer?.setDirty(); return `${Number(v).toFixed(0)}°`
    })

    // Horizontal alignment
    const horiz = document.getElementById('align-horizontal') as HTMLInputElement | null
    const horizV = document.getElementById('align-horizontal-value') as HTMLElement | null
    if (horiz && horizV) {
        const upd = () => { const d = Number(horiz.value); horizV.textContent = `${d}°`; rotationY = d * (Math.PI / 180); viewer?.setDirty() }
        horiz.addEventListener('input', upd); upd()
    }
    const vert = document.getElementById('align-vertical') as HTMLInputElement | null
    const vertV = document.getElementById('align-vertical-value') as HTMLElement | null
    if (vert && vertV) {
        const upd = () => { const d = Number(vert.value); vertV.textContent = `${d}°`; rotationX = d * (Math.PI / 180); viewer?.setDirty() }
        vert.addEventListener('input', upd); upd()
    }
    const roll = document.getElementById('align-roll') as HTMLInputElement | null
    const rollV = document.getElementById('align-roll-value') as HTMLElement | null
    if (roll && rollV) {
        const upd = () => { const d = Number(roll.value); rollV.textContent = `${d}°`; rotationZ = d * (Math.PI / 180); viewer?.setDirty() }
        roll.addEventListener('input', upd); upd()
    }

    // GLB upload
    const fileInput = document.getElementById('glb-input') as HTMLInputElement | null
    const dropzone = document.getElementById('dropzone') as HTMLElement | null
    const startBtn = document.getElementById('start-viewer') as HTMLButtonElement | null
    const acceptFile = (f: File | null) => { if (!f) return; const name = f.name.toLowerCase(); if (!name.endsWith('.glb') && !name.endsWith('.3dm')) { setStatus('Please choose a .glb or .3dm file.', true); return }; markSelectedFile(f) }
    fileInput?.addEventListener('change', () => acceptFile(fileInput.files?.[0] || null))
    dropzone?.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover') })
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'))
    dropzone?.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('dragover'); acceptFile(e.dataTransfer?.files?.[0] || null) })
    startBtn?.addEventListener('click', async () => {
        if (!viewer || !selectedFile) { setStatus('Choose a .glb first.'); return }
        startBtn.disabled = true
        const willPatch = (document.getElementById('patch-diamond') as HTMLInputElement)?.checked !== false
        setStatus(willPatch ? 'Patching & loading...' : 'Loading...')
        try { await loadRingSource(selectedFile) } catch (e) { setStatus('Failed.', true); setFrontendError('Failed.', e) } finally { startBtn.disabled = false }
    })

    // HDR upload
    const hdrInput = document.getElementById('hdr-input') as HTMLInputElement | null
    const hdrDrop = document.getElementById('hdr-dropzone') as HTMLElement | null
    const acceptHdr = (f: File | null) => {
        if (!f) return; const ok = f.name.toLowerCase().endsWith('.hdr') || f.name.toLowerCase().endsWith('.exr')
        if (!ok) { setStatus('Please choose .hdr or .exr.', true); return }
        selectedHdrFile = f; const el = document.getElementById('hdr-file-name') as HTMLElement | null; if (el) el.textContent = f.name
    }
    const loadHdr = async () => { if (!selectedHdrFile) { setStatus('Choose an HDR first.', true); return }; try { await loadHdrEnvironment(selectedHdrFile) } catch { setStatus('HDR load failed.', true) } }
    hdrInput?.addEventListener('change', () => { acceptHdr(hdrInput.files?.[0] || null); loadHdr() })
    hdrDrop?.addEventListener('dragover', e => { e.preventDefault(); hdrDrop.classList.add('dragover') })
    hdrDrop?.addEventListener('dragleave', () => hdrDrop.classList.remove('dragover'))
    hdrDrop?.addEventListener('drop', e => { e.preventDefault(); hdrDrop.classList.remove('dragover'); const f = e.dataTransfer?.files?.[0] || null; acceptHdr(f); if (f) loadHdr() })

    // HDR URL / Path input
    const hdrUrlInput = document.getElementById('hdr-url') as HTMLInputElement | null
    const loadHdrUrlBtn = document.getElementById('load-hdr-url') as HTMLButtonElement | null
    loadHdrUrlBtn?.addEventListener('click', () => {
        const url = hdrUrlInput?.value.trim()
        if (!url) { setStatus('Enter an HDR URL or path.', true); return }
        loadHdrFromPath(url)
    })
    hdrUrlInput?.addEventListener('keydown', e => { if (e.key === 'Enter') loadHdrUrlBtn?.click() })

    // Metal / Gem / Cut presets
    const metalSel = document.getElementById('metal-preset') as HTMLSelectElement | null
    metalSel?.addEventListener('change', () => { if (metalSel.value) applyMetalPreset(metalSel.value) })
    const gemSel = document.getElementById('gemstone-preset') as HTMLSelectElement | null
    gemSel?.addEventListener('change', () => { if (gemSel.value) applyGemstonePreset(gemSel.value) })
    const cutSel = document.getElementById('cut-preset') as HTMLSelectElement | null
    cutSel?.addEventListener('change', () => { if (cutSel.value) applyDiamondCutPreset(cutSel.value) })
    const sceneSel = document.getElementById('scene-preset') as HTMLSelectElement | null
    sceneSel?.addEventListener('change', () => { if (sceneSel.value) applyScenePreset(sceneSel.value) })

    // Batch
    const batchInput = document.getElementById('batch-glb-input') as HTMLInputElement | null
    const batchDrop = document.getElementById('batch-dropzone') as HTMLElement | null
    const acceptBatch = (files: FileList | null) => {
        if (!files) return
        for (const f of Array.from(files)) {
            const nm = f.name.toLowerCase(); if ((nm.endsWith('.glb') || nm.endsWith('.3dm')) && !batchFiles.some(ex => ex.name === f.name && ex.size === f.size)) batchFiles.push(f)
        }
        updateBatchFileList()
    }
    batchInput?.addEventListener('change', () => acceptBatch(batchInput.files))
    batchInput?.addEventListener('click', () => { batchInput.value = '' })
    batchDrop?.addEventListener('dragover', e => { e.preventDefault(); batchDrop.classList.add('dragover') })
    batchDrop?.addEventListener('dragleave', () => batchDrop.classList.remove('dragover'))
    batchDrop?.addEventListener('drop', e => { e.preventDefault(); batchDrop.classList.remove('dragover'); acceptBatch(e.dataTransfer?.files || null) })
    document.getElementById('batch-start')?.addEventListener('click', startBatchCapture)
    document.getElementById('batch-download-zip')?.addEventListener('click', downloadAllAsZip)
    document.getElementById('add-current-angle')?.addEventListener('click', () => {
        const x = rotationX * 180 / Math.PI; const y = ((rotationY * 180 / Math.PI) % 360); const z = rotationZ * 180 / Math.PI
        let ca = 0, cp = 90; const cam = viewer.scene.activeCamera; const ctrl = (cam as any)?.controls
        if (ctrl && typeof ctrl.getAzimuthalAngle === 'function') { ca = ctrl.getAzimuthalAngle() * 180 / Math.PI; cp = ctrl.getPolarAngle() * 180 / Math.PI }
        customAngles.push({ label: `R${x.toFixed(1)}/${y.toFixed(1)}/${z.toFixed(1)} C${ca.toFixed(1)}/${cp.toFixed(1)}`, x, y, z, camAz: ca, camPol: cp })
        updateCustomAngleList()
    })
}

async function setupViewer() {
    const canvas = document.getElementById('webgi-canvas') as HTMLCanvasElement
    const loader = document.getElementById('loader') as HTMLElement
    const container = canvas.parentElement || document.body

    // Use IjewelViewer for core WebGI setup (plugins, renderer, lights)
    ijewelViewer = new IjewelViewer(container, {
        modelUrl: DEFAULT_MODEL_PATH,
        sceneConfig: { Environment: DEFAULT_ENVIRONMENT_PATH },
        metal: { color: metalProfile.color, metalness: metalProfile.metalness, roughness: metalProfile.roughness, envMapIntensity: metalProfile.envMapIntensity },
        diamond: { color: diamondProfile.color, transmission: diamondProfile.transmission, ior: diamondProfile.refractiveIndex, sparkle: diamondProfile.envMapIntensity },
    })
    await ijewelViewer.init()
    viewer = ijewelViewer.getViewerApp()
    viewer.renderer.displayCanvasScaling = Math.min(window.devicePixelRatio, 1)

    // Get plugin references for UI controls
    progressivePlugin = viewer.getPlugin?.(ProgressivePlugin) || null
    tonemapPlugin = viewer.getPlugin?.(TonemapPlugin) || null
    ssaoPlugin = viewer.getPlugin?.(SSAOPlugin) || null
    diamondPluginInstance = viewer.getPlugin?.(DiamondPlugin) || null
    diamondPlacement = new DiamondPlacementSystem(viewer)

    window.addEventListener('error', (e) => { console.error(e.error || e.message); setFrontendError('Runtime error:', e.error || e.message) })
    window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); setFrontendError('Unhandled rejection:', e.reason) })

    const manager = viewer.getPlugin?.(AssetManagerPlugin) || null
    if (manager) await loadEnvironmentMap(manager)

    const camera = viewer.scene.activeCamera
    viewer.scene.setBackground(new Color(DEFAULT_BACKGROUND_COLOR).convertSRGBToLinear())
    camera.near = 0.1; camera.far = 1000
    camera.setCameraOptions?.({ fov: 25 })
    if (camera.controls) {
        const c = camera.controls as any; c.enabled = true; c.autoRotate = false
        c.minPolarAngle = Math.PI / 2 - 0.005; c.maxPolarAngle = Math.PI / 2 + 0.005
        c.minDistance = 6; c.maxDistance = 12; c.enablePan = false; c.screenSpacePanning = false
        c.enableDamping = true; c.dampingFactor = 0.05
    }
    frameRingInViewer()
    setupConfigurator()

    try {
        ;(window as any).loadRingSource = loadRingSource
        ;(window as any).loadRingFromPath = (path: string) => loadRingSource(path)
        ;(window as any).loadHdrFromPath = loadHdrFromPath
        ;(window as any).loadEnvironmentMap = loadEnvironmentMap
        ;(window as any).diamondPlacement = diamondPlacement
        ;(window as any).applyMetalPreset = applyMetalPreset
        ;(window as any).applyGemstonePreset = applyGemstonePreset
        ;(window as any).applyDiamondCutPreset = applyDiamondCutPreset
        ;(window as any).applyScenePreset = applyScenePreset
    } catch { }

    const updateOrientation = () => {
        const dot = document.getElementById('orientation-dot'); const ring = document.getElementById('orientation-ring')
        const val = document.getElementById('orientation-value'); const st = document.getElementById('orientation-status')
        if (!dot || !val || !st || !ring) return
        const td = rotationX * (180 / Math.PI); const ad = Math.abs(td)
        dot.style.top = `${22 - Math.sin(ad) * 18}px`; val.textContent = `${td.toFixed(1)}°`
        const tilt = ad > 1.5; ring.classList.toggle('tilted', tilt); dot.classList.toggle('tilted', tilt); st.classList.toggle('tilted', tilt)
        st.textContent = tilt ? 'Tilted' : 'Horizontal'
    }

    viewer.addEventListener('preFrame', () => {
        if (!modelLoaded || !ringModel) return
        if (!isBatchRunning) rotationX = Math.max(-MAX_TILT, Math.min(MAX_TILT, rotationX))
        ringModel.rotation.order = 'YXZ'; ringModel.rotation.y = rotationY; ringModel.rotation.x = rotationX; ringModel.rotation.z = rotationZ
        ringModel.updateMatrixWorld?.(true); updateOrientation()
        const sx = (rotationX * 180 / Math.PI).toFixed(1); const sy = ((rotationY * 180 / Math.PI) % 360).toFixed(1); const sz = (rotationZ * 180 / Math.PI).toFixed(1)
        const ad = document.getElementById('angle-display')
        if (ad) {
            ad.style.display = 'block'
            const xe = document.getElementById('angle-display-x'); const ye = document.getElementById('angle-display-y'); const ze = document.getElementById('angle-display-z')
            if (xe) xe.textContent = sx; if (ye) ye.textContent = sy; if (ze) ze.textContent = sz
        }
        const cam = viewer.scene.activeCamera; const ctrl = (cam as any)?.controls
        if (ctrl && typeof ctrl.getAzimuthalAngle === 'function') {
            const az = document.getElementById('angle-display-cam-az'); const pol = document.getElementById('angle-display-cam-pol')
            if (az) az.textContent = (ctrl.getAzimuthalAngle() * 180 / Math.PI).toFixed(1)
            if (pol) pol.textContent = (ctrl.getPolarAngle() * 180 / Math.PI).toFixed(1)
        }
        const bx = document.getElementById('bottom-angle-x'); const by = document.getElementById('bottom-angle-y'); const bz = document.getElementById('bottom-angle-z')
        if (bx) bx.textContent = sx; if (by) by.textContent = sy; if (bz) bz.textContent = sz
        try { const r = (viewer.renderer as any).rendererObject; if (r?.shadowMap) r.shadowMap.needsUpdate = true } catch { }
        viewer.setDirty()
    })

    canvas.addEventListener('mousedown', (e) => { isRotating = true; lastX = e.clientX; lastY = e.clientY })
    window.addEventListener('mousemove', (e) => {
        if (!isRotating || !modelLoaded || !ringModel) return
        const dx = e.clientX - lastX; const dy = e.clientY - lastY
        if (e.altKey) { rotationZ += dx * 0.008 } else { rotationY += dx * 0.008; rotationX += dy * 0.006; rotationX = Math.max(-MAX_TILT, Math.min(MAX_TILT, rotationX)) }
        lastX = e.clientX; lastY = e.clientY; viewer.setDirty()
    })
    window.addEventListener('mouseup', () => { isRotating = false })

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 && e.touches.length !== 2) return; isRotating = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY
    }, { passive: true })
    window.addEventListener('touchmove', (e) => {
        if (!isRotating || !modelLoaded || !ringModel) return
        if (e.touches.length === 1) {
            const dx = e.touches[0].clientX - lastX; const dy = e.touches[0].clientY - lastY
            rotationY += dx * 0.008; rotationX += dy * 0.006; rotationX = Math.max(-MAX_TILT, Math.min(MAX_TILT, rotationX))
            lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; viewer.setDirty()
        } else if (e.touches.length === 2) {
            rotationZ += ((e.touches[0].clientX + e.touches[1].clientX) / 2 - lastX) * 0.008
            lastX = (e.touches[0].clientX + e.touches[1].clientX) / 2; viewer.setDirty()
        }
    }, { passive: false })
    window.addEventListener('touchend', () => { isRotating = false })
    window.addEventListener('touchcancel', () => { isRotating = false })

    canvas.addEventListener('wheel', (e) => {
        if (modelLoaded) { e.preventDefault(); const d = e.deltaY > 0 ? 1 : -1; activeCameraDistance = Math.max(viewerMinDistance, Math.min(viewerMaxDistance, activeCameraDistance + d * 0.12)); frameRingInViewer() }
    }, { passive: false })

    window.addEventListener('resize', () => viewer.setDirty())

    await loadRingSource(initialModelPath)
    loader.classList.add('hidden')
    return viewer
}

setupViewer().catch((error) => {
    console.error('Error setting up viewer:', error)
    const loader = document.getElementById('loader') as HTMLElement; loader.classList.remove('hidden')
    setLoaderMessage('Error loading viewer.'); setStatus('Viewer setup failed.', true); setFrontendError('Viewer setup failed.', error)
})
