const h = require('fs').readFileSync('G:/webgi viewer/dist-opt/ring-editor.html', 'utf8');
console.log('swatch markup:', h.indexOf('id="metal-sw"') >= 0);
console.log('binding script (api.metalLib in html):', h.indexOf('api.metalLib') >= 0);
console.log('standalone class script:', /documentElement.className\s*=\s*'standalone'/.test(h));
const i = h.indexOf('window.addEventListener');
console.log('binding location snippet:\n' + (i>=0 ? h.slice(i-60, i+700) : 'NOT FOUND'));