const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  p.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0,300)));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type() + ':', m.text().slice(0,200)); });
  const design = '%257B%2522configId%2522%253A%2522LRS-02%2522%252C%2522model%2522%253A%2522.%252Fassets%252FLRS-02.glb%2522%252C%2522name%2522%253A%2522Loria%2520Solitaire%2522%252C%2522components%2522%253A%257B%2522center%2522%253A%257B%2522stoneType%2522%253A%2522Lab-Grown%2520Diamond%2522%252C%2522shape%2522%253A%2522Marquise%2522%252C%2522carat%2522%253A1.5%252C%2522color%2522%253A%2522D%2522%252C%2522clarity%2522%253A%2522VVS1%2522%257D%252C%2522band%2522%253A%257B%2522metalType%2522%253A%252222K%2522%252C%2522metalColor%2522%253A%252218K%2520Yellow%2520Gold%2522%257D%257D%252C%2522exportedAt%2522%253A%25222026-09-11T10%253A49%253A00.549Z%2522%257D';
  const url = 'https://29e8bf2c.ring-options.pages.dev/ring-editor?design=' + design + '&standalone';
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(1500);
  const r1 = await p.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('#metal-sw button')).find(x => x.getAttribute('data-metal') === '14K White Gold');
    const res = window.__ED_api.metalLib('14K White Gold');
    return { ret: res, active: btn.classList.contains('active'), marked: btn.className };
  });
  console.log('direct metalLib call:', JSON.stringify(r1));
  const r2 = await p.evaluate(() => {
    document.querySelector('#metal-sw button[data-metal="14K Rose Gold"]').click();
    return Array.from(document.querySelectorAll('#metal-sw button')).map(x => x.getAttribute('data-metal') + ':' + x.className);
  });
  console.log('after ui click:', JSON.stringify(r2));
  await b.close();
})();