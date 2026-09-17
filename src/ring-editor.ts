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
    DiamondPlugin,
    RandomizedDirectionalLightPlugin,
    Rhino3dmLoader2,
    Mesh,
    PlaneGeometry,
    ShadowMaterial,
    Raycaster,
    Vector2,
    OutlinePlugin,
    CameraViewPlugin,
    NormalBufferPlugin,
    HDRiGroundPlugin,
    SwitchNodePlugin,
    FullScreenPlugin,
    CameraUiPlugin,
    AnisotropyPlugin,
    GroundPlugin,
    ContactShadowGroundPlugin,
    VignettePlugin,
    FilmicGrainPlugin,
    ChromaticAberrationPlugin,
    BoxGeometry,
    SphereGeometry,
    CircleGeometry,
    CylinderGeometry,
    TorusGeometry,
    IcosahedronGeometry,
    MeshStandardMaterial,
    TextureLoader,
    ClearcoatTintPlugin,
    CustomBumpMapPlugin,
    NoiseBumpMaterialPlugin,
    ThinFilmLayerPlugin,
    LUTPlugin,
    DepthOfFieldPlugin,
    SimpleTextPlugin,
    SSBevelPlugin,
    SSGIPlugin,
} from './webgi-re-exports'
import { patchGlbWithDiamondMetadata } from './webgiDiamondPatch'

/* ============================================================
   Ring 3D Viewer + Editor
   Model -> component registry -> select -> identify -> edit -> preview -> save/order
   ============================================================ */

type CompType = 'metal' | 'stone'

interface EditableState {
    metalType?: string
    metalColor?: string
    stoneType?: string
    shape?: string
    carat?: number
    color?: string
    clarity?: string
}

interface ComponentDef {
    id: string
    label: string
    type: CompType
    match: string[] // regex fragments matched against "meshName materialName"
    defaults: EditableState
    editable: string[]
    refCarat?: number
}

interface EditorConfig {
    id: string
    name: string
    modelUrl: string
    envUrl: string
    gemEnvUrl?: string
    components: ComponentDef[]
}

interface RuntimeComponent {
    def: ComponentDef
    meshes: Mesh[]
    state: EditableState
    highlight: number
}

/* ---------------- Libraries (admin-editable vocab) ---------------- */

interface MetalRecipe {
    hex: string
    envIntensity: number
    roughness: number
    clearcoat: number
    clearcoatRoughness: number
    specularIntensity: number
    emissive: string | null
}

const METAL_LIBRARY: Record<string, MetalRecipe> = {
    '14K White Gold':  { hex: '#dcdbd9', envIntensity: 3.40, roughness: 0.05, clearcoat: 0.0, clearcoatRoughness: 0.10, specularIntensity: 1.15, emissive: null },
    '18K White Gold':  { hex: '#e8eaed', envIntensity: 3.20, roughness: 0.05, clearcoat: 0.0, clearcoatRoughness: 0.09, specularIntensity: 1.15, emissive: null },
    '14K Yellow Gold': { hex: '#f0ce6e', envIntensity: 2.60, roughness: 0.05, clearcoat: 0.15, clearcoatRoughness: 0.10, specularIntensity: 1.35, emissive: '#2b1d05' },
    '18K Yellow Gold': { hex: '#d4af37', envIntensity: 2.40, roughness: 0.05, clearcoat: 0.15, clearcoatRoughness: 0.09, specularIntensity: 1.35, emissive: '#2b1d05' },
    '14K Rose Gold':   { hex: '#e8a48c', envIntensity: 2.80, roughness: 0.05, clearcoat: 0.10, clearcoatRoughness: 0.10, specularIntensity: 1.20, emissive: null },
    '18K Rose Gold':   { hex: '#e29880', envIntensity: 2.60, roughness: 0.05, clearcoat: 0.10, clearcoatRoughness: 0.09, specularIntensity: 1.20, emissive: null },
    Platinum:          { hex: '#c2c2c3', envIntensity: 2.60, roughness: 0.05, clearcoat: 0.10, clearcoatRoughness: 0.08, specularIntensity: 1.00, emissive: null },
}

const STONE_TYPES = ['Natural Diamond', 'Lab-Grown Diamond', 'Moissanite', 'Sapphire', 'Emerald', 'Ruby', 'Other Gemstone']
const STONE_SHAPES = ['Round', 'Oval', 'Cushion', 'Emerald', 'Princess', 'Pear', 'Radiant', 'Marquise', 'Asscher', 'Heart', 'Baguette']
const STONE_COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']
const STONE_CLARITY = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2']
const METAL_NAMES = Object.keys(METAL_LIBRARY)
const METAL_ALLOW = new URLSearchParams(window.location.search).get('metals')
const ACTIVE_METALS = METAL_ALLOW
    ? METAL_ALLOW.split(',').map((s) => s.trim()).filter((n) => METAL_NAMES.includes(n))
    : METAL_NAMES

// stone type -> renderable tint / behaviour
const STONE_TINT: Record<string, string> = {
    'Natural Diamond': '#ffffff',
    'Lab-Grown Diamond': '#ffffff',
    Moissanite: '#ffffff',
    Sapphire: '#2e6de0',
    Emerald: '#1f9e57',
    Ruby: '#d52245',
    'Other Gemstone': '#e8c46a',
}
// diamond color grade D..K -> subtle warm shift
const GRADE_TINT: Record<string, string> = {
    D: '#ffffff', E: '#fffef9', F: '#fffef5', G: '#fffdf0', H: '#fffbe8', I: '#fff8e0', J: '#fff4d6', K: '#ffefcc',
}

/* ---------------- Default configs (per model basename) ---------------- */

const DEFAULT_CONFIGS: Record<string, EditorConfig> = {
    'LRS-02.glb': {
        id: 'LRS-02', name: 'Loria Solitaire', modelUrl: './assets/LRS-02.glb',
        envUrl: './assets/env_metal_studio.hdr', gemEnvUrl: './assets/env_gem_002.exr',
        components: [
            { id: 'center', label: 'Center Stone', type: 'stone', match: ['diamond', 'marquise', 'stone', 'gem'],
              defaults: { stoneType: 'Natural Diamond', shape: 'Marquise', carat: 1.20, color: 'D', clarity: 'VVS1' }, refCarat: 1.2,
              editable: ['stoneType', 'shape', 'carat', 'color', 'clarity'] },
            { id: 'band', label: 'Ring Band', type: 'metal', match: ['mesh', 'profile', 'creation curves', 'user layer', 'finger sizes', 'metal 01'],
              defaults: { metalType: '18K', metalColor: 'Platinum' },
              editable: ['metalType', 'metalColor'] },
        ],
    },
    'm01_main.glb': {
        id: 'M01', name: 'Round Halo Solitaire', modelUrl: './assets/m01_main.glb',
        envUrl: './assets/env_metal_studio.hdr', gemEnvUrl: './assets/env_gem_002.exr',
        components: [
            { id: 'center', label: 'Center Diamond', type: 'stone', match: ['diamond_round(?!_)', 'diamond_round$', 'center', 'main stone'],
              defaults: { stoneType: 'Natural Diamond', shape: 'Round', carat: 2.00, color: 'D', clarity: 'VVS1' }, refCarat: 2.0,
              editable: ['stoneType', 'shape', 'carat', 'color', 'clarity'] },
            { id: 'side', label: 'Side Diamonds', type: 'stone', match: ['diamond_round_'],
              defaults: { stoneType: 'Lab-Grown Diamond', shape: 'Round', carat: 0.30, color: 'G', clarity: 'VS1' }, refCarat: 0.3,
              editable: ['stoneType', 'shape', 'carat', 'color', 'clarity'] },
            { id: 'band', label: 'Ring Band', type: 'metal', match: ['metal', 'band', 'shank', 'object'],
              defaults: { metalType: '18K', metalColor: 'Rose Gold' },
              editable: ['metalType', 'metalColor'] },
        ],
    },
    'm09_sigli_head.glb': {
        id: 'SIGLI-HEAD', name: 'Sigli Head', modelUrl: './assets/m09_sigli_head.glb',
        envUrl: './assets/env_metal_studio.hdr', gemEnvUrl: './assets/env_gem_002.exr',
        components: [
            { id: 'center', label: 'Center Stone', type: 'stone', match: ['diamond', 'oval cs', 'gem'],
              defaults: { stoneType: 'Natural Diamond', shape: 'Oval', carat: 1.00, color: 'D', clarity: 'VVS1' }, refCarat: 1.0,
              editable: ['stoneType', 'shape', 'carat', 'color', 'clarity'] },
            { id: 'prongs', label: 'Prongs', type: 'metal', match: ['metal01', 'prong', 'claw'],
              defaults: { metalType: '18K', metalColor: 'White Gold' },
              editable: ['metalType', 'metalColor'] },
        ],
    },
    'm10_sigli_shank.glb': {
        id: 'SIGLI-SHANK', name: 'Sigli Shank', modelUrl: './assets/m10_sigli_shank.glb',
        envUrl: './assets/env_metal_studio.hdr', gemEnvUrl: './assets/env_gem_002.exr',
        components: [
            { id: 'band', label: 'Shank', type: 'metal', match: ['metal02', 'shank', 'band'],
              defaults: { metalType: '18K', metalColor: 'White Gold' },
              editable: ['metalType', 'metalColor'] },
        ],
    },
}

/* ============================================================
   Editor app
   ============================================================ */

const __params = new URLSearchParams(window.location.search)
const __win = window as any

/* Localize all cross-origin fetches (diamond env captures + draco decoder).
   webgi's importSingle + DiamondPlugin resolve these URLs internally and hang
   forever when the CDN is slow/blocked — remap them to bundled assets. */
const __locRemap: Array<[RegExp, string]> = [
    [/packs\.ijewel3d\.com\/files\/env_gem_002_[^\/]*\.exr/i, './assets/env_gem_002.exr'],
    [/packs\.ijewel3d\.com\/files\/env_metal_001_[^\/]*\.hdr/i, './assets/env_metal_001.hdr'],
    [/packs\.ijewel3d\.com\/files\/[^\/]*\.hdr/i, './assets/env_metal_001.hdr'],
    [/packs\.ijewel3d\.com\/files\/[^\/]*\.exr/i, './assets/env_gem_002.exr'],
    [/cdn\.jsdelivr\.net\/gh\/google\/draco[^\/]*\/javascript\/draco_decoder\.js/i, './assets/draco/draco_decoder.js'],
]
if (typeof window !== 'undefined' && window.fetch) {
    const __origFetch = window.fetch.bind(window)
    ;(window as any).fetch = async (input: any, init?: any) => {
        let url = typeof input === 'string' ? input : input && input.url ? input.url : String(input)
        for (const pair of __locRemap) {
            if (pair[0].test(url)) {
                const local = pair[1]
                const r = await __origFetch(local, init).catch(() => null)
                if (r && r.ok) {
                    const ct = /\.exr($|\?)/i.test(url) ? 'image/x-exr'
                        : /\.hdr($|\?)/i.test(url) ? 'image/vnd.radiance'
                        : /javascript/i.test(url) ? 'text/javascript' : ''
                    const hd = new Headers(r.headers)
                    if (ct) hd.set('Content-Type', ct)
                    const res = new Response(r.body, { status: 200, statusText: 'OK', headers: hd })
                    Object.defineProperty(res, 'url', { value: url })
                    return res
                }
            }
        }
        return __origFetch(input, init)
    }
}

const diag = {
    milestones: [] as string[],
    steps: [] as { n: number; label: string; ts: number; ok: boolean }[],
    error: '' as string,
    t0: performance.now(),
    step(n: number, label: string, ok = true) {
        this.steps.push({ n, label, ts: performance.now(), ok })
        this.milestone('step' + n + ':' + label)
        try {
            renderSteps()
        } catch (e) {}
    },
    milestone(m: string) {
        this.milestones.push(m + ' +' + Math.round(performance.now() - this.t0) + 'ms')
        try { __win.__ED_diag = this } catch (e) {}
    },
    fail(where: string, err: any) {
        this.error = where + ': ' + (err && err.message ? err.message : String(err))
        try { __win.__ED_diag = this } catch (e) {}
        console.error('ED diag ' + this.error)
    },
}
__win.__ED_diag = diag

const STEP_LABELS = [
    'Ready viewer',
    'Starting render engine',
    'Fetching model file',
    'Preparing 3D model',
    'Importing 3D model',
    'Placing ring on stage',
    'Lights & environment',
    'Ready — enjoy your ring',
]

function renderSteps() {
    const el: any = document.getElementById('ld-steps')
    if (!el) return
    const cur = diag.steps.length ? diag.steps[diag.steps.length - 1].n : 0
    el.innerHTML = ''
    STEP_LABELS.forEach((l, i) => {
        const n = i + 1
        const li = document.createElement('div')
        li.className = 'lds'
        if (n < cur || (n === cur && diag.steps.length && diag.steps[diag.steps.length - 1].ok && n === 8)) li.className += ' ok'
        if (n === cur) li.className += ' act'
        li.innerHTML = '<span class="lds-i">' + (n < cur || (n === cur && n === 8 && diag.steps[diag.steps.length - 1].ok) ? '✓' : n) + '</span><span>' + l + '</span>'
        el.appendChild(li)
    })
    const mile = document.getElementById('ld-phase')
    if (mile) mile.textContent = '…' + STEP_LABELS[cur === 0 ? 0 : cur - 1] + ' / ' + cur + ' of 8'
}

const DIAMOND_RE = /diamond|diamonds|gem|stone|solit(er|a)|soliter|brilliant|cz|moissanite|ruby|sapphire|emerald|oval cs|marquise/i
const METAL_IDENTITY = /\b(metal|layer|curve|creation|profile|mesh|finger|band|shank|prong|claw|bezel|ring|gold|plat|white|rose|yellow)\b/i

export class RingEditor {
    viewer!: ViewerApp
    container!: HTMLElement
    canvas!: HTMLCanvasElement
    config!: EditorConfig
    ringModel: any = null
    rootObject: any = null
    components: RuntimeComponent[] = []
    autoComponents: RuntimeComponent[] = []
    selectedId: string | null = null
    diamondPlugin: any = null
    controls: any = null
    fitDistance = 8
    origin = new Vector3(0, 0.03, 0)

    private originalState: Record<string, EditableState> = {}
    private history: string[] = []
    private redoStack: string[] = []
    private raycaster = new Raycaster()
    private pointer = new Vector2()
    private downPos = { x: 0, y: 0 }
    private pointerDownAt = 0
    viewerReady = false
    lite = false

