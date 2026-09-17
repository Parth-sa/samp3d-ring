const s = require('fs').readFileSync('node_modules/webgi/dist/examples/runtime/bundle.m.js', 'utf8');
let e = s.slice(s.indexOf('export{'));
e = e.slice(0, e.indexOf(';'));
const keys = ['SSBevelPlugin', 'ClearcoatTintPlugin', 'CustomBumpMapPlugin', 'NoiseBumpMaterialPlugin', 'ThinFilmLayerPlugin', 'LUTPlugin', 'RandomizedDirectionalLightPlugin', 'SSGIPlugin', 'DOFPlugin', 'DepthOfFieldPlugin', 'SSReflectionPlugin', 'ContactShadowGroundPlugin', 'AnimationHelperPlugin', 'SimpleTextPlugin', 'ObjectRotationPlugin', 'Highlight', 'Interaction', 'Video', 'SimpleLights', 'RGBM', 'Triplanar', 'FragmentClippingPlugin'];
for (const k of keys) {
  const re = new RegExp('[A-Za-z0-9_]*' + k + '[A-Za-z0-9_]* as ([A-Za-z0-9_]+)', 'g');
  const m = e.match(re);
  console.log(k, '=>', m ? Array.from(new Set(m.map(x => x.split(' as ')[1]))).join(', ') : '-');
}