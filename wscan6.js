const s = require('fs').readFileSync('node_modules/webgi/dist/examples/runtime/bundle.m.js', 'utf8');
const keys = new Set();
for (const m of s.matchAll(/"([A-Za-z][A-Za-z0-9]{2,40})"/g)) keys.add(m[1]);
for (const m of s.matchAll(/'([A-Za-z][A-Za-z0-9]{2,40})'/g)) keys.add(m[1]);
const hits = Array.from(keys).sort().filter(k => /Plugin$|Controls|Environment|Diamond|Ground|Light|camera|Picker|Renderer|Texture|Loader|Frame|Interaction|Outline|Bloom|SSAO|Reflection|Vignette|Tonemap|S3|Measurement|Sky|Video|Contact|Shadow|Material|Config|Platform|Anisotropy|LUT|RGBM|Progressive|CameraView|GTAA|RendererManager/.test(k));
console.log(hits.length);
console.log(hits.join('\n'));
