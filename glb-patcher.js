const fs = require('fs');
const path = require('path');
const { convert3dmToGlb } = require('./3dm-converter-advanced');

const GLB_JSON_CHUNK_TYPE = 0x4E4F534A;
const GLB_BIN_CHUNK_TYPE = 0x004E4942;

const DIAMOND_NAME_REGEX = /diamond|diamonds|gem|stone|solit(er|a)|soliter|brilliant|brillant|cz|moissanite/i;

const diamondExtensionTemplate = {
    metadata: {
        version: 4.6,
        type: 'DiamondMaterial',
        generator: 'DiamondMaterial.toJSON'
    },
    name: 'diamond-white-1',
    uuid: '',
    color: 16777215,
    envMapIntensity: 1.3,
    envMapIndex: 0,
    envMapRotationOffset: 0,
    dispersion: 0.01,
    squashFactor: 0.98,
    geometryFactor: 0.5,
    gammaFactor: 1,
    absorptionFactor: 1,
    reflectivity: 0.5,
    refractiveIndex: 2.6,
    rayBounces: 5,
    diamondOrientedEnvMap: 0,
    boostFactors: { x: 1, y: 1, z: 1, isVector3: true },
    transmission: 0,
    isDiamondMaterialParameters: true,
    type: 'DiamondMaterial',
    userData: { separateEnvMapIntensity: true, uuid: '' }
};

function createUuid() {
    return 'uuid-' + Date.now() + '-' + Math.random().toString(16).slice(2, 10);
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function parseGlb(buffer) {
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67) {
        throw new Error('Invalid GLB file: Missing GLB magic number');
    }

    let offset = 12;
    let json = null;
    let binChunk = null;

    while (offset < buffer.byteLength) {
        const chunkLength = view.getUint32(offset, true);
        const chunkType = view.getUint32(offset + 4, true);
        const chunkStart = offset + 8;
        const chunkEnd = chunkStart + chunkLength;
        const chunkBytes = new Uint8Array(buffer.slice(chunkStart, chunkEnd));

        if (chunkType === GLB_JSON_CHUNK_TYPE) {
            json = JSON.parse(new TextDecoder().decode(chunkBytes).trim());
        } else if (chunkType === GLB_BIN_CHUNK_TYPE) {
            binChunk = chunkBytes;
        }

        offset = chunkEnd;
    }

    if (!json) {
        throw new Error('Invalid GLB file: Missing JSON chunk');
    }

    return { json, binChunk };
}

function padBytes(bytes, padValue) {
    const paddedLength = Math.ceil(bytes.byteLength / 4) * 4;
    if (paddedLength === bytes.byteLength) return bytes;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded.fill(padValue, bytes.byteLength);
    return padded;
}

function buildGlb(json, binChunk) {
    const jsonBytes = padBytes(new TextEncoder().encode(JSON.stringify(json)), 0x20);
    const binBytes = binChunk ? padBytes(binChunk, 0) : null;
    const totalLength = 12 + 8 + jsonBytes.byteLength + (binBytes ? 8 + binBytes.byteLength : 0);
    const glb = new Uint8Array(totalLength);
    const view = new DataView(glb.buffer);

    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, totalLength, true);

    let offset = 12;
    view.setUint32(offset, jsonBytes.byteLength, true);
    view.setUint32(offset + 4, GLB_JSON_CHUNK_TYPE, true);
    glb.set(jsonBytes, offset + 8);
    offset += 8 + jsonBytes.byteLength;

    if (binBytes) {
        view.setUint32(offset, binBytes.byteLength, true);
        view.setUint32(offset + 4, GLB_BIN_CHUNK_TYPE, true);
        glb.set(binBytes, offset + 8);
    }

    return new Uint8Array(glb.buffer);
}

function collectMaterialUsageNames(json) {
    const usage = new Map();
    const meshes = json.meshes || [];
    const nodes = json.nodes || [];

    const pushName = (index, name) => {
        if (index === undefined || index === null) return;
        const current = usage.get(index) || [];
        current.push(name);
        usage.set(index, current);
    };

    meshes.forEach((mesh, meshIndex) => {
        (mesh.primitives || []).forEach((primitive) => {
            if (primitive.material === undefined) return;
            pushName(primitive.material, mesh.name || `mesh_${meshIndex}`);
        });
    });

    nodes.forEach((node, nodeIndex) => {
        const meshIndex = node.mesh;
        if (meshIndex === undefined || meshIndex === null) return;
        const mesh = meshes[meshIndex];
        (mesh?.primitives || []).forEach((primitive) => {
            if (primitive.material === undefined) return;
            pushName(primitive.material, node.name || mesh?.name || `node_${nodeIndex}`);
        });
    });

    return usage;
}

function isSmallMesh(json, materialIndex) {
    const meshes = json.meshes || [];
    const nodes = json.nodes || [];
    const ACCESSOR_COMPONENT_SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    
    for (const mesh of meshes) {
        for (const primitive of mesh.primitives || []) {
            if (primitive.material !== materialIndex) continue;
            
            const position = primitive.attributes?.POSITION;
            if (position === undefined || !json.accessors) continue;
            
            const accessor = json.accessors[position];
            if (!accessor || accessor.count === undefined) continue;
            
            const count = accessor.count;
            if (count > 1000) continue;
            
            let min = Infinity, max = -Infinity;
            if (accessor.min && accessor.min.length >= 3) {
                const distMin = Math.sqrt(accessor.min[0]**2 + accessor.min[1]**2 + accessor.min[2]**2);
                const distMax = Math.sqrt(accessor.max[0]**2 + accessor.max[1]**2 + accessor.max[2]**2);
                min = Math.min(distMin, distMax);
            }
            
            if (count <= 500 && min < 2) return true;
        }
    }
    
    return false;
}

