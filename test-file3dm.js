const fs = require('fs');
const path = require('path');

async function testFile3dm() {
    try {
        const rhino = await require('rhino3dm')();
        const fileBuffer = fs.readFileSync('20( 1LOT)\\20( 1LOT)\\1 (1).3dm');
        
        const file3dm = rhino.File3dm.fromByteArray(new Uint8Array(fileBuffer));
        const objectsTable = file3dm.objects();
        
        if (objectsTable.count > 0) {
            const obj = objectsTable.get(0);
            console.log('Object properties/methods:');
            console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).slice(0, 50).join('\n'));
            
            // Look for geometry property
            console.log('\n\nSearching for geometry:');
            const proto = Object.getPrototypeOf(obj);
            const props = Object.getOwnPropertyNames(proto);
            const geomProps = props.filter(p => p.toLowerCase().includes('geom') || p.toLowerCase().includes('mesh') || p.toLowerCase().includes('curve'));
            console.log('Geometry-related:', geomProps.join('\n'));
            
            // Try to access directly
            console.log('\n\nDirect access:');
            if (obj.geometry) console.log('geometry:', obj.geometry);
            if (obj.Geometry) console.log('Geometry:', obj.Geometry);
            if (obj.geometry instanceof Function) console.log('geometry() works');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        console.error(error);
    }
}

testFile3dm();
