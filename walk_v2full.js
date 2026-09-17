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
    const u = r.url();
    const h = new URL(u).host;
    if (!hosts.includes(h)) return;
    if (r.status() >= 400) return;
    try {
      const type = r.headers()['content-type'] || '';
      const buf = /json|text|javascript/.test(type) ? Buffer.from(await r.text()) : await r.body();
      if (!buf || !buf.length) return;
      const key = ++idx + '__' + u.replace(/[:\/?&=.]/g, '_').slice(0, 120) + '.' + (type.includes('json') ? 'json' : type.includes('png') ? 'png' : type.includes('javascript') ? 'js' : type.includes('wasm') ? 'wasm' : 'bin');
      const file = path.join(mirror, key);
      fs.writeFileSync(file, buf);
      manifest.push({ remote: u, local: 'mirror/' + key });
      console.log('SAVED', file, buf.length);
    } catch (e) {}
  });
  await p.goto('https://ring-options-v2.pages.dev/?probe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(15000);
  // interact: open Configuration, post processing, click some env swatches, try drop file
  const clickText = async (txt) => {
    const el = await p.$('text=' + txt).catch(() => null);
    if (el) { await el.click().catch(() => {}); return true; }
    const els = await p.$$('button, [role=button], .mode-button, .item, .component, .m-item');
    for (const h of els) { const t = ((await h.textContent().catch(() => '')) || '').trim(); if (t === txt) { await h.click().catch(() => {}); return true; } }
    return false;
  };
  for (const m of ['Picking', 'Scene', 'Anti-aliasing', 'Post Processing', 'Export', 'Modifiers', 'Configurators', 'Plugins', 'Viewer']) { await clickText(m).catch(() => {}); await p.waitForTimeout(800); }
  // try selecting an env swatch inside Viewer/Environment
  await p.waitForTimeout(3000);
  // attempt model pickup: dropzone hidden input
  const hasFileInputs = await p.evaluate(() => Array.from(document.querySelectorAll('input[type=file]')).map(i => i.id || i.className || 'x').length);
  console.log('file inputs:', hasFileInputs);
  await p.waitForTimeout(8000);
  fs.writeFileSync('mirror_manifest.json', JSON.stringify(manifest, null, 1));
  console.log('TOTAL', manifest.length, 'entries');
  await b.close();
})();