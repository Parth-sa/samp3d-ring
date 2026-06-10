const fs = require('fs');
const path = require('path');

// Dynamically import rhino3dm
let rhino = null;

async function initialize3dm() {
    if (rhino) return rhino;
    try {
        rhino = await require('rhino3dm')();
        return rhino;
    } catch (error) {
        throw new Error('Failed to initialize rhino3dm: ' + error.message);
    }
}

/**
 * Convert a 3dm file to GLB format
 * @param {string} inputPath - Path to the .3dm file
 * @param {string} outputPath - Path to save the .glb file
 * @returns {Promise<Object>} - Conversion result with stats
 */
async function convert3dmToGlb(inputPath, outputPath) {
    console.log('\n========================================');
    console.log('  3DM to GLB Converter - Node.js');
    console.log('========================================\n');

    console.log(`📂 Input:  ${inputPath}`);
    console.log(`📤 Output: ${outputPath}\n`);

    if (!fs.existsSync(inputPath)) {
        throw new Error('Input file not found: ' + inputPath);
    }

    // Initialize rhino3dm
    const rhinoModule = await initialize3dm();
    console.log('✓ Rhino3dm initialized\n');

    // Read 3dm file
    const fileBuffer = fs.readFileSync(inputPath);
    console.log(`📦 File size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Parse 3dm file using rhino3dm
    let file3dm;
    try {
        // rhino3dm.File3dm.fromByteArray() - note lowercase 'f'
        file3dm = rhinoModule.File3dm.fromByteArray(new Uint8Array(fileBuffer));
        if (!file3dm) {
            throw new Error('fromByteArray returned null');
        }
    } catch (error) {
        throw new Error('Failed to parse 3dm file: ' + error.message);
    }

    console.log('✓ 3DM file parsed\n');

    // Get objects
    const objectsTable = file3dm.objects();
    const objectCount = objectsTable ? objectsTable.count : 0;
    console.log(`📊 Objects found: ${objectCount}`);

    let meshCount = 0;
    let otherCount = 0;

    // Collect all geometry
    const geometries = [];
    for (let i = 0; i < objectCount; i++) {
        try {
            const rhObj = objectsTable.get(i);
            if (!rhObj) continue;

            const geom = rhObj.geometry();
            if (!geom) {
                otherCount++;
                continue;
            }

            // Check what type of geometry we have
            // rhino3dm returns Breps/Surfaces etc. - we need to extract mesh data
            if (geom.vertices && geom.faces) {
                // This is likely a Brep or Surface with vertices and faces
                geometries.push(geom);
                meshCount++;
            } else {
                otherCount++;
            }
        } catch (e) {
            console.warn(`  ⚠ Error processing object ${i}: ${e.message}`);
            otherCount++;
        }
    }

    console.log(`  - Meshes: ${meshCount}`);
    console.log(`  - Other objects: ${otherCount}\n`);

    if (geometries.length === 0) {
        throw new Error(`No meshes found in 3dm file (found ${objectCount} total objects)`);
    }

    // Convert to Three.js BufferGeometry then to GLB
    const THREE = require('three');
    // Load GLTFExporter from the npm three package's examples
    const GLTFExporter = require('three-gltf-exporter');

    const scene = new THREE.Scene();
    let totalVertices = 0;
    let totalFaces = 0;

    geometries.forEach((rhinoGeom, index) => {
        try {
            // Handle Brep/Surface geometry
            const vertices = rhinoGeom.vertices;
            const faces = rhinoGeom.faces;
            
            if (!vertices || vertices.length === 0) {
                console.warn(`  ⚠ Object ${index} has no vertices`);
                return;
            }

            const geometry = new THREE.BufferGeometry();

            // Convert vertices - they might be an array or a Rhino collection
            const positions = new Float32Array(vertices.length * 3);
            for (let i = 0; i < vertices.length; i++) {
                const pt = vertices[i];
                positions[i * 3] = pt.x || pt[0] || 0;
                positions[i * 3 + 1] = pt.y || pt[1] || 0;
                positions[i * 3 + 2] = pt.z || pt[2] || 0;
            }
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            // Convert faces
            if (faces && faces.length > 0) {
                const indices = [];
                for (let i = 0; i < faces.length; i++) {
                    const face = faces[i];
                    if (Array.isArray(face)) {
                        indices.push(...face);
                    } else if (face.A !== undefined) {
                        indices.push(face.A, face.B, face.C);
                        if (face.D !== undefined) {
                            indices.push(face.A, face.C, face.D);
                        }
                    }
                }
                
                if (indices.length > 0) {
                    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
                }
            }
            
            geometry.computeVertexNormals();

            totalVertices += vertices.length;
            totalFaces += faces ? faces.length : 0;

            const material = new THREE.MeshPhongMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);
        } catch (e) {
            console.warn(`  ⚠ Could not convert geometry ${index}: ${e.message}`);
        }
    });

    console.log(`✓ Converted to Three.js scene`);
    console.log(`  - Total vertices: ${totalVertices}`);
    console.log(`  - Total faces: ${totalFaces}\n`);

    // Export to GLB
    const exporter = new GLTFExporter();
    return new Promise((resolve, reject) => {
        exporter.parse(scene, (result) => {
            if (result instanceof ArrayBuffer) {
                fs.writeFileSync(outputPath, Buffer.from(result));
                console.log(`✓ GLB exported successfully`);
                console.log(`  - Output size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB\n`);
                resolve({
                    success: true,
                    inputPath,
                    outputPath,
                    stats: {
                        geometries: geometries.length,
                        vertices: totalVertices,
                        faces: totalFaces
                    }
                });
            } else {
                reject(new Error('GLTFExporter did not return ArrayBuffer'));
            }
        }, (error) => {
            reject(new Error('GLTFExporter error: ' + error));
        });
    });
}

module.exports = {
    convert3dmToGlb,
    initialize3dm
};
