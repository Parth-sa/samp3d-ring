const s = require('fs').readFileSync('node_modules/webgi/dist/examples/runtime/bundle.m.js', 'utf8');
const i = s.indexOf('export{');
console.log(s.slice(i, i + 4000));
