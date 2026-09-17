const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const html = await (await p.goto('https://ring-options-v2.pages.dev/', { waitUntil: 'domcontentloaded' })).text();
  console.log('auto-reg snippet present:', html.includes('serviceWorker.register'));
  await p.waitForTimeout(6000);
  const reg = await p.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    return rs.map(r => ({ scope: r.scope, state: r.active ? 'active' : r.installing ? 'installing' : 'waiting' }));
  });
  console.log('regs after 6s:', JSON.stringify(reg));
  const man = await p.evaluate(async () => {
    try { const r = await navigator.serviceWorker.register('./sw.js'); return 'register-ok scope=' + r.scope; }
    catch (e) { return 'register-FAIL ' + e.message; }
  });
  console.log('manual:', man);
  await p.waitForTimeout(3000);
  console.log('after manual 3s:', JSON.stringify(await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { state: r ? (r.active ? 'active' : r.installing ? 'installing' : 'waiting') : null, controller: !!navigator.serviceWorker.controller }; })));
  await b.close();
})();