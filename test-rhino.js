async function testRhino3dm() {
    try {
        const rhino = await require('rhino3dm')();
        console.log('Available on rhino module:');
        console.log(Object.keys(rhino).slice(0, 50).join('\n'));
        console.log('\n...');
        
        // Try to access File3dm
        if (rhino.File3dm) {
            console.log('\nFile3dm available. Methods:');
            console.log(Object.getOwnPropertyNames(rhino.File3dm).join('\n'));
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testRhino3dm();
