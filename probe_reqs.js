const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const reqs = [];
  p.on('request', r => { const u = r.url(); if (/packs\.ijewel3d|webgi|storage\.googleapis/.test(u)) reqs.push(r.method() + ' ' + u + '  hdrs:' + JSON.stringify(r.headers()).slice(0, 300)); });
  p.on('response', async r => { const u = r.url(); if (/packs\.ijewel3d/.test(u)) { let bd = ''; try { bd = (await r.text()).slice(0, 200); } catch (e) {} console.log('RESP', r.status(), u.slice(0, 140), '| body:', bd.replace(/\n/g, ' ')); } });
  await p.goto('https://ring-options-v2.pages.dev/?probe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(20000);
  console.log('---REQS---');
  for (const r of reqs.slice(0, 40)) console.log(r);
  console.log('total reqs logged', reqs.length);
  await b.close();
})();