const { chromium } = require('playwright-core');
const design = '%257B%2522configId%2522%253A%2522LRS-03%2522%252C%2522model%2522%253A%2522.%252Fassets%252FLRS-03.glb%2522%252C%2522name%2522%253A%2522Loria%2520Solitaire%2522%252C%2522components%2522%253A%257B%2522center%2522%253A%257B%2522stoneType%2522%253A%2522Natural%2520Diamond%2522%252C%2522shape%2522%253A%2522Marquise%2522%252C%2522carat%2522%253A1.5%252C%2522color%2522%253A%2522D%2522%252C%2522clarity%2522%253A%2522VVS1%2522%257D%252C%2522band%2522%253A%257B%2522metalType%2522%253A%252218K%2522%252C%2522metalColor%2522%253A%252218K%2520Rose%2520Gold%2522%257D%257D%252C%2522exportedAt%2522%253A%25222026-09-19T19%253A31%253A47.905Z%2522%257D';
const url = 'https://ring-options.pages.dev/ring-editor?design=' + design + '&model=assets%2FLRS-03.glb&standalone=';
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let hidden = false;
  for (let i = 0; i < 30; i++) { hidden = await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden')); if (hidden) break; await p.waitForTimeout(2500); }
  await p.waitForTimeout(5000);
  const buf = await p.screenshot({ type: 'png' });
  require('fs').writeFileSync('G:/webgi viewer/LRS-03-render.png', buf);
  console.log('saved LRS-03-render.png', buf.length, 'bytes, loaded:', hidden);
  await b.close();
})();