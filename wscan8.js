const s = require('fs').readFileSync('node_modules/webgi/dist/examples/runtime/bundle.m.js', 'utf8');
let e = s.slice(s.indexOf('export{'));
e = e.slice(0, e.indexOf(';'));
const keys = ['SSAOPlugin', 'OutlineComposer', 'OutlinePlugin', 'VignettePlugin', 'FilmicGrainPlugin', 'ChromaticAberrationPlugin', 'CameraViewPlugin', 'FrameFade', 'SSReflection', 'SSContactShadows', 'ContactShadowGroundPlugin', 'NormalBufferPlugin', 'ProgressivePlugin', 'RandomizedLight', 'HDRiGroundPlugin', 'DiamondPlugin', 'GroundPlugin', 'SSGI', 'InteractionPrompt', 'SwitchNodePlugin', 'FullScreen', 'Tonemapping', 'RendererParams', 'CameraUi', 'AnisotropyPlugin', 'SimpleTextPlugin', 'VideoPlugin', 'LUTPlugin', 'Meshopt'];
for (const k of keys) {
  const re = new RegExp('[A-Za-z0-9_]*' + k + '[A-Za-z0-9_]* as ([A-Za-z0-9_]+)', 'g');
  const m = e.match(re);
  console.log(k, '=>', m ? Array.from(new Set(m.map(x => x.split(' as ')[1]))).join(', ') : '-');
}