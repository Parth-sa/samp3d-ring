const https = require('https');
const fs = require('fs');
const base = 'https://playground.ijewel3d.com/assets/';
const targets = [
  'scenesettings/ss-001.vjson','scenesettings/ss-002.vjson','scenesettings/ss-003.vjson','scenesettings/ss-004.vjson',
  'materials/metal/polished/metal-yellowgold-polished.pmat',
  'materials/metal/polished/metal-whitegold-polished.pmat',
  'materials/metal/polished/metal-rosegold-polished.pmat'
];
const get = (u) => new Promise(res => {
  https.get(u, { headers: {} }, r => {
    if (r.statusCode !== 200) return res('HTTP ' + r.statusCode);
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
  }).on('error', e => res('ERR ' + e.message));
});
(async () => {
  const out = fs.mkdirSync('pg_assets', { recursive: true });
  const report = {};
  for (const t of targets) {
    const body = await get(base + t);
    report[t] = body.slice(0, 240);
    if (/^\{/.test(body) || /\/assets/.test(body)) {
      const m = body.match(/"(?:url|envMap|environment|background|texture|map|urls?|asset|file)":\s*"[^"]*\.(?:hdr|exr|png|jpg|jpeg|webp)"/gi) || [];
      report[t + ' ::assets'] = Array.from(new Set(m)).slice(0, 30).join(' | ');
      fs.writeFileSync('pg_assets/' + t.replace(/[/.]/g, '_'), body);
    }
  }
  console.log(JSON.stringify(report, null, 1));
})();
