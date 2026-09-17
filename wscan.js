const s = require('fs').readFileSync('node_modules/webgi/dist/examples/runtime/bundle.m.js', 'utf8');
const want = ["'bloom'", "'ssao'", "'outlines'", "'vignette'", "'filmicGrain'", "'chromaticAberration'", "'depthOfField'", "'ground'", "'diamond'", "'ssr'", "'gi'", "'frameFade'", "'cameraView'", "'renderManager'", "'random'" ];
for (const w of want) { let n = 0, i = -1; while ((i = s.indexOf(w, i + 1)) !== -1) n++; console.log(w, n); }
