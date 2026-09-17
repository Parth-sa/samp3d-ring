const h = require('fs').readFileSync('G:/webgi viewer/dist-opt/ring-editor.html', 'utf8');
const i = h.indexOf('api.metalLib');
console.log(h.slice(i - 1200, i + 300));