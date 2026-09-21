const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://44a4f366.ring-options.pages.dev/lr12', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 20; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const loaderText = document.getElementById('loader')?.innerText || '';
    let scene = null;
    try {
      const v = window.webGiViewers && window.webGiViewers[0];
      if (v && v.scene) {
        const root = v.scene.modelRoot && v.scene.modelRoot.modelObject;
        let meshCount = 0, bounds = null;
        if (root) {
          root.traverse(o => { if (o.isMesh) meshCount++; });
          const bb = new (root.box3 || THREE && THREE.Box3)();
          try {
            const Box3 = window.THREE ? THREE.Box3 : null;
            if (Box3) { bounds = new Box3().setFromObject(root); bounds = { min: bounds.min.toArray().map(n=>+n.toFixed(3)), max: bounds.max.toArray().map(n=>+n.toFixed(3)) }; }
          } catch (e) {}
        }
        scene = { meshCount, bounds, hasRoot: !!root };
      }
    } catch (e) { scene = 'ERR ' + String(e); }
    return { loaderText: loaderText.replace(/\s+/g, ' ').slice(0, 120), scene };
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();