const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const get = (u, out) => new Promise(res => {
  https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { get(new URL(r.headers.location, u).href, out).then(res); return; }
    const b = [];
    r.on('data', c => b.push(c));
    r.on('end', () => { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.concat(b)); console.log('got', out, Buffer.concat(b).length); res(); });
  }).on('error', () => res());
});
const jobs = [
  ['https://playground.ijewel3d.com/logo_black.svg', 'v2clone/logo_black.svg'],
  ['https://playground.ijewel3d.com/logo.svg', 'v2clone/logo.svg'],
  ['https://cdn.jsdelivr.net/gh/repalash/gilroy-free-webfont@master/Gilroy-Extrabold.css', 'v2clone/gilroy.css'],
];
(async () => { for (const [u, o] of jobs) await get(u, o); })();