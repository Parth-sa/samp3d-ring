const h = require('fs').readFileSync('G:/webgi viewer/dist-opt/ring-editor.html', 'utf8');
console.log('bad .js.js:', h.indexOf('.js.js') >= 0);
const m = h.match(/ring-editor\.[0-9a-f]+\.js/g);
console.log('refs:', m);