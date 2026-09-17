const fs = require('fs');
const s = fs.readFileSync('pg_assets/scenesettings_ss-001_vjson', 'utf8');
const keys = Array.from(new Set(s.match(/"([A-Za-z_][A-Za-z0-9_]*)":/g) || []));
console.log('ALL KEYS:', keys.join(' '));
for (const k of ['Environment','Configurator','SceneSettings','Background','Ground','Light','Camera','Plugin']) {
  const i = s.indexOf('"' + k);
  console.log('--- ' + k + ' @ ' + i);
  if (i >= 0) console.log(s.slice(Math.max(0, i - 40), i + 400).replace(/\n\s+/g, ' '));
}
