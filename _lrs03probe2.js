const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  const design = '%257B%2522configId%2522%253A%2522LRS-03%2522%252C%2522model%2522%253A%2522.%252Fassets%252FLRS-03.glb%2522%252C%2522name%2522%253A%2522Loria%2520Solitaire%2522%252C%2522components%2522%253A%257B%2522center%2522%253A%257B%2522stoneType%2522%253A%2522Natural%2520Diamond%2522%252C%2522shape%2522%253A%2522Marquise%2522%252C%2522carat%2522%253A1.2%252C%2522color%2522%253A%2522D%2522%252C%2522clarity%2522%253A%2522VVS1%2522%257D%252C%2522band%2522%253A%257B%2522metalType%2522%253A%252218K%2522%252C%2522metalColor%2522%253A%252218K%2520Rose%2520Gold%2522%257D%257D%252C%2522exportedAt%2522%253A%25222026-09-19T19%253A19%253A36.044Z%2522%257D';
  const url = 'https://ring-options.pages.dev/ring-editor?design=' + design + '&model=assets%2FLRS-03.glb&standalone=';
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let pageHidden = false;
  for (let i = 0; i < 30; i++) { pageHidden = await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden')); if (pageHidden) break; await p.waitForTimeout(2500); }
  await p.waitForTimeout(4000);
  const r = await p.evaluate((loaded) => {
    const out = { loaded };
    const app = document.getElementById('editor-app');
    out.appProps = app ? Object.getOwnPropertyNames(app).slice(0, 40) : null;
    out.canvas = document.getElementById('editor-canvas') ? Object.getOwnPropertyNames(document.getElementById('editor-canvas')).filter(n => /viewer|webgi|gi|ed/i.test(n)).slice(0, 20) : null;
    out.diag = (typeof window.__ED_diag !== 'undefined') ? Object.keys(window.__ED_diag).slice(0, 20) : null;
    out.bodyProps = Object.getOwnPropertyNames(document.body).filter(n => /rg|ed|gi/i.test(n)).slice(0, 30);
    const detach = [];
    const any = app || document.body;
    for (const k of Object.getOwnPropertyNames(any)) { try { const v = any[k]; if (v && typeof v === 'object' && v.scene) detach.push(k); } catch (e) {} }
    out.withScene = detach;
    return out;
  }, pageHidden);
  console.log(JSON.stringify(r, null, 2));
  await b.close();
})();