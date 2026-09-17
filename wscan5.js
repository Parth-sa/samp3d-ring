const s = require('fs').readFileSync('node_modules/webgi/dist/examples/runtime/bundle.m.js', 'utf8');
const keys = Array.from(new Set((s.match(/['"]([A-Z][A-Za-z0-9]{2,25})['"]/g) || [])).map(k => k.replace(/['"]/g, ''))).sort();
const hits = keys.filter(k => /Plugin|Controls|Environment|Diamond|Ground|Light|camera|Picker|Renderer|Texture|Loader|Frame|Interaction|Outline|Bloom|SSAO|Reflection|Vignette|Tonemap|S3|Measurement|Sky|Video|UV|Contact|Shadow|Material|Preview|Config|Platform|Anisotropy|LUT|RGBM|SSAO/.test(k));
console.log(hits.slice(0, 120).join('\n'));