function patchGlb(inputPath, outputPath, options = {}) {
    console.log('\n========================================');
    console.log('    GLB Diamond Patcher - Node.js');
    console.log('========================================\n');

    console.log(`📂 Input:  ${inputPath}`);
    console.log(`📤 Output: ${outputPath}\n`);

    if (!fs.existsSync(inputPath)) {
        console.error('❌ Error: Input file not found!');
        process.exit(1);
    }

    const inputBuffer = fs.readFileSync(inputPath);
    const buffer = inputBuffer.buffer.slice(inputBuffer.byteOffset, inputBuffer.byteOffset + inputBuffer.byteLength);
    
    const { json, binChunk } = parseGlb(buffer);

    const materials = json.materials || [];
    if (materials.length === 0) {
        console.error('❌ Error: No materials found in GLB file!');
        process.exit(1);
    }

    console.log('📊 GLB Structure:');
    console.log(`   - Meshes: ${json.meshes?.length || 0}`);
    console.log(`   - Materials: ${materials.length}`);
    console.log(`   - Nodes: ${json.nodes?.length || 0}`);
    console.log('');

    const usage = collectMaterialUsageNames(json);
    const patchFirstMaterial = options.patchFirstMaterial || false;

    const targetIndices = [];
    const logs = [];

    materials.forEach((material, index) => {
        const names = `${material?.name || ''} ${(usage.get(index) || []).join(' ')}`;
        const hasDiamondName = DIAMOND_NAME_REGEX.test(names);
        const isSmall = isSmallMesh(json, index);
        
        if (hasDiamondName || isSmall) {
            console.log(`💎 Diamond detected: "${material.name || 'unnamed'}" (material index ${index}) ${isSmall && !hasDiamondName ? '- by geometry size' : ''}`);
            targetIndices.push(index);
        } else {
            console.log(`○ Metal: "${material.name || 'unnamed'}" (material index ${index})`);
        }
    });

    if (targetIndices.length === 0) {
        if (patchFirstMaterial) {
            console.log('\n⚠️  No diamond materials found, using first material as fallback');
            targetIndices.push(0);
        } else {
            console.log('\n⚠️  No diamond materials found. Use --fallback flag to patch first material.');
        }
    }

    if (targetIndices.length === 0) {
        console.error('\n❌ Error: No materials to patch!');
        process.exit(1);
    }

    json.extensionsUsed = Array.from(new Set([...(json.extensionsUsed || []), 'WEBGI_materials_diamond']));

    let patchCount = 0;
    targetIndices.forEach(index => {
        const extension = deepClone(diamondExtensionTemplate);
        const uuid = createUuid();
        extension.uuid = uuid;
        extension.userData.uuid = uuid;
        
        const material = materials[index] || {};
        material.name = extension.name;
        material.extensions = { ...(material.extensions || {}), WEBGI_materials_diamond: extension };
        material.extras = { ...(material.extras || {}), separateEnvMapIntensity: true, uuid };
        materials[index] = material;
        patchCount++;
    });

    json.materials = materials;

    const patchedGlb = buildGlb(json, binChunk);
    fs.writeFileSync(outputPath, patchedGlb);

    const inputSize = fs.statSync(inputPath).size;
    const outputSize = patchedGlb.length;

    console.log('\n========================================');
    console.log('✅ SUCCESS!');
    console.log('========================================');
    console.log(`   Patched ${patchCount} material(s)`);
    console.log(`   Input size:  ${(inputSize / 1024).toFixed(1)} KB`);
    console.log(`   Output size: ${(outputSize / 1024).toFixed(1)} KB`);
    console.log(`   Saved to: ${outputPath}`);
    console.log('========================================\n');
}

const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('\n========================================');
    console.log('    GLB Diamond Patcher - Usage');
    console.log('========================================\n');
    console.log('Usage: node glb-patcher.js <input> <output> [options]\n');
    console.log('Arguments:');
    console.log('  <input>       Path to input GLB or 3DM file');
    console.log('  <output>      Path to output patched GLB file\n');
    console.log('Options:');
    console.log('  --fallback    Patch first material if no diamonds detected\n');
    console.log('Examples:');
    console.log('  node glb-patcher.js input.glb output.glb');
    console.log('  node glb-patcher.js ring.glb ring-patched.glb --fallback');
    console.log('  node glb-patcher.js ring.3dm output.glb');
    console.log('');
    process.exit(1);
}

const inputPath = args[0];
const outputPath = args[1];
const useFallback = args.includes('--fallback');

async function main() {
    try {
        let glbInputPath = inputPath;
        
        // Check if input is a 3dm file
        if (inputPath.toLowerCase().endsWith('.3dm')) {
            console.log('📦 3DM file detected, converting to GLB first...\n');
            const tempGlbPath = path.join(path.dirname(outputPath), `_temp_${Date.now()}.glb`);
            await convert3dmToGlb(inputPath, tempGlbPath);
            glbInputPath = tempGlbPath;
            
            // Clean up temp file after patching
            patchGlb(glbInputPath, outputPath, { patchFirstMaterial: useFallback });
            fs.unlinkSync(tempGlbPath);
        } else {
            patchGlb(inputPath, outputPath, { patchFirstMaterial: useFallback });
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