    constructor(container: HTMLElement, config: EditorConfig) {
        this.container = container
        this.config = config
        const canvas = container.querySelector('#editor-canvas') as HTMLCanvasElement
        if (!canvas) throw new Error('container needs #editor-canvas')
        this.canvas = canvas
        const ua = navigator.userAgent
        const isMobile = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)
        const liteParam = __params.get('lite') === '1'
        this.lite = liteParam || isMobile
        diag.milestone('constructor lite=' + this.lite)
    }

    private detectWebgl(): string | null {
        try {
            const c = document.createElement('canvas')
            const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')
            return gl ? null : 'WebGL is unavailable on this device'
        } catch (e) {
            return (e as Error).message
        }
    }

    async init(): Promise<this> {
        diag.milestone('init:start')
        diag.step(1, STEP_LABELS[0])
        const glErr = this.detectWebgl()
        if (glErr) {
            diag.fail('webgl', glErr)
            diag.milestone('init:BLOCKED-no-webgl')
            this.hideLoader()
            const h = document.getElementById('errbox')
            if (h) h.classList.add('show')
            throw new Error(glErr)
        }
        try {
            this.viewer = new ViewerApp({ canvas: this.canvas, useGBufferDepth: true, isAntialiased: false })
        } catch (e) { diag.fail('ViewerApp create', e); throw e }
        diag.milestone('init:viewer-created')
        if (this.lite) {
            try { (this.viewer.renderer as any).displayCanvasScaling = 1 } catch (e) {}
        }
        this.setupRenderer()
        await this.setupPlugins()
        this.setupLights()
        this.setupPreFrame()
        window.addEventListener('resize', () => { try { (this.viewer as any).resize?.() } catch (e) {}; this.viewer.setDirty() })
        diag.milestone('init:plugins-ready')
        // render loop first — never block boot on env downloads
        if (typeof this.viewer.start === 'function') this.viewer.start()
        this.viewerReady = true
        diag.step(2, STEP_LABELS[1])
        diag.milestone('init:started-loop')
        setTimeout(() => {
            if (!this.placed && this.viewerReady) {
                this.basic = true
                diag.milestone('fallback:basic (25s watchdog)')
                try { (this.viewer as any).state?.setQuality?.({ fidelity: 0, realtimeQuality: 0 }) } catch (e) {}
                try { this.viewer.setDirty() } catch (e) {}
            }
        }, 25000)
        // envs load in background with hard timeout; model + UI proceed regardless
        const t0 = performance.now()
        this.loadEnvironments().catch((e) => diag.fail('envs', e)).then(() => diag.milestone('envs:done +' + Math.round(performance.now() - t0) + 'ms'))
        setTimeout(() => { if (!this.envsDone) { diag.milestone('envs:timeout-after-' + Math.round((performance.now() - t0) / 1000) + 's — continuing') } }, 20000)
        this.setupPicking()
        __win.__ringEditor = this
        return this
    }

    private envsDone = false
    private gemEnvOk = false
    private basic = false
    private placed = false
    private modelScaleTarget: any = null
    lastRawGlb: Blob | null = null
    currentModelName = ''
    private groundEl: any = null
    private dirLight: any = null
    private selectedObj: any = null
    private picking = false
    private rainbowOn = false

    private setupPreFrame() {
        this.viewer.addEventListener('preFrame', () => {
            if (!this.ringModel) return
            try { this.controls?.update?.() } catch (e) {}
            const rr = (this.viewer.renderer as any)?.rendererObject
            try { if (rr?.shadowMap) rr.shadowMap.needsUpdate = true } catch (e) {}
            this.viewer.setDirty()
        })
    }

    private setupRenderer() {
        const r = (this.viewer.renderer as any).rendererObject
        if (r) {
            r.shadowMap.enabled = true
            r.shadowMap.type = 1
            r.physicallyCorrectLights = true
            r.outputEncoding = 3001
            r.toneMapping = 4
            r.toneMappingExposure = 1.2
        }
    }

    private async setupPlugins() {
        await this.viewer.addPlugin(AssetManagerPlugin)
        await this.viewer.addPlugin(GBufferPlugin)
        await this.viewer.addPlugin(new ProgressivePlugin(this.lite ? 8 : 32))
        const tonemap = await this.viewer.addPlugin(TonemapPlugin)
        if (tonemap) { tonemap.exposure = 1.16; tonemap.saturation = 1.9; tonemap.contrast = 1.48 }
        try { await this.viewer.addPlugin(EXRLoadPlugin) } catch (e) { console.warn('EXRLoadPlugin', e) }
        if (!this.lite) {
            const ssao = await this.viewer.addPlugin(SSAOPlugin)
            if (ssao) (ssao as any).intensity = 0.2
            await this.viewer.addPlugin(FrameFadePlugin)
            try { await this.viewer.addPlugin(TemporalAAPlugin) } catch (e) {}
            try { await this.viewer.addPlugin(RandomizedDirectionalLightPlugin) } catch (e) {}
        }
        try {
            const dp = await this.viewer.addPlugin(DiamondPlugin)
            if (dp && !this.lite) { (dp as any).forceSceneEnvMap = false }
            this.diamondPlugin = dp
        } catch (e) { console.warn('DiamondPlugin unavailable', e) }
        if (!this.lite) {
            const bloom = await this.viewer.addPlugin(BloomPlugin)
            if (bloom) { bloom.intensity = 0.12; bloom.threshold = 0.95 }
        }

        const cam: any = this.viewer.scene.activeCamera
        try { cam.setCameraOptions?.({ controlsEnabled: true, controlsMode: 'orbit' }); cam.autoLookAtTarget = true } catch (e) {}
        try { this.controls = (cam as any).controls || null } catch (e) {}
    }

    private setupLights() {
        const dir = new DirectionalLight(0xffffff, 3)
        dir.position.set(5, 10, 7)
        dir.castShadow = true
        dir.shadow.mapSize.width = 2048
        dir.shadow.mapSize.height = 2048
        dir.shadow.bias = -0.0001
        dir.shadow.normalBias = 0.02
        const amb = new AmbientLight(0xffffff, 0.5)
        this.dirLight = dir
        ;(this.viewer.scene as any).add(dir)
        ;(this.viewer.scene as any).add(amb)
    }

    private async loadEnvironments() {
        const mgr: any = this.viewer.getPlugin(AssetManagerPlugin)
        if (!mgr) return
        try {
            const envUrl = this.lite ? './assets/env_metal_001.hdr' : this.config.envUrl
            const metal = await this.withTimeout(mgr.importer.importSinglePath(envUrl), this.lite ? 12000 : 15000)
            if (metal?.assetType === 'texture') {
                await this.viewer.scene.setEnvironment(metal)
                const sc: any = this.viewer.scene
                sc.envMapIntensity = this.lite ? 1.1 : 1.25
                try { sc.refreshEnvMapIntensity?.() } catch (e) {}
                console.log('METAL ENV OK', envUrl)
            }
        } catch (e) { console.warn('metal env load failed', e) }
        const gemUrl = this.config.gemEnvUrl
        if (gemUrl && this.diamondPlugin && !this.lite) {
            try {
                const gem = await this.withTimeout(mgr.importer.importSinglePath(gemUrl), 15000)
                if (gem?.assetType === 'texture') {
                    this.gemEnvOk = true
                    this.diamondPlugin.envMap = gem
                    this.diamondPlugin.forceSceneEnvMap = false
                    this.diamondPlugin.refreshEnvMaps?.()
                    console.log('GEM ENV OK', gemUrl)
                }
            } catch (e) { console.warn('gem env load failed', e) }
        } else if (this.diamondPlugin && this.lite) {
            try { this.diamondPlugin.forceSceneEnvMap = true } catch (e) {}
        }
        this.envsDone = true
    }

    private async withTimeout(promise: Promise<any>, ms: number): Promise<any> {
        let timer: any
        const timeout = new Promise<any>((_, reject) => {
            timer = setTimeout(() => reject(new Error('fetch timeout after ' + ms + 'ms')), ms)
        })
        try {
            return await Promise.race([promise, timeout])
        } finally {
            clearTimeout(timer)
        }
    }

    private fixEncodings() {
        const root = this.root
        if (!root) return
        const SRGB = 3001
        const setTex = (t: any) => {
            if (!t || !t.isTexture) return
            try {
                if (t.encoding === undefined || t.encoding === null) t.encoding = SRGB
                if (t.colorSpace === undefined || t.colorSpace === null) t.colorSpace = 'srgb'
                t.needsUpdate = true
            } catch (e) {}
        }
        const seen = new Set()
        const walk = (o: any) => {
            if (!o || seen.has(o)) return
            seen.add(o)
            if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material]
                for (const m of mats) {
                    if (!m) continue
                    setTex(m.map); setTex(m.envMap); setTex(m.normalMap); setTex(m.roughnessMap); setTex(m.metalnessMap)
                }
            }
            if (o.children) for (const c of o.children) walk(c)
        }
        walk(root)
        try {
            const tex = (this.viewer.scene as any).envMap || (this.viewer.scene as any).environment
            setTex(tex)
        } catch (e) {}
        try { (this.viewer.renderer as any).refreshPipeline?.() } catch (e) {}
        this.viewer.setDirty()
    }

    /* ---------------- Loading ---------------- */

    async loadModelFile(url: string) {
        diag.milestone('load:fetch ' + url)
        diag.step(3, STEP_LABELS[2])
        const response = await fetch(url)
        const blob = await response.blob()
        diag.milestone('load:fetched ' + blob.size + 'b')
        diag.step(4, STEP_LABELS[3])
        const file = new File([blob], url.split('/').pop() || 'model.glb', { type: 'model/gltf-binary' })
        this.currentModelName = file.name
        const patched = await patchGlbWithDiamondMetadata(file, undefined, { fallbackToFirst: true })
        this.lastRawGlb = patched as any as Blob
        diag.milestone('load:patched')
        diag.step(5, STEP_LABELS[4])
        const mgr: any = this.viewer.getPlugin(AssetManagerPlugin)
        const importer = mgr?.importer
        const result = await this.withTimeout(importer.importSingle({ path: file.name, file: patched }), 90000)
        diag.milestone('load:imported')
        this.placeModel(result)
    }

    async uploadModelFile(file: File) {
        diag.milestone('load:upload ' + file.name + ' ' + file.size + 'b')
        const name = file.name.toLowerCase()
        if (name.endsWith('.3dm')) {
            diag.step(3, STEP_LABELS[2])
            diag.step(4, STEP_LABELS[3])
            diag.step(5, STEP_LABELS[4])
            const loader = new Rhino3dmLoader2()
            ;(loader as any).setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/')
            const url = URL.createObjectURL(file)
            try {
                const model = await loader.loadAsync(url)
                diag.milestone('load:3dm-imported')
                diag.step(6, STEP_LABELS[5])
                this.ringModel = model
                this.placed = true
                this.finishModelLoad()
            } finally { URL.revokeObjectURL(url) }
            return
        }
        const patched = await patchGlbWithDiamondMetadata(file, undefined, { fallbackToFirst: true })
        this.lastRawGlb = patched as any as Blob
        this.currentModelName = file.name
        const mgr: any = this.viewer.getPlugin(AssetManagerPlugin)
        const importer = mgr?.importer
        const result = await this.withTimeout(importer.importSingle({ path: file.name, file: patched }), 90000)
        diag.milestone('load:imported')
        this.placeModel(result)
    }

    setScale(pct: number) {
        const r = this.modelScaleTarget || this.rootObject
        if (!r || !r.scale) return
        const s = pct / 100
        r.scale.setScalar(s)
        r.updateMatrixWorld?.(true)
        this.centerModel()
        this.viewer.setDirty()
    }

    private placeModel(result: any) {
        if (!result) throw new Error('import returned null')
        diag.milestone('placeModel:add')
        diag.step(6, STEP_LABELS[5])
        this.viewer.scene.addSceneObject(result, { autoScale: false })
        this.ringModel = result
        this.placed = true
        this.finishModelLoad()
    }

    private finishModelLoad() {
        this.rootObject = this.ringModel.modelObject || this.ringModel.scene || this.ringModel._modelObject || this.ringModel
        this.modelScaleTarget = this.rootObject
        this.centerModel()
        this.buildComponents()
        this.fitCamera()
        this.resetHistory()
        this.selectedId = null
        this.applyHighlight()
        this.renderComponentPanel()
        this.renderInfo(null)
        this.renderInfo(null, true)
        try { (this.viewer.renderer as any).refreshPipeline?.() } catch (e) {}
        try { this.diamondPlugin?.refreshEnvMaps?.() } catch (e) {}
        // if gem env never loaded, force diamonds onto scene env so the ring still renders
        if (this.diamondPlugin && !this.gemEnvOk) {
            try { this.diamondPlugin.forceSceneEnvMap = true; this.diamondPlugin.refreshEnvMaps?.() } catch (e) {}
        }
        this.viewer.setDirty()
        diag.step(7, STEP_LABELS[6])
        if (this.envsDone) { try { (this.viewer.renderer as any).refreshPipeline?.() } catch (e) {} }
        diag.step(8, STEP_LABELS[7])
        this.hideLoader()
        diag.milestone('placeModel:done')
        this.fixEncodings()
        try {
            (document.querySelectorAll('[data-scale]') as NodeListOf<HTMLInputElement>).forEach((s) => { s.value = '100' })
            document.querySelectorAll('.mt-val').forEach((v) => { v.textContent = '100%' })
        } catch (e) {}
        const evt = new CustomEvent('editor:model', { detail: this.getDesign() })
        window.dispatchEvent(evt)
    }

    private hideLoader() {
        const l = document.getElementById('loader')
        if (l) l.classList.add('hidden')
    }

    private get root(): any {
        return this.rootObject || (this.ringModel ? this.ringModel.modelObject || this.ringModel.scene || this.ringModel : null)
    }

    private centerModel() {
        const root = this.root
        if (!root) return
        root.updateMatrixWorld?.(true)
        const box = new Box3().setFromObject(root)
        if (box.isEmpty()) return
        const center = box.getCenter(new Vector3())
        const size = box.getSize(new Vector3())
        root.position.x -= center.x
        root.position.y -= center.y - size.y / 2
        root.position.z -= center.z
        root.updateMatrixWorld?.(true)
    }

    /* ---------------- Component resolution ---------------- */

    private isDiamondMesh(mesh: any) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
            if (m?.extensions?.WEBGI_materials_diamond) return true
            if (m?.isDiamondMaterialParameters || m?.type === 'DiamondMaterial') return true
        }
        const name = `${mesh.name || ''} ${mats.map((m: any) => m?.name || '').join(' ')}`.toLowerCase()
        if (DIAMOND_RE.test(name)) return true
        for (const m of mats) {
            if (m?.transmission !== undefined && m.transmission > 0.5) return true
            if (m?.ior !== undefined && m.ior > 1.8) return true
        }
        return false
    }

    private resolveComponentId(mesh: any, combinedName: string): ComponentDef | null {
        for (const def of this.config.components) {
            for (const frag of def.match || []) {
                try {
                    if (new RegExp(frag, 'i').test(combinedName)) return def
                } catch (e) {}
            }
        }
        return null
    }

    private buildComponents() {
        this.components = this.config.components.map((def) => ({
            def, meshes: [], state: { ...def.defaults }, highlight: 0,
        }))
        this.autoComponents = []

        const autoStone: RuntimeComponent = {
            def: { id: 'auto-stones', label: 'Stones (auto)', type: 'stone', match: [], defaults: { stoneType: 'Natural Diamond', shape: 'Round', carat: 0.5, color: 'G', clarity: 'VS1' }, refCarat: 0.5, editable: STONE_TYPES },
            meshes: [], state: { stoneType: 'Natural Diamond', shape: 'Round', carat: 0.5, color: 'G', clarity: 'VS1' }, highlight: 0,
        }
        const autoMetal: RuntimeComponent = {
            def: { id: 'auto-metal', label: 'Metal (auto)', type: 'metal', match: [], defaults: { metalType: '18K', metalColor: 'White Gold' }, editable: ['metalType', 'metalColor'] },
            meshes: [], state: { metalType: '18K', metalColor: 'White Gold' }, highlight: 0,
        }

        this.root?.traverse?.((c: any) => {
            if (!c.isMesh) return
            const mats = Array.isArray(c.material) ? c.material : [c.material]
            const combined = `${c.name || ''} ${mats.map((m: any) => m?.name || '').join(' ')}`.toLowerCase()
            const def = this.resolveComponentId(c, combined)
            const isDia = this.isDiamondMesh(c)
            if (def) {
                const comp = this.components.find((cc) => cc.def.id === def.id)
                if (comp) comp.meshes.push(c)
                else (isDia ? autoStone : autoMetal).meshes.push(c)
            } else if (isDia) {
                autoStone.meshes.push(c)
            } else {
                autoMetal.meshes.push(c)
            }
            c.userData = Object.assign(c.userData || {}, { _editorMesh: true })
        })

        if (autoStone.meshes.length) this.autoComponents.push(autoStone)
        if (autoMetal.meshes.length) this.autoComponents.push(autoMetal)

        // now apply initial states of every component to its meshes
        for (const c of this.components) this.applyComponent(c)
        for (const c of this.autoComponents) this.applyComponent(c)

        this.captureOriginal()
    }

    /* ---------------- Material editing ---------------- */

    private metalRecipe(metalColor: string): MetalRecipe {
        return METAL_LIBRARY[metalColor] || METAL_LIBRARY['Platinum']
    }

    private applyComponent(comp: RuntimeComponent) {
        for (const mesh of comp.meshes) this.applyToMesh(mesh, comp)
    }

    private applyToMesh(mesh: any, comp: RuntimeComponent) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const isStone = comp.def.type === 'stone'
        // carat -> visual size where it makes sense
        if (isStone && comp.def.refCarat) {
            const ratio = Math.pow((comp.state.carat || comp.def.refCarat) / comp.def.refCarat, 1 / 3)
            const b = mesh.userData._editorBaseScale
            const base = b || 1
            if (!b) mesh.userData._editorBaseScale = (mesh.scale ? mesh.scale.x : 1) || 1
            const s = (base * ratio) || base
            if (mesh.scale) mesh.scale.setScalar(s)
        }
        for (const m of mats) {
            if (isStone) this.applyStoneMaterial(m, comp)
            else this.applyMetalMaterial(m, comp)
        }
        if (mesh.updateMatrixWorld) mesh.updateMatrixWorld?.(true)
    }

    private applyMetalMaterial(mat: any, comp: RuntimeComponent) {
        if (!mat) return
        try {
            if (mat?.extensions?.WEBGI_materials_diamond) return
            if (mat?.isDiamondMaterialParameters || mat?.type === 'DiamondMaterial') return
        } catch (e) {}
        const rec = this.metalRecipe(comp.state.metalColor || 'Platinum')
        if (!mat.userData) mat.userData = {}
        if (mat.userData._editorBaseEnv == null) {
            mat.userData._editorBaseEnv = typeof mat.envMapIntensity === 'number' ? mat.envMapIntensity : rec.envIntensity
            mat.userData._editorBaseColor = mat.color ? (mat.color.getHex ? mat.color.getHex() : null) : null
        }
        if ('color' in mat) mat.color = new Color(rec.hex).convertSRGBToLinear()
        if ('envMapIntensity' in mat) mat.envMapIntensity = rec.envIntensity
        if ('roughness' in mat) mat.roughness = rec.roughness
        if ('metalness' in mat) mat.metalness = 1
        if ('specularIntensity' in mat) mat.specularIntensity = rec.specularIntensity
        if ('clearcoat' in mat) mat.clearcoat = rec.clearcoat
        if ('clearcoatRoughness' in mat) mat.clearcoatRoughness = rec.clearcoatRoughness
        if (rec.emissive && 'emissive' in mat) { mat.emissive = new Color(rec.emissive); if ('emissiveIntensity' in mat) mat.emissiveIntensity = 0.35 }
        if ('needsUpdate' in mat) mat.needsUpdate = true
    }

    private applyStoneMaterial(mat: any, comp: RuntimeComponent) {
        if (!mat) return
        try {
            const tint = STONE_TINT[comp.state.stoneType || 'Natural Diamond'] || '#ffffff'
            const gradeTint = GRADE_TINT[comp.state.color || 'D'] || '#ffffff'
            const c = new Color(tint).multiply(new Color(gradeTint))
            const isSapphireLike = /sapphire|emerald|ruby|other/i.test(comp.state.stoneType || '')
            if (mat?.extensions?.WEBGI_materials_diamond) {
                const ext = mat.extensions.WEBGI_materials_diamond
                ext.color = c.getHex()
                ext.envMapIntensity = isSapphireLike ? 3.4 : (mat.userData?._editorBaseEnv || 2.8)
                ext.gammaFactor = 1.2
                ext.absorptionFactor = isSapphireLike ? 0.55 : 0.4
                if (comp.state.stoneType === 'Moissanite') { ext.refractiveIndex = 2.65; ext.dispersion = 0.03 }
                else if (isSapphireLike) { ext.refractiveIndex = 1.77; ext.transmission = 0.9 }
                else { ext.refractiveIndex = 2.6; ext.dispersion = 0.02 }
            }
            if (mat.userData == null) mat.userData = {}
            if (mat.userData._editorBaseEnv == null && typeof mat.envMapIntensity === 'number') mat.userData._editorBaseEnv = mat.envMapIntensity
            if ('color' in mat) mat.color = c
            if ('envMapIntensity' in mat) mat.envMapIntensity = isSapphireLike ? 3.4 : (mat.userData._editorBaseEnv || 2.8)
            if ('dispersion' in mat) mat.dispersion = comp.state.stoneType === 'Moissanite' ? 0.03 : 0.02
            if ('ior' in mat) mat.ior = isSapphireLike ? 1.77 : (comp.state.stoneType === 'Moissanite' ? 2.41 : 2.41)
            if ('transmission' in mat && mat.transmission !== undefined) mat.transmission = isSapphireLike ? 0.9 : 0.92
            if ('needsUpdate' in mat) mat.needsUpdate = true
        } catch (e) { console.warn('stone apply', e) }
    }

    /* ---------------- Highlight / selection ---------------- */

    selectComponent(id: string | null) {
        if (this.selectedId === id) return
        this.selectedId = id
        this.applyHighlight()
        this.renderComponentPanel()
        const comp = this.findComponent(id)
        this.renderInfo(comp)
        this.renderInfo(comp, true)
        if (window.matchMedia && window.matchMedia('(max-width: 860px)').matches) {
            document.getElementById('mobilesheet')?.classList.add('open')
        }
    }

    findComponent(id: string | null): RuntimeComponent | null {
        if (!id) return null
        return this.components.find((c) => c.def.id === id) || this.autoComponents.find((c) => c.def.id === id) || null
    }

    private applyHighlight() {
        const all = [...this.components, ...this.autoComponents]
        for (const comp of all) {
            const dim = this.selectedId != null && comp.def.id !== this.selectedId
            comp.highlight = this.selectedId === comp.def.id ? 1 : 0
            for (const mesh of comp.meshes) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
                for (const m of mats) {
                    if (!m || !m.userData) continue
                    if (dim) m.envMapIntensity = (m.userData._editorBaseEnv || 1) * 0.45
                    else m.envMapIntensity = m.userData._editorBaseEnv || m.envMapIntensity
                    try { m.needsUpdate = true } catch (e) {}
                }
            }
        }
    }

    /* ---------------- Editing API ---------------- */

    private refreshInfo() {
        const comp = this.findComponent(this.selectedId)
        this.renderInfo(comp)
        this.renderInfo(comp, true)
    }

    setComponentState(id: string, patch: EditableState, record = true): boolean {
        const comp = this.findComponent(id)
        if (!comp) return false
        const allowed = new Set(comp.def.editable || [])
        for (const k of Object.keys(patch)) {
            if (allowed.has(k)) {
                const cur: any = comp.state
                const next: any = patch
                if (cur[k] !== next[k]) {
                    if (record) this.pushHistory()
                    cur[k] = next[k]
                    this.applyComponent(comp)
                    this.applyHighlight()
                    this.refreshInfo()
                    this.renderComponentPanel()
                }
            }
        }
        return true
    }

    setMetal(id: string, metalColor: string) {
        this.setComponentState(id, { metalColor })
    }

    setStone(id: string, patch: EditableState) {
        this.setComponentState(id, patch)
    }

    resetSelection() {
        this.selectComponent(null)
    }

    /* ---------------- History ---------------- */

    private snapshot(): string {
        const d: Record<string, EditableState> = {}
        for (const c of [...this.components, ...this.autoComponents]) d[c.def.id] = { ...c.state }
        return JSON.stringify(d)
    }

    private restore(snap: string) {
        const d = JSON.parse(snap)
        for (const c of [...this.components, ...this.autoComponents]) {
            if (d[c.def.id]) {
                c.state = { ...c.state, ...d[c.def.id] }
                this.applyComponent(c)
            }
        }
        this.applyHighlight()
        this.renderComponentPanel()
        this.refreshInfo()
    }

    private pushHistory() {
        this.history.push(this.snapshot())
        if (this.history.length > 60) this.history.shift()
        this.redoStack = []
        this.updateToolbar()
    }

    private resetHistory() {
        this.history = []
        this.redoStack = []
        this.updateToolbar()
    }

    private captureOriginal() {
        this.originalState = JSON.parse(this.snapshot())
    }

    undo() {
        const last = this.history.pop()
        if (!last) return
        this.redoStack.push(this.snapshot())
        this.restore(last)
        this.updateToolbar()
    }

    redo() {
        const next = this.redoStack.pop()
        if (!next) return
        this.pushHistorySilent()
        this.restore(next)
        this.updateToolbar()
    }

    private pushHistorySilent() {
        this.history.push(this.snapshot())
        if (this.history.length > 60) this.history.shift()
    }

    resetToOriginal() {
        for (const c of [...this.components, ...this.autoComponents]) {
            if (this.originalState[c.def.id]) c.state = { ...this.originalState[c.def.id] }
            this.applyComponent(c)
        }
        this.history = []
        this.redoStack = []
        this.applyHighlight()
        this.renderComponentPanel()
        this.refreshInfo()
        this.updateToolbar()
    }

    private updateToolbar() {
        const evt = new CustomEvent('editor:history', { detail: { canUndo: this.history.length > 0, canRedo: this.redoStack.length > 0 } })
        window.dispatchEvent(evt)
    }

    /* ---------------- Camera / views ---------------- */

    private fitCamera() {
        const root = this.root
        if (!root) return
        root.updateMatrixWorld?.(true)
        const box = new Box3().setFromObject(root)
        if (box.isEmpty()) return
        const size = box.getSize(new Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        this.fitDistance = maxDim * 1.9
        this.origin = box.getCenter(new Vector3())
        this.setView('3d')
    }

    setView(mode: string) {
        const cam: any = this.viewer.scene.activeCamera
        const R = this.fitDistance || 8
        const pos = (x: number, y: number, z: number) => new Vector3(x, y, z)
        const targets: Record<string, [number, number, number]> = {
            '3d': [0.86, 0.60, 1.00],
            front: [0, 0.06, 1.00],
            side: [1.00, 0.06, 0],
            top: [0, 1.00, 0.04],
            closeup: [0, 0.10, 0.38],
            perspective: [0.72, -0.30, 0.95],
        }
        const t = targets[mode] || targets['3d']
        const p = cam.position ? pos(t[0] * R, t[1] * R, t[2] * R) : null
        if (cam.position) cam.position.copy(p)
        if (cam.lookAt) cam.lookAt(this.origin)
        try { cam.positionUpdated?.(false) } catch (e) {}
        if (this.controls && this.controls.target && this.controls.target.isVector3) this.controls.target.copy(this.origin)
        try { this.controls?.update?.() } catch (e) {}
        this.viewer.setDirty()
    }

    /* ---------------- Picking ---------------- */

    private setupPicking() {
        const el = this.canvas
        el.addEventListener('pointerdown', (ev: PointerEvent) => {
            this.downPos = { x: ev.clientX, y: ev.clientY }
            this.pointerDownAt = performance.now()
        })
        el.addEventListener('pointerup', (ev: PointerEvent) => {
            const dx = ev.clientX - this.downPos.x
            const dy = ev.clientY - this.downPos.y
            if (dx * dx + dy * dy > 36) return // orbit drag — not a click
            if (performance.now() - this.pointerDownAt > 700) return
            this.pick(ev)
        })
    }

    private pick(ev: PointerEvent) {
        const rect = this.canvas.getBoundingClientRect()
        this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
        this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
        const cam: any = this.viewer.scene.activeCamera
        this.raycaster.setFromCamera(this.pointer, cam)
        const root = this.root
        if (!root) return
        const hits = this.raycaster.intersectObjects(root.children, true)
        const hit = hits.find((h: any) => h.object?.isMesh)
        if (!hit) return
        const mesh = hit.object
        const comp = this.allComponents().find((c) => c.meshes.indexOf(mesh) >= 0)
        if (comp) this.selectComponent(comp.def.id)
    }

    /* ---------------- Design / orders ---------------- */

    allComponents(): RuntimeComponent[] {
        return [...this.components, ...this.autoComponents]
    }

    getDesign() {
        const states: Record<string, EditableState> = {}
        for (const c of this.allComponents()) states[c.def.id] = { ...c.state }
        return {
            configId: this.config.id,
            model: this.config.modelUrl,
            name: this.config.name,
            components: states,
            exportedAt: new Date().toISOString(),
        }
    }

    serializeDesign(): string {
        const d = this.getDesign()
        return JSON.stringify(d)
    }

    saveDesignToStorage() {
        const existing = JSON.parse(localStorage.getItem('ring-editor.designs') || '[]')
        const d = this.getDesign()
        existing.unshift(d)
        localStorage.setItem('ring-editor.designs', JSON.stringify(existing.slice(0, 20)))
        return d
    }

    downloadDesign() {
        const d = this.getDesign()
        const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${this.config.id || 'ring'}-design.json`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    }

    shareDesign() {
        const url = new URL(window.location.href)
        url.searchParams.set('design', encodeURIComponent(this.serializeDesign()))
        // strip other params to keep the link clean
        for (const k of ['model', 'config']) url.searchParams.delete(k)
        const s = url.toString()
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(s).then(() => console.log('URL copied')).catch(() => {})
        }
        return s
    }

    private orderPayload(action: 'cart' | 'quote') {
        return {
            type: `editor:${action}`,
            design: this.getDesign(),
            summary: this.summaryText(),
        }
    }

    addToCart() {
        const payload = this.orderPayload('cart')
        this.postToParent(payload)
        showToast('Configurator sent to cart (parent frame notified).')
    }

    requestQuote() {
        const payload = this.orderPayload('quote')
        this.postToParent(payload)
        showToast('Request custom quote — linked via configurator payload.')
    }

    private postToParent(payload: any) {
        try {
            if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*')
        } catch (e) {}
        console.log('EDITOR PAYLOAD', JSON.stringify(payload, null, 2))
        ;(window as any).__lastOrderPayload = payload
    }

    summaryText(): string {
        const lines: string[] = []
        for (const c of this.allComponents()) {
            const s = c.state
            if (c.def.type === 'metal') {
                lines.push(`${c.def.label}: ${s.metalColor}${s.metalType ? ' (' + s.metalType + ')' : ''}`)
            } else {
                lines.push(`${c.def.label}: ${s.carat} ct ${s.color} ${s.clarity} ${s.stoneType} (${s.shape})`)
            }
        }
        return lines.join(' · ')
    }

    /* ---------------- Panel DOM ---------------- */

    renderComponentPanel() {
        const listEl = document.getElementById('editor-components')
        if (!listEl) return
        const all = this.allComponents()
        listEl.innerHTML = ''
        // reset selection action
        const resetTag = document.createElement('button')
        resetTag.className = 'comp-reset'
        resetTag.textContent = 'Reset selection'
        resetTag.addEventListener('click', () => this.resetSelection())
        listEl.appendChild(resetTag)
        for (const c of all) {
            const row = document.createElement('button')
            row.className = 'comp-row' + (c.def.id === this.selectedId ? ' active' : '')
            row.innerHTML = `<span class="comp-name"></span><span class="comp-badge ${c.def.type}"></span>`
            row.querySelector('.comp-name')!.textContent = c.def.label
            row.querySelector('.comp-badge')!.textContent = c.def.type === 'metal' ? 'Metal' : 'Stone'
            row.addEventListener('click', () => this.selectComponent(c.def.id))
            listEl.appendChild(row)
        }
    }

    renderInfo(comp: RuntimeComponent | null, mobile = false) {
        const info = document.getElementById(mobile ? 'm-info' : 'editor-info')
        if (!info) return
        const plain = (code: string) => {
            const span = document.createElement('div')
            span.className = 'infoline'
            span.innerHTML = code
            return span
        }
        info.innerHTML = ''
        if (!comp) {
            info.appendChild(plain('No part selected — click a component in the 3D view or the panel.'))
            this.renderProperties(null, mobile)
            return
        }
        const s = comp.state
        const head = document.createElement('div')
        head.className = 'info-head'
        head.textContent = comp.def.label
        info.appendChild(head)
        if (comp.def.type === 'metal') {
            info.appendChild(plain(`Material: <b>Metal</b>`))
            info.appendChild(plain(`Metal: <b>${s.metalColor || '—'}</b>`))
            if (s.metalType) info.appendChild(plain(`Grade: <b>${s.metalType}</b>`))
        } else {
            info.appendChild(plain(`Material: <b>${s.stoneType || 'Diamond'}</b>`))
            info.appendChild(plain(`Shape: <b>${s.shape || '—'}</b>`))
            info.appendChild(plain(`Carat: <b>${s.carat || '—'} ct</b>`))
            info.appendChild(plain(`Color: <b>${s.color || '—'}</b>`))
            info.appendChild(plain(`Clarity: <b>${s.clarity || '—'}</b>`))
        }
        this.renderProperties(comp, mobile)
    }

    renderProperties(comp: RuntimeComponent | null, mobile = false) {
        const box = document.getElementById(mobile ? 'm-props' : 'editor-props')
        if (!box) return
        const mk = (tag: string, cls: string, html = '') => {
            const el = document.createElement(tag)
            el.className = cls
            if (html) el.innerHTML = html
            return el
        }
        const swatch = (label: string, color: string, active: boolean, fn: () => void) => {
            const b = document.createElement('button')
            b.className = 'sw' + (active ? ' on' : '')
            b.title = label
            b.innerHTML = `<span class="sw-dot" style="background:${color}"></span><span class="sw-label">${label}</span>`
            b.addEventListener('click', fn)
            return b
        }
        const select = (label: string, values: string[], cur: string, fn: (v: string) => void) => {
            const w = mk('div', 'prop-row')
            w.appendChild(mk('label', 'prop-label', label))
            const sel = mk('select', 'prop-input') as HTMLSelectElement
            for (const v of values) {
                const o = document.createElement('option')
                o.value = v; o.textContent = v
                if (v === cur) o.selected = true
                sel.appendChild(o)
            }
            sel.addEventListener('change', () => fn(sel.value))
            w.appendChild(sel)
            return w
        }

        box.innerHTML = ''
        if (!comp || !this.selectedId) {
            box.appendChild(mk('div', 'prop-empty', 'Select a component to edit its materials and stone parameters.'))
            return
        }
        const editable = new Set(comp.def.editable || [])
        if (comp.def.type === 'metal') {
            const grid = mk('div', 'prop-row')
            grid.appendChild(mk('label', 'prop-label', 'Metal Color'))
            const r = mk('div', 'sw-grid')
            for (const name of ACTIVE_METALS) {
                r.appendChild(swatch(name, METAL_LIBRARY[name].hex, (comp.state.metalColor || '') === name,
                    () => this.setMetal(comp.def.id, name)))
            }
            grid.appendChild(r)
            box.appendChild(grid)
            if (editable.has('metalType')) {
                box.appendChild(select('Karat', ['9K', '10K', '14K', '18K', '22K'], comp.state.metalType || '18K',
                    (v) => this.setComponentState(comp.def.id, { metalType: v })))
            }
        } else {
            if (editable.has('stoneType')) {
                box.appendChild(select('Stone Type', STONE_TYPES, comp.state.stoneType || 'Natural Diamond',
                    (v) => this.setStone(comp.def.id, { stoneType: v })))
            }
            if (editable.has('shape')) {
                box.appendChild(select('Shape', STONE_SHAPES, comp.state.shape || 'Round',
                    (v) => this.setStone(comp.def.id, { shape: v })))
            }
            if (editable.has('carat')) {
                const w = mk('div', 'prop-row')
                w.appendChild(mk('label', 'prop-label', 'Carat'))
                const sl = mk('input', 'prop-range') as HTMLInputElement
                sl.type = 'range'
                sl.min = '0.1'; sl.max = '4.0'; sl.step = '0.1'
                sl.value = String(comp.state.carat ?? 1)
                const val = mk('span', 'prop-val', sl.value + ' ct')
                sl.addEventListener('input', () => {
                    val.textContent = sl.value + ' ct'
                    this.setComponentState(comp.def.id, { carat: parseFloat(sl.value) })
                })
                w.appendChild(sl); w.appendChild(val)
                box.appendChild(w)
            }
            if (editable.has('color')) {
                box.appendChild(select('Color', STONE_COLORS, comp.state.color || 'D',
                    (v) => this.setStone(comp.def.id, { color: v })))
            }
            if (editable.has('clarity')) {
                box.appendChild(select('Clarity', STONE_CLARITY, comp.state.clarity || 'VS1',
                    (v) => this.setStone(comp.def.id, { clarity: v })))
            }
        }
    }

    /* ---------------- Studio (Playground-style) presets & tools ---------------- */

    private async importEnv(path: string): Promise<any> {
        const mgr: any = this.viewer.getPlugin(AssetManagerPlugin)
        const importer = mgr?.importer
        if (!importer) return null
        return this.withTimeout(importer.importSinglePath(path), 20000).catch((e) => { console.warn('env import failed', path, e); return null })
    }

    async applySceneEnv(v: string) {
        if (!v || v === 'none') {
            try { (this.viewer.scene as any).envMap = null } catch (e) {}
            try { (this.viewer.scene as any).envMapIntensity = 0.05 } catch (e) {}
        } else {
            const tex = await this.importEnv(v)
            if (!tex) return
            try { this.viewer.scene.envMap = tex } catch (e) {}
            try { this.viewer.scene.envMapIntensity = 0.85 } catch (e) {}
        }
        try { (this.viewer.renderer as any).refreshPipeline?.() } catch (e) {}
        this.viewer.setDirty()
    }

    async applyGemEnv(v: string) {
        const dp = this.diamondPlugin
        if (!dp) return
        if (!v || v === 'none') {
            try { dp.forceSceneEnvMap = true; dp.refreshEnvMaps?.() } catch (e) {}
        } else {
            const tex = await this.importEnv(v)
            if (!tex) return
            try {
                dp.envMap = tex
                dp.forceSceneEnvMap = false
                dp.refreshEnvMaps?.()
                this.gemEnvOk = true
            } catch (e) {}
        }
        this.viewer.setDirty()
    }

    async applyPlayground(kind: string) {
        const map: Record<string, [string, string]> = {
            pg1: ['./assets/hdrmaps/metal/env-metal-001.hdr', './assets/hdrmaps/gem/env-gem-001.exr'],
            pg2: ['./assets/hdrmaps/metal/env-metal-002.exr', './assets/hdrmaps/gem/env-gem-002.exr'],
            pg3: ['./assets/hdrmaps/metal/env-metal-003.hdr', './assets/hdrmaps/gem/env-gem-003.hdr'],
            pg4: ['./assets/hdrmaps/metal/env-metal-003.hdr', './assets/hdrmaps/gem/env-gem-004.exr'],
        }
        const p = map[kind]
        if (!p) return
        this.applyBackground('white')
        this.applyGround(true)
        await this.applySceneEnv(p[0])
        await this.applyGemEnv(p[1])
        try { this.viewer.setDirty() } catch (e) {}
    }

    applyBackground(kind: string) {
        const v: any = this.viewer
        const colors: Record<string, number> = { default: 0x111111, charcoal: 0x242427, graphite: 0x33333a, white: 0xffffff, cream: 0xfcf6ec, gold: 0x2a2413, blush: 0x2b1d1d }
        const c = colors[kind] !== undefined ? colors[kind] : 0x111111
        try { v.setBackgroundColor(c) } catch (e) { try { v.setBackground(c) } catch (e2) {} }
        this.viewer.setDirty()
    }

    applyGround(on: boolean) {
        if (this.groundEl) {
            try { this.viewer.scene.remove(this.groundEl) } catch (e) {}
            try { this.groundEl.geometry?.dispose() } catch (e) {}
            try { this.groundEl.material?.dispose() } catch (e) {}
            this.groundEl = null
        }
        if (!on) { this.viewer.setDirty(); return }
        const root = this.root
        if (!root) return
        root.updateMatrixWorld?.(true)
        const box = new Box3().setFromObject(root)
        if (box.isEmpty()) return
        const size = box.getSize(new Vector3())
        const center = box.getCenter(new Vector3())
        const fs = Math.max(size.x, size.z) * 2.6
        const floor = new Mesh(new PlaneGeometry(fs, fs), new ShadowMaterial({ opacity: 0.35 }))
        floor.rotation.x = -Math.PI / 2
        floor.position.y = center.y - size.y / 2 - 0.01
        floor.receiveShadow = true
        floor.name = 'studio-shadow-floor'
        floor.userData._base = fs
        floor.userData._baseY = center.y - size.y / 2 - 0.01
        try { this.viewer.scene.add(floor) } catch (e) {}
        this.groundEl = floor
        this.viewer.setDirty()
    }

    setGroundSize(s: number) {
        if (!this.groundEl) this.applyGround(true)
        const g = this.groundEl
        if (!g) return
        const base = g.userData._base || 6
        g.scale.setScalar(s / base)
        this.viewer.setDirty()
    }

    setGroundOffset(y: number) {
        if (!this.groundEl) this.applyGround(true)
        const g = this.groundEl
        if (!g) return
        g.position.y = (g.userData._baseY || 0) + y
        this.viewer.setDirty()
    }

    applyMetalLibrary(name: string) {
        const comps = this.components.concat(this.autoComponents).filter((c) => c.def.type === 'metal')
        for (const c of comps) this.setComponentState(c.def.id, { metalColor: name }, false)
        this.viewer.setDirty()
        this.renderComponentPanel()
    }

    studioAnimation(mode: 'play' | 'stop' | 'reset') {
        const anims: any[] = (this.viewer.scene as any).animations || []
        for (const a of anims) for (const ac of a.actions || []) {
            try {
                if (mode === 'play') ac.play()
                else if (mode === 'stop') ac.stop()
                else { ac.stop(); ac.reset?.(); ac.play() }
            } catch (e) {}
        }
    }

    hasAnimations(): boolean {
        const anims: any[] = (this.viewer.scene as any).animations || []
        return anims.some((a: any) => (a.actions || []).length || (a.clips || []).length)
    }

    async exportGLB(bits?: number) {
        let f: any
        try {
            const mgr: any = this.viewer.getPlugin(AssetManagerPlugin)
            const exp = mgr?.exporter
            if (exp?.exportObject) {
                const opts: any = { exportExt: 'glb' }
                if (bits) opts.dracoOptions = { quantizationBits: bits }
                f = await exp.exportObject(this.ringModel, opts)
            }
        } catch (e) { console.warn('webgi export failed', e) }
        if (!f && this.lastRawGlb) {
            f = new File([this.lastRawGlb], (this.currentModelName || 'ring').replace(/\.(glb|gltf)$/i, '') + '.glb', { type: 'model/gltf-binary' })
        }
        if (!f) { showToast('Nothing to export'); return }
        this.downloadBlob(f, ((this.currentModelName || 'ring').replace(/\.(glb|gltf|3dm)$/i, '') || 'ring') + '.glb')
        showToast('GLB exported')
    }

    exportConfig() {
        const cfg = {
            app: 'ring-editor', version: 1,
            model: this.currentModelName || '',
            design: this.getDesign(),
            scale: this.modelScaleTarget ? Math.round((this.modelScaleTarget.scale?.x || 1) * 100) : 100,
        }
        const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
        this.downloadBlob(blob, 'ring-config.json')
        showToast('Config exported')
    }

    async importConfig(file: File) {
        const text = await file.text()
        const cfg = JSON.parse(text)
        if (cfg.design) this.applyDesignFromConfig(cfg.design)
        if (typeof cfg.scale === 'number') this.setScale(cfg.scale)
        showToast('Config imported')
    }

    private applyDesignFromConfig(components: Record<string, EditableState>) {
        for (const [id, state] of Object.entries(components)) {
            const comp = this.findComponent(id) || (this.allComponents().find((c) => c.def.id === id))
            if (!comp) continue
            this.setComponentState(id, state, false)
        }
    }

    private downloadBlob(f: any, name: string) {
        const url = URL.createObjectURL(f)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 4000)
    }

    toggleFullscreen() {
        const el = this.canvas.closest('.app-container') || this.canvas
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else el.requestFullscreen().catch((e: any) => { showToast('Fullscreen unavailable: ' + e.message) })
    }

    // ---------- V2 Studio methods ----------
    private setCameraProductAngle(yaw: number, pitch = 0) {
        this.setView('3d')
        try {
            const cam: any = this.viewer.scene.activeCamera
            if (cam.position) {
                cam.position.y = pitch
                this.viewer.setDirty()
            }
        } catch (e) {}
    }

    setToneMapping(mode: string) {
        const map: Record<string, number> = { acas: 4, no: 0, neutral: 1, reinhard: 3 }
        const s: any = this.viewer.scene
        if (map[mode] !== undefined) s.toneMapping = map[mode]
        try { this.viewer.renderer.refreshPipeline?.() } catch (e) {}
        this.viewer.setDirty()
        showToast('Tone mapping: ' + mode)
    }

    setExposure(v: number) {
        const s: any = this.viewer.scene
        s.toneMappingExposure = v
        try { this.viewer.renderer.refreshPipeline?.() } catch (e) {}
        this.viewer.setDirty()
    }

    setToneParams(kind: 'saturation' | 'contrast', v: number) {
        try { (this.viewer.renderer as any)[kind] = v } catch (e) {}
        try { (this.viewer.renderer as any).onScene?.() } catch (e) {}
        this.viewer.setDirty()
    }

    setFov(v: number) {
        try {
            const cam: any = this.viewer.scene.activeCamera
            cam.setCameraOptions?.({ fov: v })
            cam.aspect = ((this.viewer as any).getSize?.().x) || (this.canvas.width || innerWidth) / ((this.viewer as any).getSize?.().y || (this.canvas.height || innerHeight))
            cam.updateProjectionMatrix?.()
            this.viewer.setDirty()
        } catch (e) {}
    }

    zoomBy(f: number) {
        try {
            const c: any = this.viewer.scene.activeCamera
            const t: any = this.controls?.target
            if (!c || !t) return
            const dir = c.position.clone().sub(t)
            const d = dir.length() * f
            if (d < 0.4) return
            dir.normalize().multiplyScalar(d)
            c.position.copy(t).clone().add(dir)
            this.viewer.setDirty()
        } catch (e) {}
    }

    setAutoRotate(on: boolean) {
        try {
            this.controls.autoRotate = on
            this.controls.autoRotateSpeed = 2.2
            this.controls.update?.()
        } catch (e) {}
        this.viewer.setDirty()
    }

    toggleLoader(show: boolean) {
        const l = document.getElementById('loader')
        if (!l) return
        l.classList.toggle('hidden', !show)
        l.classList.remove('done')
    }

    cycleView(dir: 1 | -1) {
        const base: string[] = ['3d', 'front', 'side', 'top', 'closeup', 'perspective']
        const custom = this.customViews.map((_v) => 'custom' + this.customViews.indexOf(_v))
        const all = base.concat(custom)
        if (all.length === 0) return
        const current = base.indexOf('3d')
        const n = (current + dir + all.length) % all.length
        const sel = all[n]
        if (sel === 'custom') { this.setCustomView(parseInt(sel.replace('custom', ''), 10) || 0); return }
        this.setView(sel)
    }

    async exportImage(kind: 'png' | 'jpeg' | 'webp') {
        try {
            const canvas: any = (this.viewer.renderer as any)?.rendererObject?.domElement || this.canvas
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
            const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b: Blob | null) => (b ? res(b) : rej(new Error('no blob'))), 'image/' + kind, 0.95))
            this.downloadBlob(blob, 'ring-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + kind)
            showToast(kind.toUpperCase() + ' exported')
        } catch (e) { showToast('Export failed: ' + (e as Error).message) }
    }

    private pluginClasses(): Record<string, any> {
        return {
            bloom: BloomPlugin, ssao: SSAOPlugin, outline: OutlinePlugin, vignette: VignettePlugin,
            film: FilmicGrainPlugin, ca: ChromaticAberrationPlugin, ground: GroundPlugin,
            hdriground: HDRiGroundPlugin, diamond: DiamondPlugin, contact: ContactShadowGroundPlugin,
            frame: FrameFadePlugin, progressive: ProgressivePlugin, anis: AnisotropyPlugin,
            fullscreen: FullScreenPlugin, cameraview: CameraViewPlugin, switchnode: SwitchNodePlugin,
            normalbuf: NormalBufferPlugin, sbevel: SSBevelPlugin, cctint: ClearcoatTintPlugin,
            cmap: CustomBumpMapPlugin, nbm: NoiseBumpMaterialPlugin, tfl: ThinFilmLayerPlugin,
            lut: LUTPlugin, ssgi: SSGIPlugin, dof: DepthOfFieldPlugin, text2: SimpleTextPlugin,
        }
    }

    async ensurePlugin(cl: any): Promise<any> {
        let p = this.viewer.getPlugin(cl)
        if (!p) { try { p = await (this.viewer.addPlugin as any)(new cl()) } catch (e) { p = null } }
        return p
    }

    async setPlugin(key: string, on: boolean) {
        const cl = this.pluginClasses()[key]
        if (!cl) { showToast('Unknown plugin: ' + key); return }
        const p = await this.ensurePlugin(cl)
        if (!p) { showToast('Plugin unavailable: ' + key); return }
        try { p.setConfig?.({ enabled: on }) } catch (e) { try { p.enabled = on } catch (e2) {} }
        try { p.onResize?.() } catch (e) {}
        this.viewer.setDirty()
        showToast((on ? 'On: ' : 'Off: ') + key)
    }

    async setProgressive(on: boolean) {
        const p = await this.ensurePlugin(ProgressivePlugin)
        if (!p) { showToast('Progressive unavailable'); return }
        try { p.setConfig?.({ enabled: on }) } catch (e) { try { p.enabled = on } catch (e2) {} }
        this.viewer.setDirty()
    }

    setDirectionalLight(kind: 'intensity' | 'shadowSize' | 'bias' | 'normalBias', v: number) {
        const d = this.dirLight
        if (!d) return
        if (kind === 'intensity') (d as any).intensity = v
        else if (kind === 'shadowSize') { d.shadow.mapSize.width = v; d.shadow.mapSize.height = v; d.shadow.map?.dispose?.(); d.shadow.map = null }
        else if (kind === 'bias') d.shadow.bias = v
        else d.shadow.normalBias = v
        this.viewer.setDirty()
    }

    setLightAngle(az: number) {
        const d = this.dirLight
        if (!d) return
        const r = 13
        const y = 10
        d.position.set(Math.cos(az) * r, y, Math.sin(az) * r)
        try { this.dirLight.target?.updateMatrixWorld?.() } catch (e) {}
        this.viewer.setDirty()
    }

    randomLight(on: boolean, seed = 5) {
        const p = this.ensurePlugin(RandomizedDirectionalLightPlugin)
        if (!p) { showToast('Randomized light unavailable'); return }
        try { p.setConfig?.({ enabled: on, seed, randomParams: { minLightIntensity: 0.4, maxLightIntensity: 0.8 } }) } catch (e) { try { p.enabled = on } catch (e2) {} }
        this.viewer.setDirty()
        showToast('Randomized light: ' + (on ? 'on' : 'off'))
    }

    materialColor(hex: string) {
        const mat = this.selectedMat()
        if (!mat) return
        try { mat.color = new Color(hex) } catch (e) { mat.color?.set(hex) }
        mat.needsUpdate = true
        this.viewer.setDirty()
    }

    setSelectedMat(kind: 'blending' | 'side' | 'flat' | 'wire', v: any) {
        const mat = this.selectedMat()
        if (!mat) return
        try {
            if (kind === 'blending') mat.blending = { none: 0, normal: 1, additive: 2, multiply: 3 }[v as string]
            else if (kind === 'side') mat.side = { front: 0, back: 1, double: 2 }[v as string]
            else if (kind === 'flat') mat.flatShading = !!v
            else if (kind === 'wire') mat.wireframe = !!v
            mat.needsUpdate = true
            this.viewer.setDirty()
        } catch (e) { showToast('Material set failed') }
    }

    clearMaps() {
        const mat = this.selectedMat()
        if (!mat) return
        let n = 0
        for (const k of Object.keys(mat)) {
            if (/Map$/.test(k) && mat[k] && mat[k].isTexture) { mat[k] = null; n++ }
        }
        try { mat.dispose?.() } catch (e) {}
        mat.needsUpdate = true
        this.viewer.setDirty()
        showToast('Cleared ' + n + ' maps')
    }

    private customViews: { name: string; pos: number[]; tgt: number[] }[] = []

    addCurrentView() {
        const cam: any = this.viewer.scene.activeCamera
        const c = this.controls?.target
        if (!cam) return
        const n = this.customViews.length + 1
        this.customViews.push({
            name: 'View ' + n,
            pos: [cam.position.x, cam.position.y, cam.position.z],
            tgt: c ? [c.x, c.y, c.z] : [0, 0, 0],
        })
        showToast('Saved camera as View ' + n)
    }

    setCustomView(i: number) {
        const v = this.customViews[i]
        if (!v) return
        const cam: any = this.viewer.scene.activeCamera
        cam.position.set(...v.pos)
        cam.updateMatrixWorld?.()
        try { this.controls.target.set(...v.tgt); this.controls.update?.() } catch (e) {}
        this.viewer.setDirty()
    }

    hideSelected(off = true) {
        if (!this.selectedObj) { showToast('Select in Hierarchy first'); return }
        this.selectedObj.visible = !off
        this.viewer.setDirty()
        showToast((off ? 'Hidden' : 'Shown') + ' selected')
    }

    deleteSelected() {
        if (!this.selectedObj) { showToast('Select in Hierarchy first'); return }
        const o = this.selectedObj
        o.parent?.remove?.(o)
        try { o.geometry?.dispose?.() } catch (e) {}
        this.clearSelection()
        showToast('Deleted selected')
    }

    addText() {
        const p = this.ensurePlugin(SimpleTextPlugin)
        if (!p) { showToast('Text plugin unavailable'); return }
        try { (p as any).addText?.('HELLO', { fontSize: 0.5 }) } catch (e) { showToast('Text add failed') }
        this.viewer.setDirty()
    }

    private modelTree(): any {
        return (this.ringModel && (this.ringModel.modelObject || this.ringModel)) || this.root || this.ringModel
    }

    buildHierarchy(): { name: string; kind: string }[] {
        const out: { name: string; kind: string }[] = []
        const walk = (o: any, depth: number) => {
            if (!o || depth > 8) return
            if (o.isMesh || o.isGroup || o.isObject3D) {
                let nm = o.name || o.type || 'Node'
                if (o.isMesh) nm += '  [mesh]'
                out.push({ name: nm, kind: o.isMesh ? 'mesh' : 'node' })
            }
            for (const c of o.children || []) walk(c, depth + 1)
        }
        walk(this.modelTree(), 0)
        return out.slice(0, 400)
    }

    selectObject3D(o: any) {
        if (this.selectedObj) {
            try {
                if (this.selectedObj.material) {
                    if (this.selectedObj.material.userData && this.selectedObj.material.userData._oldEmissive !== undefined) {
                        this.selectedObj.material.emissive.set(this.selectedObj.material.userData._oldEmissive)
                        this.selectedObj.material.userData._oldEmissive = undefined
                    }
                }
            } catch (e) {}
        }
        this.selectedObj = o
        if (o && o.material) {
            try {
                o.material.userData._oldEmissive = o.material.emissive.getHex()
                o.material.emissive.set(0x2b6cb0)
                o.material.needsUpdate = true
            } catch (e) {}
        }
        this.viewer.setDirty()
        if (o && o.name) showToast('Selected: ' + o.name)
    }

    clearSelection() { this.selectObject3D(null) }

    private selectedMat(): any {
        if (!this.selectedObj) { showToast('Select a mesh in Hierarchy first'); return null }
        return this.selectedObj.material || (this.selectedObj.isGroup ? null : null)
    }

    async applyMapToSelected(channel: string, url: string) {
        const mat = this.selectedMat()
        if (!mat) return
        try {
            const tl = new TextureLoader()
            const tex: any = await tl.loadAsync(url)
            tex.wrapS = tex.wrapT = 1000
            mat[channel] = tex
            mat.needsUpdate = true
            showToast('Texture → ' + channel)
        } catch (e) { showToast('Texture failed: ' + (e as Error).message) }
        this.viewer.setDirty()
    }

    setSelectedRoughMet(r: number, m: number) {
        const mat = this.selectedMat()
        if (!mat) return
        if (typeof mat.roughness === 'number') mat.roughness = r
        if (typeof mat.metalness === 'number') mat.metalness = m
        mat.needsUpdate = true
        this.viewer.setDirty()
    }

    makeDiamond(r = false) {
        const mats: any[] = []
        const collect = (o: any) => { if (!o) return; if (o.isMesh && o.material) mats.push(o.material); (o.children || []).forEach(collect) }
        if (r && this.selectedObj) collect(this.selectedObj)
        else collect(this.modelTree())
        else return
        for (const m of mats) {
            const base = m.isMeshStandardMaterial ? m : (m.material || null)
            if (!base) continue
            base.userData.isDiamond = true
            base.userData.separateEnvMapIntensity = true
            try { base.envMapIntensity = 2.4 } catch (e) {}
        }
        try { this.diamondPlugin?.refreshEnvMaps?.() } catch (e) {}
        this.viewer.setDirty()
        showToast('Diamond materials: ' + mats.length)
    }

    makeStandard(r = false) {
        const mats: any[] = []
        const collect = (o: any) => { if (!o) return; if (o.isMesh && o.material) mats.push(o.material); (o.children || []).forEach(collect) }
        if (r && this.selectedObj) collect(this.selectedObj)
        else collect(this.modelTree())
        else return
        for (const m of mats) {
            const base = m.isMeshStandardMaterial ? m : (m.material || null)
            if (!base) continue
            base.userData.isDiamond = false
            base.userData.separateEnvMapIntensity = false
            try { base.envMapIntensity = 1 } catch (e) {}
        }
        this.viewer.setDirty()
        showToast('Standard materials: ' + mats.length)
    }

    countDiamonds(): number {
        let n = 0
        const walk = (o: any) => { if (!o) return; if (o.isMesh && /diamond|gem|stone|solit/i.test(o.name)) n++; (o.children || []).forEach(walk) }
        walk(this.modelTree())
        return n
    }

    transformSelected(kind: 'position' | 'rotation' | 'scale', axis: 'x' | 'y' | 'z', val: number) {
        const o = this.selectedObj || this.ringModel
        if (!o) return
        if (kind === 'scale') { if (axis === 'x') o.scale.setScalar(val / 50); this.modelScaleTarget = o }
        else {
            try {
                if (kind === 'position') o.position[axis] = val
                else o.rotation[axis] = (val * Math.PI) / 180
                o.updateMatrixWorld?.()
            } catch (e) {}
        }
        this.viewer.setDirty()
    }

    pivotSelected(mode: 'center' | 'bottom' | 'origin') {
        const o = this.selectedObj
        if (!o || !o.geometry) { showToast('Select a mesh first'); return }
        o.updateMatrixWorld?.(true)
        const g: any = o.geometry
        g.computeBoundingBox()
        const bb = g.boundingBox
        let dx = 0, dy = 0, dz = 0
        if (mode === 'center') { dx = -(bb.min.x + bb.max.x) / 2; dz = -(bb.min.z + bb.max.z) / 2; dy = -(bb.min.y + bb.max.y) / 2 }
        else if (mode === 'bottom') { dy = -bb.min.y; dz = -(bb.min.z + bb.max.z) / 2; dx = -(bb.min.x + bb.max.x) / 2 }
        else { dx = -bb.min.x; dy = -bb.min.y; dz = -bb.min.z }
        g.translate(dx, dy, dz)
        g.computeBoundingSphere()
        this.viewer.setDirty()
        showToast('Pivot: ' + mode)
    }

    setPicking(on: boolean) {
        this.picking = on
        showToast(on ? 'Pick mode on — click a part' : 'Pick mode off')
    }

    pickAt(px: number, py: number) {
        const size = ((this.viewer as any).getSize?.()) || { x: this.canvas.width || innerWidth, y: this.canvas.height || innerHeight }
        const rc = new Raycaster()
        const ndc = new Vector2((px / size.x) * 2 - 1, -(py / size.y) * 2 + 1)
        rc.setFromCamera(ndc, this.viewer.scene.activeCamera as any)
        const root = this.modelTree()
        const hits = root ? rc.intersectObjects([root], true) : []
        if (hits.length) this.selectObject3D(hits[0].object as any)
        else this.clearSelection()
    }

    addPrimitive(kind: string) {
        let geo: any
        switch (kind) {
            case 'plane': geo = new PlaneGeometry(2, 2); break
            case 'box': geo = new BoxGeometry(1.2, 1.2, 1.2); break
            case 'sphere': geo = new SphereGeometry(0.9, 32, 24); break
            case 'circle': geo = new CircleGeometry(0.9, 48); break
            case 'torus': geo = new TorusGeometry(0.7, 0.25, 16, 48); break
            case 'cylinder': geo = new CylinderGeometry(0.6, 0.6, 1.4, 32); break
            default: return
        }
        const mat = new MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.35 })
        const m = new Mesh(geo, mat)
        m.position.y = kind === 'plane' || kind === 'circle' ? 0 : 0.8
        m.castShadow = true
        m.receiveShadow = true
        try { (this.viewer.scene as any).add(m) } catch (e) { try { this.ringModel?.parent?.add?.(m) } catch (e2) {} }
        this.viewer.setDirty()
        showToast('Added ' + kind)
    }

    async rainbow(on: boolean) {
        this.rainbowOn = on
        if (!on) return
        const mats: any[] = []
        const walk = (o: any) => { if (!o) return; if (o.isMesh && o.material && /diamond|gem|stone|solit/i.test(o.name)) mats.push(o.material); (o.children || []).forEach(walk) }
        walk(this.modelTree())
        let hue = 0
        while (this.rainbowOn) {
            hue = (hue + 0.01) % 1
            const c = new Color()
            c.setHSL(hue, 0.85, 0.62)
            for (const m of mats) { try { m.color.copy(c); m.needsUpdate = true } catch (e) {} }
            this.viewer.setDirty()
            await new Promise((r) => setTimeout(r, 60))
        }
    }

    autoCenterRoot() {
        const o = this.modelScaleTarget || this.ringModel
        if (!o) return
        o.updateMatrixWorld?.(true)
        const box = new Box3().setFromObject(o)
        if (box.isEmpty()) return
        const c = box.getCenter(new Vector3())
        box.getSize(new Vector3())
        o.position.x -= c.x
        o.position.y -= c.y
        o.position.z -= c.z
        this.viewer.setDirty()
        showToast('Auto-centered')
    }

    clearLocal() {
        try { localStorage.clear() } catch (e) {}
        showToast('Local storage cleared')
    }

    shareLink(kind: 'viewer' | 'editor' | 'copy') {
        const u = new URL(window.location.href)
        u.searchParams.set('lite', kind === 'viewer' ? '1' : '0')
        try { navigator.clipboard.writeText(u.href) } catch (e) {}
        showToast(kind + ' link copied')
    }

    exportViewerConfig() {
        const cfg = {
            app: 'ring-editor', type: 'viewer-config', generated: new Date().toISOString(),
            modelUrl: this.config.modelUrl,
            design: this.getDesign(),
            scale: this.modelScaleTarget ? Math.round((this.modelScaleTarget.scale?.x || 1) * 100) : 100,
            env: (this.viewer.scene as any)?.envMap?.uuid || null,
            toneMapping: (this.viewer.scene as any)?.toneMapping || 4,
            exposure: (this.viewer.scene as any)?.toneMappingExposure || 1.2,
        }
        const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
        this.downloadBlob(blob, 'ring-viewer-config.json')
        showToast('Viewer config exported')
    }

    makeSelectedMeshMesh() {}
}

/* ============================================================
   Wire up page
   ============================================================ */

function showToast(msg: string) {
    const t = document.getElementById('editor-toast')
    if (!t) return
    t.textContent = msg
    t.classList.add('show')
    clearTimeout((showToast as any)._t)
    ;(showToast as any)._t = setTimeout(() => t.classList.remove('show'), 2600)
}

function loadConfigFromParams(): EditorConfig {
    const params = new URLSearchParams(window.location.search)
    // inline config global
    const inline = __win.__EDITOR_CONFIG
    if (inline && inline.components) return inline as EditorConfig
    // ?config=<json>
    const cfgParam = params.get('config')
    if (cfgParam) {
        try { return JSON.parse(decodeURIComponent(cfgParam)) as EditorConfig } catch (e) {}
    }
    // embedded <script id="editor-config">
    const el = document.getElementById('editor-config')
    if (el && el.textContent) {
        try {
            const js = JSON.parse(el.textContent.trim())
            if (js && js.components) return js as EditorConfig
        } catch (e) {}
    }
    // known model by basename
    const modelParam = params.get('model')
    if (modelParam) {
        const base = modelParam.split('/').pop()
        const known = (DEFAULT_CONFIGS as any)[base as any] as EditorConfig | undefined
        if (known) return known
    }
    return DEFAULT_CONFIGS['LRS-02.glb']
}

function needJump(config: EditorConfig) {
    const params = new URLSearchParams(window.location.search)
    const model = params.get('model')
    if (!model || model === config.modelUrl) return false
    const base = model.split('/').pop()
    return !((DEFAULT_CONFIGS as any)[base as any])
}

async function boot() {
    const editor = new RingEditor(document.getElementById('editor-app') as HTMLElement, loadConfigFromParams())
    try {
        await editor.init()
    } catch (e) {
        console.error('editor init failed', e)
        diag.fail('init', e)
    }

    const params = new URLSearchParams(window.location.search)

    // load model
    // ?model may be a bare filename (m01_main.glb) or a full path — normalize
    const modelParam = params.get('model')
    const modelUrl = modelParam
        ? (modelParam.includes('/') || modelParam.includes('\\') ? modelParam : './assets/' + modelParam.split('/').pop())
        : editor.config.modelUrl
    try {
        await editor.loadModelFile(modelUrl)
    } catch (e) {
        console.error('model load failed', e)
        const msg = (e as Error).message || 'unknown error'
        diag.fail('model load', e)
        diag.milestone('load:FAILED')
        const loader = document.getElementById('loader')
        if (loader) { loader.innerHTML = `<div class="ld-t" style="color:#e44">Failed to load model</div><div class="ld-t" style="font-size:11px;max-width:280px;line-height:1.4;margin-top:8px">${msg}</div>` }
        showToast('Model failed to load: ' + msg)
        return
    }

    // restore design if present
    const designParam = params.get('design')
    if (designParam) {
        try {
            const d = JSON.parse(decodeURIComponent(designParam))
            if (d && d.components) {
                setTimeout(() => applyDesign(d.components), 400)
            }
        } catch (e) { console.warn('design param', e) }
    }

    // ?metals= — restrict material library and apply the first allowed finish
    const metalsParam = (params.get('metals') || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (metalsParam.length) {
        const first = (metalsParam.includes('Platinum') ? 'Platinum' : null) || (metalsParam.includes('14K White Gold') ? '14K White Gold' : null) || metalsParam[0]
        if (METAL_NAMES.includes(first)) {
            setTimeout(() => { try { editor.applyMetalLibrary(first) } catch (e) {} }, 600)
        }
    }

    // expose window api
    ;(window as any).__ED_api = {
        select: (id: string) => editor.selectComponent(id),
        setMetal: (id: string, c: string) => editor.setMetal(id, c),
        setStone: (id: string, p: any) => editor.setStone(id, p),
        setView: (m: string) => editor.setView(m),
        undo: () => editor.undo(),
        redo: () => editor.redo(),
        reset: () => editor.resetToOriginal(),
        designs: () => editor.getDesign(),
        metalLib: (name: string) => editor.applyMetalLibrary(name),
        bg: (v: string) => editor.applyBackground(v),
    }

    // ---- toolbar wiring ----
    const add = (id: string, fn: () => void) => {
        const b = document.getElementById(id)
        if (b) b.addEventListener('click', fn)
    }
    add('view-3d', () => editor.setView('3d'))
    add('view-front', () => editor.setView('front'))
    add('view-side', () => editor.setView('side'))
    add('view-top', () => editor.setView('top'))
    add('view-closeup', () => editor.setView('closeup'))
    add('view-perspective', () => editor.setView('perspective'))
    add('btn-undo', () => editor.undo())
    add('btn-redo', () => editor.redo())
    add('btn-reset', () => editor.resetToOriginal())
    add('btn-save', () => { editor.saveDesignToStorage(); editor.downloadDesign(); showToast('Design saved') })
    add('btn-share', () => { const u = editor.shareDesign(); showToast('Design link copied') })
    add('btn-cart', () => editor.addToCart())
    add('btn-quote', () => editor.requestQuote())

    // mobile properties sheet
    const sheet = document.getElementById('mobilesheet')
    add('mobileprop', () => { if (sheet) sheet.classList.toggle('open') })
    add('ms-close', () => { if (sheet) sheet.classList.remove('open') })

    // lite-mode chip
    const liteChip = document.getElementById('lite-chip')
    if (liteChip && editor.lite) {
        liteChip.classList.add('show')
        liteChip.title = 'Mobile-optimized mode. Add ?lite=0 to force full quality.'
    }

    // model selector — switch demo config, preserve design
    const modelSel = document.getElementById('model-sel') as HTMLSelectElement | null
    if (modelSel) {
        const cur = (modelUrl || editor.config.modelUrl).split('/').pop()
        if (cur && modelSel.querySelector(`option[value="${cur}"]`)) modelSel.value = cur
        modelSel.addEventListener('change', () => {
            const u = new URL(window.location.href)
            u.searchParams.set('model', modelSel.value)
            const d = editor.getDesign()
            if (d && d.components) u.searchParams.set('design', encodeURIComponent(JSON.stringify(d.components)))
            window.location.href = u.href
        })
    }

    window.addEventListener('editor:history', (e: any) => {
        const u = document.getElementById('btn-undo') as HTMLButtonElement
        const r = document.getElementById('btn-redo') as HTMLButtonElement
        if (u) u.disabled = !e.detail.canUndo
        if (r) r.disabled = !e.detail.canRedo
    })

    // --- V2 Studio panel (playground.ijewel3d.com/v2 style) ---
    const stSections = document.getElementById('st-sections')
    const RUN: Record<string, (v: any) => any> = {
        tm: (v) => editor.setToneMapping(v),
        exp: (v) => editor.setExposure(v),
        sat: (v) => editor.setToneParams('saturation', v),
        con: (v) => editor.setToneParams('contrast', v),
        fs: () => editor.toggleFullscreen(),
        loader: () => editor.toggleLoader(true),
        view: (v) => editor.setView(v),
        fov: (v) => editor.setFov(v),
        zIn: () => editor.zoomBy(0.82),
        zOut: () => editor.zoomBy(1.22),
        autoRot: (on) => editor.setAutoRotate(on),
        nview: () => editor.cycleView(1),
        pview: () => editor.cycleView(-1),
        pick: (on) => editor.setPicking(on),
        env: (v) => editor.applySceneEnv(v),
        gem: (v) => editor.applyGemEnv(v),
        pg: (v) => editor.applyPlayground(v),
        bg: (v) => editor.applyBackground(v),
        transBg: () => { editor.applyBackground('default'); showToast('Transparent cleared (transparent bg needs alpha canvas)') },
        bgimg: (url) => { if (url) { editor.applySceneEnv(url).then(() => showToast('Background image applied')) } },
        plugin: (key) => {
            const el = document.querySelector<HTMLInputElement>('.plg-' + key)
            editor.setPlugin(key, el ? el.checked : true)
        },
        lightOn: (int) => editor.setDirectionalLight('intensity', int),
        shSize: (v) => editor.setDirectionalLight('shadowSize', parseInt(v, 10)),
        sbias: (v) => editor.setDirectionalLight('bias', v),
        snbias: (v) => editor.setDirectionalLight('normalBias', v),
        lang: (v) => editor.setLightAngle(parseFloat(v)),
        rlight: (on) => {
            const seed = parseInt((document.querySelector('[data-op="rseed"]') as HTMLInputElement)?.value || '5', 10)
            editor.randomLight(!!on, seed)
        },
        rseed: (v) => editor.randomLight(!!(document.querySelector('[data-op="rlight"]') as HTMLInputElement)?.checked, parseInt(v, 10) || 5),
        metalLib: (v) => editor.applyMetalLibrary(v),
        mkD: () => editor.makeDiamond(false),
        mkDi: () => editor.makeDiamond(true),
        mkS: () => editor.makeStandard(false),
        cntD: () => showToast('Diamond meshes: ' + editor.countDiamonds()),
        rainbow: (on) => editor.rainbow(on),
        glb: (v) => editor.exportGLB(v ? parseInt(v, 10) : undefined),
        expcfg: () => editor.exportConfig(),
        expall: () => editor.exportViewerConfig(),
        img: (k) => editor.exportImage(k),
        center: () => editor.autoCenterRoot(),
        clear: () => editor.clearLocal(),
        shareViewer: () => editor.shareLink('viewer'),
        reset: () => editor.resetToOriginal(),
        close: () => document.getElementById('studio')?.classList.remove('open'),
        addview: () => editor.addCurrentView(),
        hidSel: () => editor.hideSelected(true),
        shwSel: () => editor.hideSelected(false),
        delSel: () => editor.deleteSelected(),
        matcol: (v) => editor.materialColor(v),
        blend: (v) => editor.setSelectedMat('blending', v),
        side: (v) => editor.setSelectedMat('side', v),
        flat: (on) => editor.setSelectedMat('flat', on),
        wire: (on) => editor.setSelectedMat('wire', on),
        clrmap: () => editor.clearMaps(),
        text: () => editor.addText(),
        caches: () => { (caches as any)?.keys?.().then((ks: string[]) => Promise.all(ks.map((k: string) => (caches as any)?.delete?.(k))))?.catch?.(() => {}); showToast('Caches cleared') },
        dbg: (on) => { (window as any).__debug = !!on }
    }
    const stRun = (el: any) => {
        const op = el.dataset?.op
        if (!op) return
        const fn = RUN[op]
        if (fn) fn(el.dataset?.arg)
    }
    if (stSections) {
        const sec = (h: string, open = false, html = '') => {
            const d = document.createElement('div')
            d.className = 'st-sec' + (open ? ' open' : '')
            d.innerHTML = `<div class="st-sec-h"><span>${h}</span><span class="st-cur"></span><span class="arrow">▸</span></div><div class="st-sec-body">${html}</div>`
            ;(d.querySelector('.st-sec-h') as HTMLElement).addEventListener('click', () => d.classList.toggle('open'))
            return d
        }
        const sel = (op: string, options: [string, string][], cur = '') => `<div class="st-row"><select class="st-select" data-op="${op}">${options.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('')}</select><span class="st-cur" hidden></span></div>`
        const rng = (op: string, min: number, max: number, step: number, val: number, label: string) => `<div class="st-row"><div class="st-label">${label} <span class="st-slider-val" data-v></span></div><input type="range" class="st-slider" data-op="${op}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`
        const btns = (btns: [string, string, string?][], rev = false) => `<div class="st-btns">${btns.map(([label, op, arg]) => `<button class="st-btn${rev ? ' rev' : ''}" data-op="${op}" data-arg="${arg || ''}">${label}</button>`).join('')}</div>`
        const chk = (op: string, label: string, checked = false) => `<label class="st-row ln" style="cursor:pointer"><span>${label}</span><input type="checkbox" data-op="${op}" ${checked ? 'checked' : ''}></label>`
        const file = (op: string, label: string, accept: string, dataKey = '') => `<label class="st-row ln" style="cursor:pointer"><span>${label}</span><input type="file" class="st-file" data-op="${op}" data-k="${dataKey}" accept="${accept}"></label>`
        const swatches = (op: string, list: [string, string][]) => `<div class="st-swatches">${list.map(([v, c]) => `<span class="st-swatch" title="${v}" data-op="${op}" data-arg="${v}" style="background:${c}"></span>`).join('')}</div>`

        const bgList: [string, string][] = [['default', '#111111'], ['charcoal', '#242427'], ['graphite', '#33333a'], ['white', '#ffffff'], ['gold', '#2a2413'], ['blush', '#2b1d1d']]
        const camViews: [string, string][] = [['3d', '3D'], ['front', 'Front'], ['side', 'Side'], ['top', 'Top'], ['closeup', 'Closeup'], ['perspective', 'Perspective']]
        const metalOpts: [string, string][] = ACTIVE_METALS.map((n) => [n, n])
        const metals = ACTIVE_METALS[0] || METAL_NAMES[0]

        const pluginToggles = [
            ['bloom', 'Bloom'], ['ssao', 'SSAO'], ['outline', 'Outlines'], ['vignette', 'Vignette'],
            ['film', 'Film Grain'], ['ca', 'Chromatic Aberration'], ['ground', 'Ground'],
            ['hdriground', 'HDRi Ground'], ['diamond', 'Diamonds'], ['contact', 'Contact Shadows'],
            ['normalbuf', 'Normal Buffer'], ['progressive', 'Progressive'], ['frame', 'Frame Fade'],
            ['anis', 'Anisotropy'], ['switch', 'Switch Node'], ['fullscreen', 'FullScreen'],
            ['cameraview', 'Camera Views'], ['sbevel', 'SS Bevel'], ['cctint', 'Clearcoat Tint'],
            ['cmap', 'Custom Bump Map'], ['nbm', 'Noise Bump'], ['tfl', 'Thin Film Layer'],
            ['lut', 'LUT'], ['ssgi', 'SS GI'], ['dof', 'Depth of Field'],
        ]

        const chainElements = () => {
            const mapRow: [string, string][] = [
                ['map', 'Color Map'], ['roughnessMap', 'Roughness'], ['metalnessMap', 'Metalness'],
                ['normalMap', 'Normal'], ['bumpMap', 'Bump'], ['aoMap', 'AO'],
                ['emissiveMap', 'Emissive'], ['thicknessMap', 'Thickness'], ['transmissionMap', 'Transmission'],
                ['sheenColorMap', 'Sheen Color'], ['clearcoatMap', 'Clearcoat'], ['clearcoatRoughnessMap', 'CC Rough'],
                ['clearcoatNormalMap', 'CC Normal'], ['iridescenceMap', 'Iridescence'],
            ]
            return mapRow.map(([k, l]) => file('mapS', '▲ ' + l, 'image/*', k)).join('')
        }

        stSections.appendChild(sec('File', true, btns([['Share Viewer Link', 'shareViewer'], ['Reset Config', 'reset'], ['Close', 'close']], true)))
        stSections.appendChild(sec('Renderer', false,
            sel('tm', [['acas', 'ACES Filmic'], ['no', 'No Tone Mapping'], ['neutral', 'Neutral'], ['reinhard', 'Reinhard']], 'acas') +
            rng('exp', 0.2, 3, 0.01, 1.2, 'Exposure') +
            rng('sat', -2, 2, 0.02, 0, 'Saturation') +
            rng('con', 0, 3, 0.02, 1, 'Contrast') +
            btns([['Full Screen', 'fs'], ['Show Loader', 'loader']])))
        stSections.appendChild(sec('Camera', false,
            sel('view', camViews, '3d') +
            rng('fov', 10, 100, 1, 45, 'FOV') +
            btns([['Zoom in', 'zIn'], ['Zoom out', 'zOut'], ['Focus Prev', 'pview'], ['Focus Next', 'nview'], ['Save Current View', 'addview']]) +
            chk('autoRot', 'Auto rotate')))
        stSections.appendChild(sec('Drop Options', false,
            file('modelFile', 'Load 3D file (.glb/.gltf/.3dm)', '.glb,.gltf,.3dm')))
        stSections.appendChild(sec('Background / Environment', false,
            '<div class="st-label">Background</div>' + swatches('bg', bgList) +
            chk('transBg', 'Transparent BG') +
            '<div class="st-label" style="margin-top:6px">Environment</div>' + sel('env', [['none', 'Off'], ['./assets/hdrmaps/metal/env-metal-001.hdr', 'Playground Metal 1'], ['./assets/hdrmaps/metal/env-metal-002.exr', 'Playground Metal 2'], ['./assets/hdrmaps/metal/env-metal-003.hdr', 'Playground Metal 3'], ['./assets/env_metal_001.hdr', 'Studio Light'], ['./assets/env_metal_studio.hdr', 'Studio HDR']]) +
            '<div class="st-label" style="margin-top:6px">Gem Environment</div>' + sel('gem', [['none', 'Off'], ['./assets/hdrmaps/gem/env-gem-001.exr', 'PG Sparkle 1'], ['./assets/hdrmaps/gem/env-gem-002.exr', 'PG Sparkle 2'], ['./assets/hdrmaps/gem/env-gem-003.hdr', 'PG Sparkle 3'], ['./assets/hdrmaps/gem/env-gem-004.exr', 'PG Sparkle 4'], ['./assets/env_gem_002.exr', 'Gem Sparkle']]) +
            '<div class="st-label" style="margin-top:6px">Playground Presets</div>' + sel('pg', [['none', 'Off'], ['pg1', 'SS 1 (Metal 1 + Gem 1)'], ['pg2', 'SS 2 (Metal 2 + Gem 2)'], ['pg3', 'SS 3 (Metal 3 + Gem 3)'], ['pg4', 'SS 4 (Metal 3 + Gem 4)']]) +
            '<div class="st-label" style="margin-top:6px">Background Sampler (image)</div>' + file('bgimgFile', 'Pick image', 'image/*')))
        stSections.appendChild(sec('Asset Export', false,
            '<div class="st-label">GLB</div>' + sel('glb', [['', 'GLB (default)'], ['8', 'DRACO Q8'], ['12', 'DRACO Q12'], ['16', 'DRACO Q16']]) + btns([['Download GLB', 'glb'], ['Export Config', 'expcfg'], ['Export Viewer Config', 'expall'], ['Import Config', 'cfgpick']]) +
            file('cfgFile', 'Import .json config', '.json')))
        stSections.appendChild(sec('Plugins / PostFX', false,
            '<div class="st-grid">' + pluginToggles.map(([k, l]) => `<label class="st-row ln" style="cursor:pointer;font-size:11px"><span>${l}</span><input type="checkbox" class="plg-${k}" data-op="plugin" data-arg="${k}"></label>`).join('') + '</div>'))
        stSections.appendChild(sec('Directional Light', false,
            rng('lightOn', 0, 8, 0.1, 3, 'Intensity') +
            rng('lang', 0, 6.28, 0.05, 0.9, 'Angle (rad)') +
            sel('shSize', [['1024', 'Shadow 1024'], ['2048', 'Shadow 2048'], ['4096', 'Shadow 4096']], '2048') +
            rng('sbias', -0.01, 0.01, 0.0001, -0.0001, 'Shadow bias') +
            rng('snbias', 0, 0.1, 0.001, 0.02, 'Normal bias') +
            '<div class="st-label">Randomized Light</div>' + chk('rlight', 'Enabled') + rng('rseed', 1, 100, 1, 5, 'Seed')))
        stSections.appendChild(sec('Material Library', false,
            sel('metalLib', metalOpts, metals) +
            '<div class="st-label" style="margin-top:6px">Diamonds</div>' +
            btns([['Make Diamond (all)', 'mkD'], ['Make Diamond (sel)', 'mkDi'], ['Make Standard', 'mkS'], ['Count', 'cntD']]) +
            chk('rainbow', 'Rainbow diamonds')))
        stSections.appendChild(sec('Physical Material', false,
            '<div class="st-label">Select a mesh in Hierarchy first, then:</div>' +
            rng('rough', 0, 1, 0.01, 0.35, 'Roughness') + rng('metal', 0, 1, 0.01, 0.9, 'Metalness') +
            '<div class="st-label">Color</div>' + `<label class="st-row ln" style="cursor:pointer;font-size:11px"><span>Base Color</span><input type="color" data-op="matcol" value="#ffffff"></label>` +
            '<div class="st-label">Rendering</div>' +
            sel('blend', [['normal', 'Normal Blending'], ['none', 'None'], ['additive', 'Additive'], ['multiply', 'Multiply']], 'normal') +
            sel('side', [['double', 'Double Side'], ['front', 'Front'], ['back', 'Back']], 'double') +
            chk('flat', 'Flat shading') + chk('wire', 'Wireframe') +
            btns([['Clear All Maps', 'clrmap']]) +
            '<div class="st-grid">' + chainElements() + '</div>'))
        stSections.appendChild(sec('Hierarchy', true,
            btns([['Refresh', 'hier'], ['Auto-Center All', 'center'], ['Hide', 'hidSel'], ['Show', 'shwSel'], ['Delete', 'delSel']], true) + '<div class="st-row" id="st-tree"></div>'))
        stSections.appendChild(sec('Transform Controls', false,
            '<div class="st-grid">' +
            rng('tpx', -2, 2, 0.01, 0, 'Pos X').replace('data-op="tpx"', 'data-op="tpx"') +
            rng('tpy', -2, 2, 0.01, 0, 'Pos Y') +
            rng('tpz', -2, 2, 0.01, 0, 'Pos Z') +
            rng('trx', -180, 180, 1, 0, 'Rot X') +
            rng('try', -180, 180, 1, 0, 'Rot Y') +
            rng('trz', -180, 180, 1, 0, 'Rot Z') +
            rng('tscl', 50, 200, 1, 100, 'Scale %') + '</div>' +
            '<div class="st-label">Pivot (selected mesh)</div>' + btns([['Center', 'pv', 'center'], ['Bottom', 'pv', 'bottom'], ['Origin', 'pv', 'origin']], true)))
        stSections.appendChild(sec('Ground', false,
            chk('grdOn', 'Shadow Floor', false) +
            rng('grdSize', 1, 20, 0.5, 6, 'Size') +
            rng('grdY', -2, 2, 0.01, 0, 'Y Offset')))
        stSections.appendChild(sec('Generate Geometry', false,
            '<div class="st-grid">' + ['plane', 'box', 'sphere', 'circle', 'torus', 'cylinder'].map((k) => `<button class="st-btn" data-op="prim" data-arg="${k}">${k}</button>`).join('') + '</div>'))
        stSections.appendChild(sec('Picker', false,
            chk('pick', 'Enable Click-to-Select') + '<div class="st-label" style="margin-top:6px">Click any part of the model to select it (emissive highlight). Then use Physical Material / Transform / Diamonds on the selection.</div>'))
        stSections.appendChild(sec('Image / Snapshot', false,
            btns([['Download .png', 'img', 'png'], ['Download .jpeg', 'img', 'jpeg'], ['Download .webp', 'img', 'webp']])))
        stSections.appendChild(sec('Model Stage / Uploads', false,
            sel('samp2', [['m09_sigli_head.glb', 'm09 Sigli Head'], ['m01_main.glb', 'm01 Main'], ['m10_sigli_shank.glb', 'm10 Sigli Shank'], ['LRS-02.glb', 'LRS-02']], 'm09_sigli_head.glb') +
            btns([['Load Sample', 'samp'], ['Auto-Center', 'center'], ['Rhino .3dm', 'file3dm'], ['Share Viewer Link', 'shareViewer']], true) + file('modelFile2', 'Load model again', '.glb,.gltf,.3dm')))
        stSections.appendChild(sec('Extras', false,
            btns([['Add Text (SimpleText)', 'text'], ['Clear Caches', 'caches'], ['Clear Local Storage', 'clear']], true) + chk('dbg', 'Debug console')))

        // animations (only if model has any)
        const animWrap = document.createElement('div')
        animWrap.id = 'st-anim'
        animWrap.className = 'st-sec'
        animWrap.style.display = 'none'
        animWrap.innerHTML = `<div class="st-sec-h"><span>GLTF Animations</span><span class="arrow">▸</span></div><div class="st-sec-body"><div class="st-btns"><button class="st-btn" data-op="anim" data-arg="play">Play</button><button class="st-btn" data-op="anim" data-arg="stop">Stop</button><button class="st-btn" data-op="anim" data-arg="reset">Reset</button></div></div>`
        ;(animWrap.querySelector('.st-sec-h') as HTMLElement).addEventListener('click', () => animWrap.classList.toggle('open'))
        stSections.appendChild(animWrap)

        // physical material sliders + transform + ground sliders (need live values)
        stSections.addEventListener('input', (ev: any) => {
            const t: any = ev.target
            const v = t.value
            if (t.dataset && t.dataset.v) t.dataset.v = v
            const lbl = t.closest('.st-row')?.querySelector('.st-slider-val')
            if (lbl) lbl.textContent = v
            if (t.dataset && t.dataset.op === 'tpx') editor.transformSelected('position', 'x', parseFloat(v))
            else if (t.dataset && t.dataset.op === 'tpy') editor.transformSelected('position', 'y', parseFloat(v))
            else if (t.dataset && t.dataset.op === 'tpz') editor.transformSelected('position', 'z', parseFloat(v))
            else if (t.dataset && t.dataset.op === 'trx') editor.transformSelected('rotation', 'x', parseFloat(v))
            else if (t.dataset && t.dataset.op === 'try') editor.transformSelected('rotation', 'y', parseFloat(v))
            else if (t.dataset && t.dataset.op === 'trz') editor.transformSelected('rotation', 'z', parseFloat(v))
            else if (t.dataset && t.dataset.op === 'tscl') editor.setScale(parseFloat(v))
            else if (t.dataset && t.dataset.op === 'rough' || t.dataset && t.dataset.op === 'metal') editor.setSelectedRoughMet(
                parseFloat((stSections.querySelector('[data-op="rough"]') as HTMLInputElement)?.value || '0.35'),
                parseFloat((stSections.querySelector('[data-op="metal"]') as HTMLInputElement)?.value || '0.9'))
            else if (t.dataset && t.dataset.op === 'grdSize') { editor.applyGround(true); editor.setGroundSize(parseFloat(v)) }
        })
        stSections.addEventListener('change', (ev: any) => {
            const t: any = ev.target
            if (t.dataset && t.dataset.op === 'grdOn') editor.applyGround(!!t.checked)
            else if (t.dataset && t.dataset.op === 'grdY') editor.setGroundOffset(parseFloat(t.value))
            else if (t.dataset && t.dataset.op === 'modelFile' || t.dataset && t.dataset.op === 'modelFile2') {
                const f = t.files && t.files[0]
                if (f) editor.uploadModelFile(f).then(() => showToast('Model loaded')).catch((e: any) => showToast('Load failed: ' + e.message))
                t.value = ''
            } else if (t.dataset && t.dataset.op === 'cfgFile') {
                const f = t.files && t.files[0]
                if (f) editor.importConfig(f).catch((e: any) => showToast('Config failed: ' + e.message))
                t.value = ''
            } else if (t.dataset && t.dataset.op === 'mapS') {
                const f = t.files && t.files[0]
                if (f) {
                    const url = URL.createObjectURL(f)
                    editor.applyMapToSelected(t.dataset.k, url).finally(() => setTimeout(() => URL.revokeObjectURL(url), 5000))
                }
                t.value = ''
            } else if (t.dataset && t.dataset.op === 'bgimgFile') {
                const f = t.files && t.files[0]
                if (f) {
                    const url = URL.createObjectURL(f)
                    editor.applySceneEnv(url).then(() => showToast('Background sampler applied')).catch((e: any) => showToast('Sampler failed: ' + e.message)).finally(() => setTimeout(() => URL.revokeObjectURL(url), 5000))
                }
                t.value = ''
            } else if (t.dataset && t.dataset.op && RUN[t.dataset.op]) {
                RUN[t.dataset.op](t.value !== undefined ? t.value : t.dataset.arg)
            }
        })
        stSections.addEventListener('click', (ev: any) => {
            const t: any = (ev.target as HTMLElement).closest('[data-op]')
            if (!t) return
            const op = t.dataset.op
            if (op === 'hier') {
                const tree = document.getElementById('st-tree')
                if (!tree) return
                const rows = editor.buildHierarchy()
                tree.innerHTML = rows.map((r, i) => `<div class="st-row ln" style="cursor:pointer;font-size:11px;padding:2px 0" data-hi="${i}"><span>${r.name}</span><span>${r.kind}</span></div>`).join('')
            } else if (op === 'file3dm') {
                ;(document.querySelector('[data-op="modelFile"]') as HTMLInputElement)?.click()
            } else if (op === 'cfgpick') {
                ;(stSections.querySelector('[data-op="cfgFile"]') as HTMLInputElement)?.click()
            } else if (op === 'samp') {
                const m = (document.querySelector('[data-op="samp2"]') as HTMLSelectElement)?.value || 'm09_sigli_head.glb'
                window.location.href = 'https://ring-options.pages.dev/ring-editor?lite=1&model=' + m
            } else if (op === 'prim') {
                editor.addPrimitive(t.dataset.arg)
            } else if (op === 'pv') {
                editor.pivotSelected(t.dataset.arg)
            } else if (op === 'anim') {
                editor.studioAnimation(t.dataset.arg)
            } else if (op === 'grdOn') {
                // handled in change
            } else {
                stRun(t as any)
            }
        })
        // hierarchy row click selects object
        stSections.addEventListener('click', (ev: any) => {
            const row: any = (ev.target as HTMLElement).closest('[data-hi]')
            if (!row) return
            const i = parseInt(row.dataset.hi, 10)
            const objs: any[] = []
            const walk = (o: any) => { if (!o) return; objs.push(o); (o.children || []).forEach(walk) }
            walk(editor.modelTree())
            if (objs[i]) editor.selectObject3D(objs[i])
        })
        window.addEventListener('editor:model', () => { animWrap.style.display = editor.hasAnimations() ? '' : 'none' })

        // --- v2 mode rail: group sections under playground modes ---
        const MODES: [string, string, string][] = [
            ['viewer', 'Viewer', '◉'], ['picking', 'Picking', '✚'], ['scene', 'Scene', '▦'],
            ['aa', 'Anti-aliasing', '◆'], ['post', 'Post Processing', '✦'], ['export', 'Export', '⭳'],
            ['animations', 'Animations', '⏵'], ['mods', 'Modifiers', '⚙'], ['cfg', 'Configurators', '☰'],
            ['plugins', 'Plugins', '⌁'],
        ]
        const modeOf: Record<string, string> = {
            'Camera': 'viewer', 'Background / Environment': 'viewer', 'Ground': 'viewer',
            'Picker': 'picking',
            'Hierarchy': 'scene', 'Transform Controls': 'scene', 'Directional Light': 'scene', 'Physical Material': 'scene',
            'Renderer': 'aa',
            'Plugins / PostFX': 'post',
            'Asset Export': 'export', 'Image / Snapshot': 'export', 'File': 'export',
            'Animations': 'animations', 'GLTF Animations': 'animations',
            'Material Library': 'mods', 'Generate Geometry': 'mods',
            'Model Stage / Uploads': 'cfg', 'Drop Options': 'cfg',
            'Extras': 'plugins',
        }
        const studSecs = Array.from(stSections.querySelectorAll('.st-sec'))
        studSecs.forEach((d) => {
            const t = d.querySelector('.st-sec-h span')
            if (!t) return
            d.dataset.mode = modeOf[t.textContent.trim()] || 'plugins'
        })
        const rail = document.getElementById('pg-modes')
        if (rail) {
            rail.innerHTML = MODES.map((m, i) => `<button class="mode-btn${i === 0 ? ' on' : ''}" data-mode="${m[0]}" title="${m[1]}"><span class="mi">${m[2]}</span><span>${m[1]}</span></button>`).join('')
            const applyMode = (m: string) => {
                rail.querySelectorAll('.mode-btn').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.mode === m))
                studSecs.forEach((d) => {
                    const show = d.dataset.mode === m
                    d.style.display = show ? '' : 'none'
                    if (show) d.classList.add('open')
                    else d.classList.remove('open')
                })
            }
            applyMode('viewer')
            rail.addEventListener('click', (ev: any) => {
                const b: HTMLElement | null = ev.target.closest('.mode-btn')
                if (b) applyMode(b.dataset.mode || 'viewer')
            })
        }
    }
    document.getElementById('btn-studio')?.addEventListener('click', () => document.getElementById('studio')?.classList.add('open'))
    document.getElementById('st-close')?.addEventListener('click', () => document.getElementById('studio')?.classList.remove('open'))
    document.getElementById('st-share')?.addEventListener('click', () => editor.shareLink('viewer'))
    document.getElementById('btn-fs')?.addEventListener('click', () => editor.toggleFullscreen())
    editor.canvas.addEventListener('pointerdown', (e: any) => { if ((editor as any).picking) editor.pickAt(e.clientX, e.clientY) })

    // --- drag & drop any model file onto the whole app ---
    const dropov = document.getElementById('dropov')
    let dragDepth = 0
    window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; if (dropov) dropov.classList.add('on') })
    window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (dragDepth === 0 && dropov) dropov.classList.remove('on') })
    window.addEventListener('dragover', (e) => e.preventDefault())
    window.addEventListener('drop', (e) => {
        e.preventDefault()
        dragDepth = 0
        if (dropov) dropov.classList.remove('on')
        const f: File | undefined = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find((x) => /\.(glb|gltf|3dm)$/i.test(x.name))
        if (!f) { showToast('Drop a .glb / .gltf / .3dm file'); return }
        editor.uploadModelFile(f)
            .then(() => showToast('Dropped model loaded — parts auto-detected'))
            .catch((err: any) => showToast('Drop failed: ' + err.message))
    })

    // custom model upload (.glb / .gltf / .3dm) — one handler per input
    const uploadInputs = document.querySelectorAll('[data-upload]') as NodeListOf<HTMLInputElement>
    uploadInputs.forEach((fileInput) => {
        fileInput.addEventListener('change', async () => {
            const f = fileInput.files && fileInput.files[0]
            if (!f) return
            try {
                document.querySelectorAll('.mt-val').forEach((v) => { v.textContent = '…' })
                await editor.uploadModelFile(f)
                showToast('Custom model loaded — parts auto-detected')
            } catch (e) { showToast('Upload failed: ' + (e as Error).message) }
            fileInput.value = ''
        })
    })

    // ring size = uniform model scale 50%..200%
    const scaleInputs = document.querySelectorAll('[data-scale]') as NodeListOf<HTMLInputElement>
    scaleInputs.forEach((sl) => {
        sl.addEventListener('input', () => {
            const v = parseFloat(sl.value) || 100
            const valEl = sl.closest('.mt-row')?.querySelector('.mt-val')
            if (valEl) valEl.textContent = v + '%'
            try { editor.setScale(v) } catch (e) {}
        })
    })

    function applyDesign(components: Record<string, EditableState>) {
        for (const [id, state] of Object.entries(components)) {
            const comp = editor.findComponent(id) || (editor.allComponents().find((c) => c.def.id === id))
            if (!comp) continue
            editor.setComponentState(id, state, false)
        }
        showToast('Design applied')
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()