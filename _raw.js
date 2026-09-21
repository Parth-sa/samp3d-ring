const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://cea0d808.ring-options.pages.dev/lr12-raw', { waitUntil: 'networkidle', timeout: 90000 });
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => {
    const m = window.__raw12;
    if (!m) return { loaded: false };
    let meshes = 0, names = [], diamondMesh = null;
    m.traverse(o => {
      if (o.isMesh) { meshes++; if (names.length < 12) names.push(o.name); if (!diamondMesh && /marquise|diamond/i.test(o.name || '')) diamondMesh = { name: o.name, scale: o.scale ? +o.scale.x.toFixed(3) : 1 }; }
    });
    return { loaded: true, meshes, names, diamondMesh };
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();