const DIAMOND_NAME_REGEX = /diamond|diamonds|gem|stone|solit(er|a)|soliter|brilliant|brillant|cz|moissanite/i
const GLB_JSON_CHUNK_TYPE = 0x4E4F534A
const GLB_BIN_CHUNK_TYPE = 0x004E4942

const diamondExtensionTemplate = {
    metadata: {
        version: 4.6,
        type: 'DiamondMaterial',
        generator: 'DiamondMaterial.toJSON'
    },
    name: 'diamond-white-1',
    uuid: '82f55444-f867-495c-952a-1661c1be675d',
    color: 16777215,
    envMapIntensity: 2.3,
    envMapIndex: 0,
    envMapRotationOffset: 0,
    dispersion: 0.012,
    squashFactor: 0.98,
    geometryFactor: 0.5,
    gammaFactor: 1.0,
    absorptionFactor: 1.0,
    reflectivity: 0.5,
    refractiveIndex: 2.6,
    rayBounces: 5,
    diamondOrientedEnvMap: 0,
    boostFactors: {
        x: 0.892,
        y: 0.892,
        z: 0.986,
        isVector3: true
    },
    transmission: 0.95,
    isDiamondMaterialParameters: true,
    type: 'DiamondMaterial',
    userData: {
        separateEnvMapIntensity: true,
        uuid: '82f55444-f867-495c-952a-1661c1be675d'
    }
}

function deepClone(value: any) {
    return JSON.parse(JSON.stringify(value))
}

function createUuid() {
    const c = crypto as any
    if (typeof c !== 'undefined' && typeof c.randomUUID === 'function') return c.randomUUID()
    return `uuid-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseGlb(arrayBuffer: ArrayBuffer) {
    const view = new DataView(arrayBuffer)
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid GLB file')

    let offset = 12
    let json: any = null
    let binChunk: Uint8Array | null = null

    while (offset < arrayBuffer.byteLength) {
        const chunkLength = view.getUint32(offset, true)
        const chunkType = view.getUint32(offset + 4, true)
        const chunkStart = offset + 8
        const chunkEnd = chunkStart + chunkLength
        const chunkBytes = new Uint8Array(arrayBuffer.slice(chunkStart, chunkEnd))

        if (chunkType === GLB_JSON_CHUNK_TYPE) {
            json = JSON.parse(new TextDecoder().decode(chunkBytes).trim())
        } else if (chunkType === GLB_BIN_CHUNK_TYPE) {
            binChunk = chunkBytes
        }

        offset = chunkEnd
    }

    if (!json) throw new Error('Missing GLB JSON chunk')
    return { json, binChunk }
}

function padBytes(bytes: Uint8Array, padValue: number) {
    const paddedLength = Math.ceil(bytes.byteLength / 4) * 4
    if (paddedLength === bytes.byteLength) return bytes
    const padded = new Uint8Array(paddedLength)
    padded.set(bytes)
    padded.fill(padValue, bytes.byteLength)
    return padded
}

function buildGlb(json: any, binChunk: Uint8Array | null) {
    const jsonBytes = padBytes(new TextEncoder().encode(JSON.stringify(json)), 0x20)
    const binBytes = binChunk ? padBytes(binChunk, 0) : null
    const totalLength = 12 + 8 + jsonBytes.byteLength + (binBytes ? 8 + binBytes.byteLength : 0)
    const glb = new Uint8Array(totalLength)
    const view = new DataView(glb.buffer)

    view.setUint32(0, 0x46546c67, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, totalLength, true)

    let offset = 12
    view.setUint32(offset, jsonBytes.byteLength, true)
    view.setUint32(offset + 4, GLB_JSON_CHUNK_TYPE, true)
    glb.set(jsonBytes, offset + 8)
    offset += 8 + jsonBytes.byteLength

    if (binBytes) {
        view.setUint32(offset, binBytes.byteLength, true)
        view.setUint32(offset + 4, GLB_BIN_CHUNK_TYPE, true)
        glb.set(binBytes, offset + 8)
    }

    return new Blob([glb], { type: 'model/gltf-binary' })
}

function collectMaterialUsageNames(json: any) {
    const usage = new Map<number, string[]>()
    const meshes = json.meshes || []
    const nodes = json.nodes || []

    const pushName = (index: number, name: string) => {
        if (index === undefined || index === null) return
        const current = usage.get(index) || []
        current.push(name)
        usage.set(index, current)
    }

    meshes.forEach((mesh: any, meshIndex: number) => {
        ;(mesh.primitives || []).forEach((primitive: any) => {
            if (primitive.material === undefined) return
            pushName(primitive.material, mesh.name || `mesh_${meshIndex}`)
        })
    })

    nodes.forEach((node: any, nodeIndex: number) => {
        const meshIndex = node.mesh
        if (meshIndex === undefined || meshIndex === null) return
        const mesh = meshes[meshIndex]
        ;(mesh?.primitives || []).forEach((primitive: any) => {
            if (primitive.material === undefined) return
            pushName(primitive.material, node.name || mesh?.name || `node_${nodeIndex}`)
        })
    })

    return usage
}

export async function patchGlbWithDiamondMetadata(file: File, backgroundUrl?: string, options?: { fallbackToFirst?: boolean }) {
    const arrayBuffer = await file.arrayBuffer()
    const { json, binChunk } = parseGlb(arrayBuffer)
    const materials = json.materials || []
    if (materials.length === 0) return file

    const usage = collectMaterialUsageNames(json)
    const targetIndices = materials
        .map((material: any, index: number) => {
            const names = `${material?.name || ''} ${(usage.get(index) || []).join(' ')}`
            return DIAMOND_NAME_REGEX.test(names) ? index : -1
        })
        .filter((index: number) => index >= 0)

    // fallbackToFirst: false skips files with no diamond-named materials
    // (e.g. all-metal ring parts) instead of guessing material 0
    if (targetIndices.length === 0 && options?.fallbackToFirst === false) return file
    const patchIndices = targetIndices.length > 0 ? targetIndices : [0]

    json.extensionsUsed = Array.from(new Set([...(json.extensionsUsed || []), 'WEBGI_materials_diamond']))

    patchIndices.forEach((index: number) => {
        const extension = deepClone(diamondExtensionTemplate)
        const uuid = createUuid()
        extension.uuid = uuid
        extension.userData.uuid = uuid
        const material = materials[index] || {}
        material.name = extension.name
        material.extensions = { ...(material.extensions || {}), WEBGI_materials_diamond: extension }
        material.extras = { ...(material.extras || {}), separateEnvMapIntensity: true, uuid }
        materials[index] = material
    })

    if (backgroundUrl) {
        json.extras = json.extras || {}
        json.extras.webgiBackground = backgroundUrl
    }

    json.materials = materials
    const patchedBlob = buildGlb(json, binChunk)
    return new File([patchedBlob], file.name, { type: 'model/gltf-binary' })
}
