const fs = require('fs');
for (const n of [1,2,3,4]) {
  const s = fs.readFileSync('pg_assets/scenesettings_ss-00' + n + '_vjson', 'utf8');
  const g = (k) => { const m = s.match(new RegExp('"' + k + '":\\s*(-?[\\d.]+)')); return m ? m[1] : '?'; };
  console.log('ss-00' + n, 'envMapIntensity=' + g('envMapIntensity'), 'exposure=' + g('exposure'), 'saturation=' + g('saturation'), 'contrast=' + g('contrast'), 'backgroundIntensity=' + g('backgroundIntensity'));
}
