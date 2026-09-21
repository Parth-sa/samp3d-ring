const h = require('fs').readFileSync('G:/webgi viewer/dist-opt/ring-editor.html', 'utf8');
const m = h.match(/ring-editor\.[0-9a-f]+\.js/g);
console.log('refs:', m);
console.log('bad .js.js:', h.indexOf('.js.js') >= 0);
console.log('slider markup:', h.indexOf('id="fit-range"') >= 0);
console.log('setFit wiring:', h.indexOf('setFit') >= 0 && h.indexOf('api.setFit') >= 0);