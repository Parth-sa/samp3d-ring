const fs = require('fs');
const path = require('path');

const GLB_JSON_CHUNK_TYPE = 0x4E4F534A;
const GLB_BIN_CHUNK_TYPE = 0x004E4942;

const DIAMOND_NAME_REGEX = /diamond|diamonds|gem|stone|solit(er|a)|soliter|brilliant|brillant|cz|moissanite/i;

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

    return { json, binChunk };
}

function buildGlb(json, binChunk) {
    const jsonStr = JSON.stringify(json);
    const jsonBytes = new TextEncoder().encode(jsonStr);
    const paddedJsonLength = Math.ceil(jsonBytes.length / 4) * 4;
    const paddedJson = new Uint8Array(paddedJsonLength);
    paddedJson.set(jsonBytes);
    paddedJson.fill(0x20, jsonBytes.length);

    let totalLength = 12 + 8 + paddedJsonLength;
    let binOffset = 0;
    let paddedBin = null;

    if (binChunk && binChunk.length > 0) {
        const paddedBinLength = Math.ceil(binChunk.length / 4) * 4;
        paddedBin = new Uint8Array(paddedBinLength);
        paddedBin.set(binChunk);
        paddedBin.fill(0, binChunk.length);
        totalLength += 8 + paddedBinLength;
    }

    const glb = new Uint8Array(totalLength);
    const view = new DataView(glb.buffer);

    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, totalLength, true);

    view.setUint32(12, paddedJsonLength, true);
    view.setUint32(16, GLB_JSON_CHUNK_TYPE, true);
    glb.set(paddedJson, 24);

    if (paddedBin) {
        binOffset = 24 + paddedJsonLength;
        view.setUint32(binOffset, binChunk.length, true);
        view.setUint32(binOffset + 4, GLB_BIN_CHUNK_TYPE, true);
        glb.set(paddedBin, binOffset + 8);
    }

    return Buffer.from(glb.buffer);
}

