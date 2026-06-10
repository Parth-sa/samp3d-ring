const fs = require('fs');
const path = require('path');

// Simple GLB parser to extract mesh information
function analyzeGLB(filePath) {
    const buffer = fs.readFileSync(filePath);
    
    // GLB header: magic (4) + version (4) + length (4)
    const magic = buffer.toString('utf8', 0, 4);
    if (magic !== 'glTF') {
        console.error('Not a valid GLB file');
        return;
    }
    
    const version = buffer.readUInt32LE(4);
    const fileLength = buffer.readUInt32LE(8);
    
    console.log(`\n=== Analyzing ${path.basename(filePath)} ===`);
    console.log(`Version: ${version}, File Length: ${fileLength} bytes`);
    
    // First chunk: JSON header (contains structure info)
    const jsonChunkLength = buffer.readUInt32LE(12);
    const jsonChunkType = buffer.toString('utf8', 16, 20);
    
    if (jsonChunkType === 'JSON') {
        const jsonStr = buffer.toString('utf8', 20, 20 + jsonChunkLength);
        const json = JSON.parse(jsonStr);
        
        console.log(`\nMeshes: ${json.meshes ? json.meshes.length : 0}`);
        
        if (json.meshes) {
            json.meshes.forEach((mesh, idx) => {
                console.log(`\n  Mesh ${idx}: ${mesh.name || '(unnamed)'}`);
                if (mesh.primitives) {
                    mesh.primitives.forEach((prim, pIdx) => {
                        const matIdx = prim.material;
                        let matName = 'default';
                        if (matIdx !== undefined && json.materials && json.materials[matIdx]) {
                            matName = json.materials[matIdx].name || `Material_${matIdx}`;
                        }
                        console.log(`    Primitive ${pIdx}: material="${matName}"`);
                    });
                }
            });
        }
        
        console.log(`\nMaterials: ${json.materials ? json.materials.length : 0}`);
        if (json.materials) {
            json.materials.forEach((mat, idx) => {
                console.log(`  ${idx}: ${mat.name || '(unnamed)'}`);
            });
        }
        
        // Check for extensions
        if (json.meshes && json.meshes.length > 0 && json.meshes[0].extensions) {
            console.log(`\nExtensions found:`, Object.keys(json.meshes[0].extensions));
        }
    }
}

// Analyze both files
analyzeGLB('./assets/main.glb');
analyzeGLB('./1 (1)-patched.glb');
