const s = require('fs').readFileSync('node_modules/webgi/dist/examples/runtime/bundle.m.js', 'utf8');
console.log('len', s.length);
for (const w of ["bloom", "ssao", "diamond", "ground", "filmicGrain", "outline", "vignette", "cameraView", "frameFade", "TonemappingPlugin", "BloomPlugin", "SSAOPlugin", "GroundPlugin", "CameraViewPlugin"]) {
  let n = 0, i = -1;
  while ((i = s.indexOf(w, i + 1)) !== -1) n++;
  console.log(w, n);
}
