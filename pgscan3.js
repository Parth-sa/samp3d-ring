const fs = require('fs');
const s = fs.readFileSync('pg_assets/scenesettings_ss-001_vjson', 'utf8');
console.log('http occurrences:', (s.match(/https?:/g) || []).length);
const i = s.indexOf('"environment"');
console.log('env @', i, s.slice(i, i + 700));
const j = s.indexOf('"resources"');
console.log('resources @', j, s.slice(j, j + 500));
