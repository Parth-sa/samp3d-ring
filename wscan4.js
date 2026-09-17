const s = require('fs').readFileSync('node_modules/webgi/dist/examples/runtime/bundle.m.js', 'utf8');
const classes = Array.from(new Set(s.match(/class\s+([A-Z][A-Za-z0-9_]*)/g) || []));
console.log(classes.length);
console.log(classes.join('\n').slice(0, 2500));
