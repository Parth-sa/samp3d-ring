const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const targets = ['packs.ijewel3d.com', 'releases.ijewel3d.com', 'storage.googleapis.com'];
  const load = async (tag, blockOffline) => {
    const p = await ctx.newPage();
    const errs = []; let blocked = 0;
    p.on('pageerror', e => errs.push(String(e).slice(0,150)));
    if (blockOffline) {
      await p.route('**/*', (rt) => {
        const u = rt.request().url();
        if (targets.some(t => u.includes(t))) { blocked++; return rt.abort(); }
        return rt.continue();
      });
    }
    await p.goto('https://ring-options-v2.pages.dev/?x=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(tag.startsWith('seed') || !blockOffline ? 15000 : 12000);
    const r = await p.evaluate(async () => {
      const root = document.getElementById('root');
      const chars = root ? (root.textContent || '').length : 0;
      const canvas = !!document.querySelector('#webgi-canvas-container canvas, #webgi-mini-editor-canvas-container canvas');
      const imgs = Array.from(document.images).filter(i => i.naturalWidth > 0).length;
      let sw = {};
      try { const reg = await navigator.serviceWorker.getRegistration(); sw = { active: !!reg, controller: !!navigator.serviceWorker.controller, scope: reg ? reg.scope : null }; } catch (e) { sw = { err: String(e) }; }
      return { chars, canvas, imgs, sw };
    });
    console.log(tag, JSON.stringify(r), 'blocked', blocked, '| pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  };
  await load('1-seed-ONLINE', false);
  await load('2-seed2-ONLINE', false);
  await load('3-OFFLINE-BLOCKED', true);
  await b.close();
})();