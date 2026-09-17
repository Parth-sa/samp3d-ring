const fs = require('fs');
for (const n of [1,2,3,4]) {
  const s = fs.readFileSync('pg_assets/scenesettings_ss-00' + n + '_vjson', 'utf8');
  const bg = s.match(/"backgroundColor": \{(?:[^}]*\})/)[0];
  const bgr = s.match(/"background": \{([^}]*)\}/);
  const ground = s.indexOf('"type": "Ground"');
  console.log('ss-00' + n, 'bgColor:', bg.replace(/\s+/g,' '));
  console.log('   ground@', ground, s.slice(Math.max(0,ground-260), ground+20).replace(/\s+/g,' ').slice(-300));
}
