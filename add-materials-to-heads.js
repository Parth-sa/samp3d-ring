const fs = require('fs');
const path = require('path');

const GLB_JSON_CHUNK_TYPE = 0x4E4F534A;
const GLB_BIN_CHUNK_TYPE = 0x004E4942;

function parseGlb(buffer) {
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67) {
        throw new Error('Invalid GLB file');
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
    if (!json) throw new Error('Missing JSON chunk');
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

function addDefaultMaterials(json) {
    const meshes = json.meshes || [];
    const materials = json.materials || [];
    
    if (materials.length > 0) {
        console.log(`  Already has ${materials.length} materials, skipping`);
        return json;
    }

    const defaultMaterial = {
        name: 'DefaultMaterial',
        pbrMetallicRoughness: {
            baseColorFactor: [0.8, 0.8, 0.8, 1.0],
            metallicFactor: 0.0,
            roughnessFactor: 0.5
        },
        doubleSided: true
    };

    json.materials = [defaultMaterial];

    meshes.forEach(mesh => {
        (mesh.primitives || []).forEach(primitive => {
            primitive.material = 0;
        });
    });

    console.log(`  Added default material to ${meshes.length} mesh(es)`);
    return json;
}

function processHeadFile(inputPath, outputPath) {
    console.log(`Processing: ${path.basename(inputPath)}`);
    const inputBuffer = fs.readFileSync(inputPath);
    const buffer = inputBuffer.buffer.slice(inputBuffer.byteOffset, inputBuffer.byteOffset + inputBuffer.byteLength);
    const { json, binChunk } = parseGlb(buffer);
    
    addDefaultMaterials(json);
    
    const patchedGlb = buildGlb(json, binChunk);
    fs.writeFileSync(outputPath, patchedGlb);
    console.log(`  Saved to: ${outputPath}\n`);
}

const headsDir = 'G:/webgi viewer/assets/signi/sigli/';
const outputDir = 'G:/webgi viewer/assets/signi/sigli/';

const files = fs.readdirSync(headsDir).filter(f => f.endsWith('.glb') && !f.includes('-patched'));

console.log(`Found ${files.length} head files to process\n`);

files.forEach(file => {
    const inputPath = path.join(headsDir, file);
    const outputPath = path.join(outputDir, file.replace('.glb', '-patched.glb'));
    try {
        processHeadFile(inputPath, outputPath);
    } catch (e) {
        console.error(`  Error: ${e.message}\n`);
    }
});

console.log('Done!');