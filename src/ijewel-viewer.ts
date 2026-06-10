import {
    ViewerApp,
    AssetManagerPlugin,
    GBufferPlugin,
    ProgressivePlugin,
    TonemapPlugin,
    SSAOPlugin,
    FrameFadePlugin,
    TemporalAAPlugin,
    AssetImporter,
    DRACOLoader2,
    Color,
    DiamondPlugin,
    RandomizedDirectionalLightPlugin,
    Mesh,
    Vector3,
    Box3,
    DirectionalLight,
    AmbientLight,
    PlaneGeometry,
    ShadowMaterial,
    EquirectangularReflectionMapping,
    Rhino3dmLoader2,
} from './webgi-re-exports'
import { patchGlbWithDiamondMetadata } from './webgiDiamondPatch'
import { DiamondPlacementSystem } from './anchorDiamondPlacement'
import JSZip from 'jszip'

interface ProjectConfig {
    modelUrl?: string
    basePath?: string
    posterUrl?: string
    logo?: string
    name?: string
    description?: string
    sceneConfig?: { Environment?: string; GemEnvironment?: string; Ground?: string; Background?: string }
    cameraConfig?: { initialZoomPercent?: number; minZoomDistance?: number; maxZoomDistance?: number; verticalOffset?: number }
    materialConfig?: { type?: string; materials?: Array<{ name: string; path: string }> }
    metal?: { color: string; metalness: number; roughness: number; envMapIntensity: number }
    diamond?: { color: string; transmission: number; ior: number; sparkle: number; refractiveIndex?: number }
    plugins?: Record<string, any>
}
interface ViewerOptions {
    container?: HTMLElement
    showZoomButtons?: boolean
    enableZoom?: boolean
    enableScrollWheel?: boolean
    transparentBg?: boolean
    shareUrl?: string
}

const DIAMOND_NAME_REGEX = /diamond|diamonds|gem|stone|solit(er|a)|soliter|brilliant|brillant|cz|moissanite|ruby|sapphire|emerald/i

