const https = require('https');
const get = (u, max) => new Promise((res) => {
  https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
    console.log('URL', u);
    console.log('  status', r.statusCode);
    console.log('  headers', JSON.stringify(r.headers, null, 0).slice(0, 700));
    let size = 0; const chunks = [];
    r.on('data', c => { size += c.length; if (size <= max) chunks.push(c); });
    r.on('end', () => { console.log('  size', size, 'bytes'); res(Buffer.concat(chunks)); });
  }).on('error', e => { console.log('ERR', e.message); res(null); });
});
(async () => {
  const j = await get('https://packs.ijewel3d.com/api/view_data/v1/', 2000000);
  require('fs').writeFileSync('view_data.json', j || '');
  console.log('--- sample ---');
  console.log(String(j || '').slice(0, 3000));
})();