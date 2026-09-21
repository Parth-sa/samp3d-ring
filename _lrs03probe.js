const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,140)));
  const design = '%257B%2522configId%2522%253A%2522LRS-03%2522%252C%2522model%2522%253A%2522.%252Fassets%252FLRS-03.glb%2522%252C%2522name%2522%253A%2522Loria%2520Solitaire%2522%252C%2522components%2522%253A%257B%2522center%2522%253A%257B%2522stoneType%2522%253A%2522Natural%2520Diamond%2522%252C%2522shape%2522%253A%2522Marquise%2522%252C%2522carat%2522%253A1.2%252C%2522color%2522%253A%2522D%2522%252C%2522clarity%2522%253A%2522VVS1%2522%257D%252C%2522band%2522%253A%257B%2522metalType%2522%253A%252218K%2522%252C%2522metalColor%2522%253A%252218K%2520Rose%2520Gold%2522%257D%257D%252C%2522exportedAt%2522%253A%25222026-09-19T19%253A19%253A36.044Z%2522%257D';
  const url = 'https://ring-options.pages.dev/ring-editor?design=' + design + '&model=assets%2FLRS-03.glb&standalone=';
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let pageHidden = false;
  for (let i = 0; i < 30; i++) {
    pageHidden = await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'));
    if (pageHidden) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(4000);
  const r = await p.evaluate((loaded) => {
    const out = { loaded };
    out.keys = Object.keys(window).filter(k => /webgi|WebGi|viewer|Viewer|editor|Editor|ED/i.test(k)).slice(0, 25);
    try {
      const app = document.getElementById('editor-app');
      out.appKeys = app ? Object.keys(app).slice(0, 30) : null;
    } catch (e) {}
    return out;
  }, pageHidden);
  console.log(JSON.stringify(r, null, 2));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();