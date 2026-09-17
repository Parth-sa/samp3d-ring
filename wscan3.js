const s = require('fs').readFileSync('node_modules/webgi/dist/examples/runtime/bundle.m.js', 'utf8');
const names = Array.from(new Set((s.match(/class\s+([A-Z][A-Za-z0-9]*Plugin\d*|[A-Z][A-Za-z0-9]*(Composer|Controls|Texture|Loader|Pipeline|Pass|System|Renderer))[A-Za-z0-9]*/g) || [])));
for (const k of ['Bloom','SSAO','Ground','CameraView','FrameFade','Outline','Transform','Picker','Diamond','Vignette','Filmic','Chromatic','DepthOfField','Renderer','Random','Interaction','Highlight','Anisotropic','LUT','Contact','Reflection','GI','SSR','S3']) {
  const hits = names.filter(n => n.includes(k));
  if (hits.length) console.log(k, '=>', hits.join(', '));
}
