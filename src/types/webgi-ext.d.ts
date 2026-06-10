import { ViewerApp, IViewerPlugin, SimpleEventDispatcher, AssetManagerPlugin } from 'webgi'

declare module 'webgi' {
    export class Rhino3dmLoader2 {
        constructor(manager?: any)
        loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<any>
    }

    export class Rhino3dmLoadPlugin extends SimpleEventDispatcher<''> implements IViewerPlugin<ViewerApp> {
        static readonly PluginType = 'Rhino3dmLoadPlugin'
        dependencies: (typeof AssetManagerPlugin)[]
        onAdded(viewer: ViewerApp): Promise<void>
        onDispose(viewer: ViewerApp): Promise<void>
        onRemove(viewer: ViewerApp): Promise<void>
    }
}

export interface ProjectConfig {
    modelUrl?: string
    basePath?: string
    posterUrl?: string
    logo?: string
    name?: string
    description?: string
    sceneConfig?: {
        Environment?: string
        GemEnvironment?: string
        Ground?: string
        Background?: string
    }
    cameraConfig?: {
        initialZoomPercent?: number
        minZoomDistance?: number
        maxZoomDistance?: number
        verticalOffset?: number
    }
    materialConfig?: {
        type?: string
        materials?: Array<{ name: string; path: string }>
    }
    metal?: {
        color: string
        metalness: number
        roughness: number
        envMapIntensity: number
    }
    diamond?: {
        color: string
        transmission: number
        ior: number
        sparkle: number
        refractiveIndex?: number
    }
    plugins?: Record<string, any>
}

export interface ViewerOptions {
    container?: HTMLElement
    showZoomButtons?: boolean
    enableZoom?: boolean
    enableScrollWheel?: boolean
    transparentBg?: boolean
    shareUrl?: string
}
