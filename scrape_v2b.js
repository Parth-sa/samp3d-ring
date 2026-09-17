const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  await p.goto('https://playground.ijewel3d.com/v2/', { timeout: 60000 });
  await p.waitForTimeout(8000);
  const r = await p.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button,[role=button]')).map(b => (b.textContent || '').trim()).filter(t => t && t.length < 80);
    const uniq = Array.from(new Set(all));
    const panels = Array.from(document.querySelectorAll('[class*=panel],[class*=sidebar],[class*=menu],[class*=config]')).map(e => (e.className + '').slice(0, 60)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 60);
    const selects = Array.from(document.querySelectorAll('select')).map(s => Array.from(s.options).map(o => o.textContent.trim()).slice(0, 10)).filter(a => a.length);
    return { uniq: uniq.filter((t, i) => uniq.indexOf(t) === i), panels, selects, selCount: selects.length };
  });
  fs.writeFileSync('v2_full.json', JSON.stringify(r, null, 1));
  console.log('unique buttons:', r.uniq.length);
  console.log(JSON.stringify(r.uniq, null, 1));
  console.log('panels:', JSON.stringify(r.panels));
  console.log('selects:', JSON.stringify(r.selects, null, 0).slice(0, 1200));
  await b.close();
})();
