const fs = require('fs');
const s = fs.readFileSync('pg_assets/scenesettings_ss-001_vjson', 'utf8');
for (const m of s.matchAll(/https?:[^"\\ ]+/g)) console.log(m[0].slice(0, 160));
const k = s.indexOf('"envMap"');
while (k !== -1 && k < s.length) { console.log('--- envMap @', k, s.slice(k, k + 260).replace(/\s+/g,' ')); break; }
const t = s.indexOf('"textures"');
console.log('textures @', t, s.slice(t, t + 400).replace(/\s+/g,' '));
