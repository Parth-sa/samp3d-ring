const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const noid = async (p, tag) => {
    const errs = []; const blocked = [];
    p.on('pageerror', e => errs.push(String(e).slice(0,150)));
    const targets = ['packs.ijewel3d.com', 'releases.ijewel3d.com', 'storage.googleapis.com'];
    await p.route('**/*', (rt) => {
      const u = rt.request().url();
      if (targets.some(t => u.includes(t))) { blocked.push(u.slice(0,80)); return rt.abort(); }
      return rt.continue();
    });
    await p.goto('https://ring-options-v2.pages.dev/?x=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(tag === 'first' ? 14000 : 11000);
    const r = await p.evaluate(() => {
      const root = document.getElementById('root');
      const chars = root ? (root.textContent || '').length : 0;
      const canvas = !!document.querySelector('#webgi-canvas-container canvas, #webgi-mini-editor-canvas-container canvas');
      const imgs = Array.from(document.images).map(i => ({ n: i.naturalWidth, s: (i.src || '').slice(0, 70) })).filter(i => i.n > 0).length;
      const sw = !!navigator.serviceWorker && !!navigator.serviceWorker.controller;
      return { chars, canvas, imgs, sw };
    });
    console.log(tag, JSON.stringify(r), 'blockedReqs:', blocked.length, '| pageErrors:', errs.length ? errs.slice(0,3) : 'none');
    return { r, blocked: blocked.length };
  };
  // first load: online (seeds caches)
  const p1 = await ctx.newPage();
  const first = await noid(p1, 'first');
  await p1.waitForTimeout(4000); // let SW finish seed
  await ctx.addInitScript(() => navigator.serviceWorker.getRegistrations().then(r => r));

  const p2 = await ctx.newPage();
  const second = await noid(p2, 'second-OFFLINE');
  console.log('SW active page2:', await p2.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); return !!(reg && reg.active); }));
  await b.close();
})();