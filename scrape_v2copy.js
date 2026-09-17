const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const outdir = 'v2clone';
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });
  const saved = [];
  const isStatic = (u) => /\/v2\//.test(u) && !/google|cloudflareinsights|analytics|gtag|gsi|accounts.google/.test(u);
  p.on('response', async (r) => {
    const u = r.url();
    if (!isStatic(u)) return;
    try {
      const type = r.headers()['content-type'] || '';
      let buf = null;
      if (/json/.test(type)) buf = Buffer.from(await r.text());
      else buf = await r.body();
      if (!buf) return;
      let rel = u.split('/v2/')[1] || 'index.html';
      rel = decodeURIComponent(rel).replace(/[?#].*$/, '');
      const file = path.join(outdir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      saved.push(u + ' -> ' + rel + ' (' + buf.length + 'B)');
    } catch (e) { console.log('save-fail', u, e.message.slice(0, 80)); }
  });
  await p.goto('https://playground.ijewel3d.com/v2/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(20000);
  // poke reactive chunks: open Configuration + a model from packs to pull extra chunks
  const tryClick = async (txt) => {
    const els = await p.$$('button, a, [role=button]');
    for (const h of els) { const t = ((await h.textContent().catch(() => '')) || '').trim(); if (t.startsWith(txt)) { await h.click().catch(() => {}); return true; } }
    return false;
  };
  await tryClick('Configuration');
  await p.waitForTimeout(4000);
  await tryClick('Export');
  await p.waitForTimeout(3000);
  const tree = fs.readdirSync(outdir, { recursive: true });
  console.log('SAVED', tree.length, 'files:');
  for (const f of tree) console.log('  ' + f);
  console.log('NET');
  fs.writeFileSync('v2clone_manifest.json', JSON.stringify({ saved }, null, 1));
  await b.close();
})();