function analyzeGlb(filePath) {
    const buffer = fs.readFileSync(filePath);
    const { json, binChunk } = parseGlb(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

    const analysis = {
        fileName: path.basename(filePath),
        filePath: filePath,
        meshes: json.meshes?.length || 0,
        materials: json.materials?.length || 0,
        nodes: json.nodes?.length || 0,
        hasBinChunk: !!binChunk && binChunk.length > 0,
        binChunkSize: binChunk ? binChunk.length : 0,
        materials: [],
        diamonds: [],
        metals: [],
        scene: json.scene || 0,
        scenes: json.scenes?.length || 0,
        rootNodes: json.scenes?.[0]?.nodes || []
    };

    if (json.materials) {
        json.materials.forEach((mat, idx) => {
            const matInfo = {
                index: idx,
                name: mat.name || 'unnamed',
                isDiamond: DIAMOND_NAME_REGEX.test(mat.name || '')
            };

            if (matInfo.isDiamond) {
                analysis.diamonds.push(matInfo);
            } else {
                analysis.metals.push(matInfo);
            }
            analysis.materials.push(matInfo);
        });
    }

    return { analysis, json, binChunk };
}

function mergeGlbFiles(ringFile, diamondFile, prncFile, outputPath, options = {}) {
    console.log('\n========================================');
    console.log('    GLB Ring Merger Tool');
    console.log('========================================\n');

    const { ring, diamond, prnc } = {
        ring: analyzeGlb(ringFile),
        diamond: analyzeGlb(diamondFile),
        prnc: analyzeGlb(prncFile)
    };

    console.log('📁 File Analysis:\n');
    console.log(`  Ring (${ring.analysis.fileName}):`);
    console.log(`    - Meshes: ${ring.analysis.meshes}`);
    console.log(`    - Materials: ${ring.analysis.materials.length}`);
    console.log(`    - Diamonds: ${ring.analysis.diamonds.length}`);
    console.log(`    - Metals: ${ring.analysis.metals.length}`);
    console.log('');

    console.log(`  Diamond (${diamond.analysis.fileName}):`);
    console.log(`    - Meshes: ${diamond.analysis.meshes}`);
    console.log(`    - Materials: ${diamond.analysis.materials.length}`);
    console.log(`    - Diamonds: ${diamond.analysis.diamonds.length}`);
    console.log('');

    console.log(`  PRNC (${prnc.analysis.fileName}):`);
    console.log(`    - Meshes: ${prnc.analysis.meshes}`);
    console.log(`    - Materials: ${prnc.analysis.materials.length}`);
    console.log(`    - Diamonds: ${prnc.analysis.diamonds.length}`);
    console.log('');

    const merged = {
        assetGenerator: 'GLB Ring Merger v1.0',
        version: '2.0',
        extensionsUsed: [],
        extensionsRequired: [],
        scene: 0,
        scenes: [{ name: 'MergedRing', nodes: [] }],
        nodes: [],
        meshes: [],
        materials: [],
        accessors: [],
        buffers: []
    };

    let nodeOffset = 0;
    let meshOffset = 0;
    let matOffset = 0;
    let accessorOffset = 0;
    let binBuffers = [];
    let currentBinOffset = 0;

    const binChunks = [];
    if (ring.binChunk && ring.binChunk.length > 0) binChunks.push({ name: 'ring', data: ring.binChunk, offset: 0 });
    if (diamond.binChunk && diamond.binChunk.length > 0) binChunks.push({ name: 'diamond', data: diamond.binChunk, offset: binChunks.reduce((a, c) => a + c.data.length, 0) });
    if (prnc.binChunk && prnc.binChunk.length > 0) binChunks.push({ name: 'prnc', data: prnc.binChunk, offset: binChunks.reduce((a, c) => a + c.data.length, 0) });

    let totalBinSize = binChunks.reduce((a, c) => a + c.data.length, 0);

    function copyMesh(mesh, sourceFile, binChunkMap, newMatIndex) {
        const newMesh = JSON.parse(JSON.stringify(mesh));
        newMesh.primitives.forEach(prim => {
            if (prim.material !== undefined) {
                prim.material = newMatIndex;
            }
            if (prim.indices !== undefined) {
                const oldAccessor = sourceFile.json.accessors[prim.indices];
                const newAccessor = { ...oldAccessor };
                prim.indices = merged.accessors.length;
                merged.accessors.push(newAccessor);
                if (oldAccessor.bufferView !== undefined) {
                    const oldView = sourceFile.json.bufferViews[oldAccessor.bufferView];
                    newAccessor.bufferView = sourceFile.json.bufferViews ? 
                        sourceFile.json.bufferViews.indexOf(oldView) : undefined;
                }
            }
            for (const attr of Object.keys(prim.attributes)) {
                const attrAccessor = sourceFile.json.accessors[prim.attributes[attr]];
                if (attrAccessor) {
                    const newAccessor = { ...attrAccessor };
                    prim.attributes[attr] = merged.accessors.length;
                    merged.accessors.push(newAccessor);
                    if (attrAccessor.bufferView !== undefined && sourceFile.json.bufferViews) {
                        const oldView = sourceFile.json.bufferViews[attrAccessor.bufferView];
                        newAccessor.bufferView = sourceFile.json.bufferViews.indexOf(oldView);
                    }
                }
            }
        });
        return newMesh;
    }

    function copyMaterial(mat, namePrefix = '') {
        const newMat = JSON.parse(JSON.stringify(mat));
        if (newMat.name) newMat.name = namePrefix + '_' + newMat.name;
        else newMat.name = namePrefix + '_material';
        return newMat;
    }

    console.log('🔄 Merging components...\n');

    const ringNode = {
        name: 'Ring_Base',
        children: []
    };

    ring.json.meshes?.forEach((mesh, meshIdx) => {
        const meshNode = {
            name: mesh.name || `Ring_Mesh_${meshIdx}`,
            mesh: merged.meshes.length
        };
        const newMesh = copyMesh(mesh, ring, {}, matOffset);
        merged.meshes.push(newMesh);
        ringNode.children.push(merged.nodes.length);
        merged.nodes.push(meshNode);
    });

    ring.json.materials?.forEach(mat => {
        merged.materials.push(copyMaterial(mat, 'Ring'));
    });

    matOffset = merged.materials.length;
    meshOffset = merged.meshes.length;

    merged.scenes[0].nodes.push(merged.nodes.length);
    merged.nodes.push(ringNode);

    const prncNode = {
        name: 'PRNC_Component',
        children: []
    };

    prnc.json.meshes?.forEach((mesh, meshIdx) => {
        const meshNode = {
            name: mesh.name || `PRNC_Mesh_${meshIdx}`,
            mesh: merged.meshes.length,
            translation: options.prncPosition || [0, 0, 0],
            rotation: options.prncRotation || [0, 0, 0, 1],
            scale: options.prncScale || [1, 1, 1]
        };
        const newMesh = copyMesh(mesh, prnc, {}, matOffset);
        merged.meshes.push(newMesh);
        prncNode.children.push(merged.nodes.length);
        merged.nodes.push(meshNode);
    });

    prnc.json.materials?.forEach(mat => {
        const newMat = copyMaterial(mat, 'PRNC');
        newMat.pbrMetallicRoughness = mat.pbrMetallicRoughness;
        merged.materials.push(newMat);
    });

    merged.scenes[0].nodes.push(merged.nodes.length);
    merged.nodes.push(prncNode);

    const diamondNode = {
        name: 'Diamonds',
        children: []
    };

    diamond.json.meshes?.forEach((mesh, meshIdx) => {
        const meshNode = {
            name: mesh.name || `Diamond_Mesh_${meshIdx}`,
            mesh: merged.meshes.length,
            translation: options.diamondPosition || [0, 0, 0],
            rotation: options.diamondRotation || [0, 0, 0, 1],
            scale: options.diamondScale || [1, 1, 1]
        };
        const newMesh = copyMesh(mesh, diamond, {}, matOffset);
        merged.meshes.push(newMesh);
        diamondNode.children.push(merged.nodes.length);
        merged.nodes.push(meshNode);
    });

    diamond.json.materials?.forEach(mat => {
        const newMat = copyMaterial(mat, 'Diamond');
        newMat.extensions = mat.extensions;
        merged.materials.push(newMat);
        if (mat.extensions?.WEBGI_materials_diamond) {
            if (!merged.extensionsUsed.includes('WEBGI_materials_diamond')) {
                merged.extensionsUsed.push('WEBGI_materials_diamond');
            }
        }
    });

    merged.scenes[0].nodes.push(merged.nodes.length);
    merged.nodes.push(diamondNode);

    console.log(`  ✓ Ring Base: ${ring.json.meshes?.length || 0} meshes`);
    console.log(`  ✓ PRNC: ${prnc.json.meshes?.length || 0} meshes`);
    console.log(`  ✓ Diamonds: ${diamond.json.meshes?.length || 0} meshes`);
    console.log(`  ✓ Total Materials: ${merged.materials.length}`);
    console.log('');

    let combinedBin = null;
    if (ring.binChunk || diamond.binChunk || prnc.binChunk) {
        const totalSize = (ring.binChunk?.length || 0) + (diamond.binChunk?.length || 0) + (prnc.binChunk?.length || 0);
        combinedBin = new Uint8Array(totalSize);
        
        let offset = 0;
        if (ring.binChunk) {
            combinedBin.set(ring.binChunk, offset);
            offset += ring.binChunk.length;
        }
        if (prnc.binChunk) {
            combinedBin.set(prnc.binChunk, offset);
            offset += prnc.binChunk.length;
        }
        if (diamond.binChunk) {
            combinedBin.set(diamond.binChunk, offset);
        }
    }

    if (combinedBin && combinedBin.length > 0) {
        merged.buffers.push({ byteLength: combinedBin.length });
        merged.bufferViews = [];
        
        if (ring.binChunk && ring.binChunk.length > 0) {
            merged.bufferViews.push({
                buffer: 0,
                byteOffset: 0,
                byteLength: ring.binChunk.length
            });
        }
        if (prnc.binChunk && prnc.binChunk.length > 0) {
            merged.bufferViews.push({
                buffer: 0,
                byteOffset: ring.binChunk?.length || 0,
                byteLength: prnc.binChunk.length
            });
        }
        if (diamond.binChunk && diamond.binChunk.length > 0) {
            merged.bufferViews.push({
                buffer: 0,
                byteOffset: (ring.binChunk?.length || 0) + (prnc.binChunk?.length || 0),
                byteLength: diamond.binChunk.length
            });
        }
    }

    const outputGlb = buildGlb(merged, combinedBin);
    fs.writeFileSync(outputPath, outputGlb);

    const outputStats = fs.statSync(outputPath);

    console.log('========================================');
    console.log('✅ MERGE COMPLETE!');
    console.log('========================================');
    console.log(`  Output: ${outputPath}`);
    console.log(`  Size: ${(outputStats.size / 1024).toFixed(1)} KB`);
    console.log(`  Meshes: ${merged.meshes.length}`);
    console.log(`  Materials: ${merged.materials.length}`);
    console.log(`  Nodes: ${merged.nodes.length}`);
    console.log('========================================\n');

    return {
        success: true,
        outputPath,
        stats: {
            meshes: merged.meshes.length,
            materials: merged.materials.length,
            nodes: merged.nodes.length,
            size: outputStats.size
        }
    };
}

const args = process.argv.slice(2);

if (args.length < 4) {
    console.log('\n========================================');
    console.log('    GLB Ring Merger - Usage');
    console.log('========================================\n');
    console.log('Usage: node glb-ring-merger.js <ring.glb> <diamond.glb> <prnc.glb> <output.glb> [options]\n');
    console.log('Arguments:');
    console.log('  <ring.glb>      Base ring model');
    console.log('  <diamond.glb>   Diamond component');
    console.log('  <prnc.glb>     PRNC component');
    console.log('  <output.glb>   Output merged file\n');
    console.log('Options:');
    console.log('  --diamond-pos <x> <y> <z>  Position diamonds');
    console.log('  --prnc-pos <x> <y> <z>     Position PRNC');
    console.log('  --diamond-rot <x> <y> <z> <w>  Rotate diamonds');
    console.log('  --prnc-rot <x> <y> <z> <w>     Rotate PRNC\n');
    console.log('Example:');
    console.log('  node glb-ring-merger.js ring.glb diamond.glb prnc.glb combined.glb');
    console.log('');
    process.exit(1);
}

const ringFile = args[0];
const diamondFile = args[1];
const prncFile = args[2];
const outputFile = args[3];

const options = {};

for (let i = 4; i < args.length; i++) {
    if (args[i] === '--diamond-pos' && i + 3 < args.length) {
        options.diamondPosition = [parseFloat(args[i + 1]), parseFloat(args[i + 2]), parseFloat(args[i + 3])];
        i += 3;
    }
    if (args[i] === '--prnc-pos' && i + 3 < args.length) {
        options.prncPosition = [parseFloat(args[i + 1]), parseFloat(args[i + 2]), parseFloat(args[i + 3])];
        i += 3;
    }
    if (args[i] === '--diamond-rot' && i + 4 < args.length) {
        options.diamondRotation = [parseFloat(args[i + 1]), parseFloat(args[i + 2]), parseFloat(args[i + 3]), parseFloat(args[i + 4])];
        i += 4;
    }
    if (args[i] === '--prnc-rot' && i + 4 < args.length) {
        options.prncRotation = [parseFloat(args[i + 1]), parseFloat(args[i + 2]), parseFloat(args[i + 3]), parseFloat(args[i + 4])];
        i += 4;
    }
}

try {
    mergeGlbFiles(ringFile, diamondFile, prncFile, outputFile, options);
} catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
}
