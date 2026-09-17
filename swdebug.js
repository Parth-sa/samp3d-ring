const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const resp = await p.goto('https://ring-options-v2.pages.dev/sw.js');
  console.log('sw.js status', resp.status(), 'type', resp.headers()['content-type'], 'bytes', (await resp.body()).length);
  await p.goto('https://ring-options-v2.pages.dev/?probe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(8000);
  const r = await p.evaluate(async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      return { ok: true, active: !!reg.active, controller: !!navigator.serviceWorker.controller };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  console.log('manual register:', JSON.stringify(r));
  await p.waitForTimeout(4000);
  console.log('after wait:', JSON.stringify(await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { active: !!r && !!r.active, controller: !!navigator.serviceWorker.controller }; })));
  await b.close();
})();