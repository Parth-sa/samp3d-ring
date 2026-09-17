const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 200)); });
  await p.goto('https://7542c3a8.ring-options.pages.dev/ring-embed3.html?model=assets/scene-10.glb&metal=%23ffffff&fit=1.3', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  const r = await p.evaluate(async () => {
    const out = {};
    try {
      const res = await fetch('./assets/env_metal_001.hdr');
      out.fetchStatus = res.status; out.contentType = res.headers.get('content-type'); out.bytes = (await res.arrayBuffer()).byteLength;
    } catch (e) { out.fetchErr = String(e); }
    try {
      const vw = window.__viewer3;
      const mgr = vw.getPlugin('AssetManagerPlugin') || vw.plugins.find(x => x.constructor?.name === 'AssetManagerPlugin');
      const env = await mgr.importer.importSinglePath('./assets/env_metal_001.hdr');
      out.envAsset = env ? (env.assetType + ' / ' + (env.texture ? 'has-texture' : 'no-texture')) : 'null';
    } catch (e) { out.envErr = String(e).slice(0, 300); }
    return out;
  });
  console.log('env probe:', JSON.stringify(r, null, 1));
  await b.close();
})();