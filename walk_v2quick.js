const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const mirror = 'v2clone/mirror';
  fs.mkdirSync(mirror, { recursive: true });
  const manifest = [];
  const hosts = ['packs.ijewel3d.com', 'releases.ijewel3d.com', 'storage.googleapis.com'];
  let idx = 0;
  p.on('response', async (r) => {
    const u = r.url(); const h = new URL(u).host;
    if (!hosts.includes(h) || r.status() >= 400) return;
    try {
      const type = r.headers()['content-type'] || '';
      const buf = /json|text|javascript/.test(type) ? Buffer.from(await r.text()) : await r.body();
      if (!buf || !buf.length) return;
      const key = ++idx + '__' + u.replace(/[:\/?&=.]/g, '_').slice(0, 120) + '.' + (type.includes('json') ? 'json' : type.includes('png') ? 'png' : type.includes('javascript') ? 'js' : 'bin');
      fs.writeFileSync(path.join(mirror, key), buf);
      manifest.push({ remote: u, local: 'mirror/' + key });
    } catch (e) {}
  });
  await p.goto('https://ring-options-v2.pages.dev/?probe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(12000);
  fs.writeFileSync('mirror_manifest.json', JSON.stringify(manifest, null, 1));
  console.log('TOTAL', manifest.length);
  await b.close();
})();