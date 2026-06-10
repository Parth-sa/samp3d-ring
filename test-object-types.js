const fs = require('fs');

async function testObjectTypes() {
    try {
        const rhino = await require('rhino3dm')();
        const fileBuffer = fs.readFileSync('20( 1LOT)\\20( 1LOT)\\1 (1).3dm');
        
        const file3dm = rhino.File3dm.fromByteArray(new Uint8Array(fileBuffer));
        const objectsTable = file3dm.objects();
        
        if (objectsTable.count > 0) {
            const obj = objectsTable.get(0);
            const geom = obj.geometry();
            
            if (geom) {
                console.log('Geometry methods:');
                const proto = Object.getPrototypeOf(geom);
                const methods = Object.getOwnPropertyNames(proto).filter(m => typeof proto[m] === 'function');
                console.log(methods.slice(0, 50).join('\n'));
                
                // Look for mesh-related methods
                console.log('\n\nMesh-related methods:');
                const meshMethods = methods.filter(m => m.toLowerCase().includes('mesh') || m.toLowerCase().includes('triangulat'));
                console.log(meshMethods.join('\n') || 'None found');
                
                // Check if there's a toMesh or similar method
                console.log('\n\nChecking specific methods:');
                ['getMesh', 'toMesh', 'createMesh', 'triangulate', 'mesh'].forEach(m => {
                    if (typeof geom[m] === 'function') {
                        console.log(`geom.${m}() exists`);
                    }
                });
            }
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testObjectTypes();
