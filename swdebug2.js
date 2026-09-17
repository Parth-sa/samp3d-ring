const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  await p.goto('https://ring-options-v2.pages.dev/?probe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(4000);
  await p.evaluate(() => navigator.serviceWorker.register('./sw.js'));
  await p.waitForTimeout(500);
  const snap = async (label) => {
    const s = await p.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return { active: !!(r && r.active && r.active.state), state: r && (r.installing ? 'installing' : r.waiting ? 'waiting' : r.active ? 'active' : 'none'), controller: !!navigator.serviceWorker.controller };
    });
    console.log(label, JSON.stringify(s));
  };
  await snap('t+0.5s');
  try {
    await p.evaluate(() => Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) => setTimeout(() => rej(new Error('READY-TIMEOUT')), 20000)),
    ]));
    await snap('ready-resolved');
  } catch (e) { console.log('ready failed:', e.message); }
  await p.waitForTimeout(3000);
  await snap('final');
  // cache contents
  const c = await p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    if (!r || !r.active) return 'no-active';
    const keys = await caches.keys();
    const entries = {};
    for (const k of keys) { const e = await caches.open(k); entries[k] = (await e.keys()).length; }
    return { keys, entries };
  });
  console.log('cache:', JSON.stringify(c));
  await b.close();
})();