const DIAMOND_COLORS: Record<string, { color: string; label: string }> = {
    white: { color: '#ffffff', label: 'White' },
    fancy_yellow: { color: '#f4d03f', label: 'Fancy Yellow' },
    fancy_pink: { color: '#f5a0b8', label: 'Fancy Pink' },
    fancy_blue: { color: '#5dade2', label: 'Fancy Blue' },
    fancy_green: { color: '#82e0aa', label: 'Fancy Green' },
    champagne: { color: '#f5cba7', label: 'Champagne' },
    cognac: { color: '#d4a574', label: 'Cognac' },
    sapphire_blue: { color: '#0f52ba', label: 'Blue Sapphire' },
    sapphire_pink: { color: '#ffb7c5', label: 'Pink Sapphire' },
    emerald: { color: '#50c878', label: 'Emerald' },
    amethyst: { color: '#9966cc', label: 'Amethyst' },
    ruby: { color: '#e0115f', label: 'Ruby' },
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

export class IjewelViewer {
    viewer!: ViewerApp
    container!: HTMLElement
    config!: ProjectConfig
    options!: ViewerOptions

    diamondProfile: DiamondProfile = {
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
        boostFactors: [1.0, 1.0, 1.0],
    }

    metalProfile: MetalProfile = {
        color: '#c2bfc3',
        metalness: 1,
        roughness: 0,
        envMapIntensity: 1.0,
    }

    diamondPluginInstance: any = null
    diamondPlacement!: DiamondPlacementSystem
    ringModel: Mesh | any = null
    private shadowFloor: any = null
    private shadowLight: any = null
    private currentEnvironment: any = null
    private backgroundTexture: any = null
    private environmentIntensityValue = 1.0
    private activeCameraDistance = 6
    private ringFitCenter = new Vector3()
    private ringFitSize = new Vector3()
    private modelLoaded = false
    private defaultModelPath = 'assets/main.glb'

    constructor(container: HTMLElement, project?: ProjectConfig, options?: ViewerOptions) {
        this.container = container
        this.config = project || {}
        this.options = options || {}
        this.applyConfig()
    }

    private applyConfig() {
        const p = this.config
        const m: any = p.metal || {}
        const d: any = p.diamond || {}
        if (typeof m.color === 'string' && m.color) this.metalProfile.color = m.color
        if (Number.isFinite(m.metalness)) this.metalProfile.metalness = Number(m.metalness)
        if (Number.isFinite(m.roughness)) this.metalProfile.roughness = Number(m.roughness)
        if (Number.isFinite(m.envMapIntensity)) this.metalProfile.envMapIntensity = Number(m.envMapIntensity)
        if (typeof d.color === 'string' && d.color) this.diamondProfile.color = d.color
        if (Number.isFinite(d.transmission)) this.diamondProfile.transmission = Number(d.transmission)
        if (Number.isFinite(d.refractiveIndex)) this.diamondProfile.refractiveIndex = Number(d.refractiveIndex)
        if (Number.isFinite(d.ior)) this.diamondProfile.refractiveIndex = Number(d.ior)
        if (Number.isFinite(d.sparkle)) this.diamondProfile.envMapIntensity = Number(d.sparkle)
    }

    async init(): Promise<this> {
        const canvas = this.container.querySelector('#webgi-canvas') as HTMLCanvasElement
        if (!canvas) throw new Error('Container must have a #webgi-canvas canvas element')

        this.viewer = new ViewerApp({
            canvas,
            useGBufferDepth: true,
            isAntialiased: false,
        })

        this.setupRenderer()
        await this.setupPlugins()
        this.setupLights()

        if (this.config.sceneConfig?.Environment) {
            await this.loadEnvironment(this.config.sceneConfig.Environment)
        }

        // Make IjewelViewer accessible from window for UI code
        ;(window as any).__ijewelViewer = this

        return this
    }

    private setupRenderer() {
        const r = (this.viewer.renderer as any).rendererObject
        if (r) {
            r.shadowMap.enabled = true
            r.shadowMap.type = 1 // PCFSoftShadowMap
            r.physicallyCorrectLights = true
            r.outputEncoding = 3001 // sRGBEncoding
            r.toneMapping = 4 // ACESFilmicToneMapping
            r.toneMappingExposure = 1.2
        }
    }

    private async setupPlugins() {
        await this.viewer.addPlugin(AssetManagerPlugin)
        await this.viewer.addPlugin(GBufferPlugin)
        await this.viewer.addPlugin(new ProgressivePlugin(32))
        const tonemap = await this.viewer.addPlugin(TonemapPlugin)
        if (tonemap) { tonemap.exposure = 1.0; tonemap.saturation = 1.1; tonemap.contrast = 1.1 }
        const ssao = await this.viewer.addPlugin(SSAOPlugin)
        if (ssao) (ssao as any).intensity = 0.25
        await this.viewer.addPlugin(FrameFadePlugin)
        await this.viewer.addPlugin(TemporalAAPlugin)

        try {
            const dp = await this.viewer.addPlugin(DiamondPlugin)
            if (dp) { (dp as any).forceSceneEnvMap = false }
            this.diamondPluginInstance = dp
        } catch (e) {
            console.warn('DiamondPlugin not available')
        }

        try { await this.viewer.addPlugin(RandomizedDirectionalLightPlugin) } catch (e) { }
    }

    private setupLights() {
        const dirLight = new DirectionalLight(0xffffff, 3)
        dirLight.position.set(5, 10, 7)
        dirLight.castShadow = true
        dirLight.shadow.mapSize.width = 4096
        dirLight.shadow.mapSize.height = 4096
        dirLight.shadow.bias = -0.0001
        dirLight.shadow.normalBias = 0.02
        dirLight.shadow.camera.near = 0.1
        dirLight.shadow.camera.far = 100
        dirLight.shadow.camera.left = -20
        dirLight.shadow.camera.right = 20
        dirLight.shadow.camera.top = 20
        dirLight.shadow.camera.bottom = -20

        const ambient = new AmbientLight(0xffffff, 0.5)

        ;(this.viewer.scene as any).add(dirLight)
        ;(this.viewer.scene as any).add(ambient)
        this.shadowLight = dirLight
    }

    private patchDracoDecoder() {
        const proto = (DRACOLoader2 as any)?.prototype
        if (!proto || proto.__localDecoderPatched) return
        const originalPreload = proto.preload
        proto.preload = function (...args: any[]) {
            try {
                this.setDecoderPath('assets/draco/')
                this.setDecoderConfig({ type: 'js' })
            } catch (e: any) {
                console.warn('Draco path set failed', e)
            }
            return originalPreload.apply(this, args)
        }
        proto.__localDecoderPatched = true
    }

    private removePreviousModel() {
        if (!this.ringModel) return
        const obj = this.getRingObject()
        if (obj) {
            obj.traverse?.((child: any) => {
                if (child.isMesh) {
                    child.geometry?.dispose()
                    const mats = Array.isArray(child.material) ? child.material : [child.material]
                    for (const m of mats) m?.dispose()
                }
            })
            if (obj.parent) obj.parent.remove(obj)
            else this.viewer.scene.remove(obj)
        }
        if (this.shadowFloor) {
            this.viewer.scene.remove(this.shadowFloor)
            this.shadowFloor.geometry?.dispose()
            this.shadowFloor.material?.dispose()
            this.shadowFloor = undefined
        }
        this.ringModel = null
        this.modelLoaded = false
    }

    async loadModel(url?: string): Promise<void> {
        const modelPath = url || this.config.modelUrl || this.defaultModelPath

        this.removePreviousModel()
        this.patchDracoDecoder()
        this.diamondPlacement = new DiamondPlacementSystem(this.viewer)

        const manager = this.viewer.getPlugin(AssetManagerPlugin) as any
        if (!manager) throw new Error('AssetManagerPlugin not found')
        const importer = manager.importer as any
        if (!importer) throw new Error('AssetManagerPlugin importer not found')

        const importOptions = {
            allowedExtensions: ['glb', 'gltf', 'fbx', 'obj', 'stl', '3dm'],
            autoScale: true,
            autoScaleRadius: 1.6,
            pseudoCenter: true,
            autoImport: true,
            autoAdd: true,
            centerOffset: new Vector3(0, 0.04, 2.8),
        }

        const isUrl = typeof modelPath === 'string' && (modelPath.startsWith('http') || modelPath.startsWith('blob:') || modelPath.startsWith('assets/') || modelPath.startsWith('./assets/'))
        const is3dm = modelPath.toLowerCase().endsWith('.3dm')

        try {
            if (is3dm) {
                const loader = new Rhino3dmLoader2()
                ;(loader as any).setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/')
                const model = await loader.loadAsync(modelPath)
                this.viewer.scene.add(model)
                this.ringModel = model
            } else if (isUrl) {
                const result = await importer.importSingle({ path: modelPath })
                if (result) this.viewer.scene.addSceneObject(result, importOptions)
                this.ringModel = result
            } else {
                const response = await fetch(modelPath)
                const blob = await response.blob()
                const file = new File([blob], modelPath.split('/').pop() || 'model.glb')
                await this.loadFile(file)
                return
            }
        } catch (e) {
            console.error('Model load failed:', e)
            throw e
        }

        this.modelLoaded = true
        this.applyMaterials()
        await this.setupShadowFloor()
        await this.setupPostLoad()
    }

    async loadFile(file: File): Promise<void> {
        this.removePreviousModel()
        this.patchDracoDecoder()
        this.diamondPlacement = new DiamondPlacementSystem(this.viewer)

        const manager = this.viewer.getPlugin(AssetManagerPlugin) as any
        if (!manager) throw new Error('AssetManagerPlugin not found')
        const importer = manager.importer as any
        if (!importer) throw new Error('AssetManagerPlugin importer not found')

        const importOptions = {
            allowedExtensions: ['glb', 'gltf', 'fbx', 'obj', 'stl', '3dm'],
            autoScale: true,
            autoScaleRadius: 1.6,
            pseudoCenter: true,
            autoImport: true,
            autoAdd: true,
            centerOffset: new Vector3(0, 0.04, 2.8),
        }

        const is3dm = file.name.toLowerCase().endsWith('.3dm')

        try {
            if (is3dm) {
                const loader = new Rhino3dmLoader2()
                ;(loader as any).setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/')
                const url = URL.createObjectURL(file)
                const model = await loader.loadAsync(url)
                URL.revokeObjectURL(url)
                this.viewer.scene.add(model)
                this.ringModel = model
            } else {
                const usePatch = (document.getElementById('patch-diamond') as HTMLInputElement)?.checked !== false
                const loadFile = usePatch ? await patchGlbWithDiamondMetadata(file) : file

                const result = await importer.importSingle({ path: file.name, file: loadFile })
                if (result) this.viewer.scene.addSceneObject(result, importOptions)
                this.ringModel = result
            }
        } catch (e) {
            console.error('File load failed:', e)
            throw e
        }

        this.modelLoaded = true
        this.applyMaterials()
        await this.setupShadowFloor()
        await this.setupPostLoad()
    }

    private applyMaterials() {
        if (!this.ringModel) return
        this.traverseAndApply(this.getRingObject())
    }

    private traverseAndApply(root: any) {
        const isDiamondMesh = (child: any, mat: any) => {
            if (mat?.extensions?.WEBGI_materials_diamond) return true
            const meshName = child?.name || ''
            const matName = mat?.name || ''
            const combinedName = `${meshName} ${matName}`
            if (DIAMOND_NAME_REGEX.test(combinedName)) return true
            if (/\b(prong|band|shank|bezel)\b/i.test(combinedName) && !DIAMOND_NAME_REGEX.test(combinedName)) return false
            if (mat.transmission !== undefined && mat.transmission > 0.5) return true
            if (mat.ior !== undefined && mat.ior > 1.8) return true
            const geometry = child?.geometry
            if (geometry) {
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
            }
            return false
        }

        root.traverse?.((child: any) => {
            if (!child.isMesh) return
            const mats = Array.isArray(child.material) ? child.material : [child.material]
            const isDiamond = mats.some((m: any) => isDiamondMesh(child, m))

            child.castShadow = true
            child.receiveShadow = true

            for (const mat of mats) {
                if (isDiamond) this.applyDiamondMaterial(mat)
                else this.applyMetalMaterial(mat)
            }
        })

        if (this.diamondPluginInstance) {
            const dp = this.diamondPluginInstance as any
            if (typeof dp.refreshEnvMaps === 'function') dp.refreshEnvMaps()
        }
    }

    private createLinearColor(hex: string) {
        return new Color(hex).convertSRGBToLinear()
    }

    private applyDiamondMaterial(material: any) {
        try {
            const ext = material?.extensions?.WEBGI_materials_diamond
            if (ext) {
                ext.color = new Color(this.diamondProfile.color).getHex()
                ext.envMapIntensity = this.diamondProfile.envMapIntensity
                ext.envMapRotationOffset = this.diamondProfile.envMapRotation * (Math.PI / 180)
                ext.dispersion = this.diamondProfile.dispersion
                ext.squashFactor = this.diamondProfile.squashFactor
                ext.geometryFactor = this.diamondProfile.geometryFactor
                ext.gammaFactor = this.diamondProfile.gammaFactor
                ext.absorptionFactor = this.diamondProfile.absorptionFactor
                ext.reflectivity = this.diamondProfile.reflectivity
                ext.transmission = this.diamondProfile.transmission
                ext.refractiveIndex = this.diamondProfile.refractiveIndex
                ext.rayBounces = this.diamondProfile.rayBounces
                ext.diamondOrientedEnvMap = this.diamondProfile.diamondOrientedEnvMap
                ext.boostFactors = {
                    x: this.diamondProfile.boostFactors[0],
                    y: this.diamondProfile.boostFactors[1],
                    z: this.diamondProfile.boostFactors[2],
                    isVector3: true,
                }
            }

            if ('color' in material) material.color = this.createLinearColor(this.diamondProfile.color)
            if ('envMapIntensity' in material) material.envMapIntensity = this.diamondProfile.envMapIntensity
            if ('dispersion' in material) material.dispersion = this.diamondProfile.dispersion
            if ('absorptionFactor' in material) material.absorptionFactor = this.diamondProfile.absorptionFactor
            if ('refractiveIndex' in material) material.refractiveIndex = this.diamondProfile.refractiveIndex
            if ('squashFactor' in material) material.squashFactor = this.diamondProfile.squashFactor
            if ('geometryFactor' in material) material.geometryFactor = this.diamondProfile.geometryFactor
            if ('gammaFactor' in material) material.gammaFactor = this.diamondProfile.gammaFactor
            if ('transmission' in material) material.transmission = this.diamondProfile.transmission
            if ('reflectivity' in material) material.reflectivity = this.diamondProfile.reflectivity
            if ('rayBounces' in material) material.rayBounces = this.diamondProfile.rayBounces
            if ('diamondOrientedEnvMap' in material) material.diamondOrientedEnvMap = this.diamondProfile.diamondOrientedEnvMap

            const b = this.diamondProfile.boostFactors
            if (material.userData) {
                material.userData._boostFactors = { x: b[0], y: b[1], z: b[2] }
            }
        } catch (error) {
            console.warn('applyDiamondMaterial failed', error)
        }
    }

    private applyMetalMaterial(material: any) {
        try {
            if ('color' in material) material.color = this.createLinearColor(this.metalProfile.color)
            if ('metalness' in material) material.metalness = this.metalProfile.metalness
            if ('roughness' in material) material.roughness = this.metalProfile.roughness
            if ('envMapIntensity' in material) material.envMapIntensity = this.metalProfile.envMapIntensity
        } catch (error) {
            console.warn('applyMetalMaterial failed', error)
        }
    }

    private getRingObject(): any {
        const m = this.ringModel
        if (!m) return m
        if (m.modelObject) return m.modelObject
        if (m.scene) return m.scene
        return m
    }

    private computeRingBounds(): Box3 {
        const box = new Box3()
        const obj = this.getRingObject()
        if (!obj) return box
        if (typeof obj.traverse === 'function') {
            obj.traverse((child: any) => {
                if (!child.geometry) return
                const geom = child.geometry
                if (!geom.boundingBox && typeof geom.computeBoundingBox === 'function') geom.computeBoundingBox()
                if (geom.boundingBox) {
                    box.min.min(geom.boundingBox.min)
                    box.max.max(geom.boundingBox.max)
                }
            })
        }
        if (box.isEmpty()) {
            if (typeof obj.updateWorldMatrix === 'function') box.setFromObject(obj)
            else if (obj.geometry?.boundingBox) box.copy(obj.geometry.boundingBox)
        }
        return box
    }

    private async setupShadowFloor() {
        if (!this.ringModel) return

        if (this.shadowFloor) {
            this.viewer.scene.remove(this.shadowFloor)
            this.shadowFloor = undefined
        }

        await new Promise<void>(r => requestAnimationFrame(() => r()))

        const box = this.computeRingBounds()
        const size = box.getSize(this.ringFitSize)
        const center = box.getCenter(this.ringFitCenter)
        const floorSize = Math.max(size.x, size.z) * 2.5

        const geometry = new PlaneGeometry(floorSize, floorSize)
        const material = new ShadowMaterial({ opacity: 0.35 })
        const floor = new Mesh(geometry, material)
        floor.rotation.x = -Math.PI / 2
        floor.position.y = center.y - size.y / 2 - 0.01
        floor.receiveShadow = true
        floor.name = 'shadow-floor'

        this.viewer.scene.add(floor)
        this.shadowFloor = floor
    }

    private async setupPostLoad() {
        if (!this.ringModel) return

        await new Promise<void>(r => requestAnimationFrame(() => r()))

        const box = this.computeRingBounds()
        const size = box.getSize(this.ringFitSize)
        const maxDim = Math.max(size.x, size.y, size.z)
        const fitDistance = maxDim * 1.8

        this.activeCameraDistance = fitDistance

        const camera = this.viewer.scene.activeCamera
        camera.position.set(0, 0, fitDistance)
        if (typeof camera.positionUpdated === 'function') camera.positionUpdated(false)

        this.viewer.setDirty()
    }

    async loadEnvironment(url: string) {
        try {
            const manager = this.viewer.getPlugin(AssetManagerPlugin)
            if (!manager) throw new Error('AssetManagerPlugin not found')
            const texture = await manager.importer.importSinglePath(url)
            if (!texture || texture.assetType !== 'texture') throw new Error('importSinglePath did not return a texture')

            this.viewer.scene.setEnvironment(texture)

            if (this.diamondPluginInstance) {
                this.diamondPluginInstance.envMap = texture
                this.diamondPluginInstance.forceSceneEnvMap = false
                if (typeof this.diamondPluginInstance.refreshEnvMaps === 'function')
                    this.diamondPluginInstance.refreshEnvMaps()
            }

            this.currentEnvironment = texture
            return texture
        } catch (e) {
            console.warn('Environment load failed:', url, e)
            return null
        }
    }

    setMetalColor(color: string) {
        this.metalProfile.color = color
        this.applyMaterials()
        this.viewer.setDirty()
    }

    setDiamondProfile(profile: Partial<DiamondProfile>) {
        Object.assign(this.diamondProfile, profile)
        this.applyMaterials()
        this.viewer.setDirty()
    }

    getViewerApp(): ViewerApp {
        return this.viewer
    }

    getRingModel(): any {
        return this.getRingObject()
    }

    getDiamondPlacement(): DiamondPlacementSystem | undefined {
        return this.diamondPlacement
    }
}
