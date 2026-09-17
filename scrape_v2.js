const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const urls = []; const assets = [];
  p.on('response', r => {
    const u = r.url();
    if (/assets\//.test(u)) assets.push(u + ' ' + r.status() + ' ' + (r.headers()['content-type'] || ''));
    if (!/\.(png|jpg|jpeg|gif|svg|woff2?|css|js)(\?|$)/i.test(u)) urls.push(u + ' ' + r.status());
  });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://playground.ijewel3d.com/v2/', { timeout: 60000 });
  await p.waitForTimeout(12000);
  const dom = await p.evaluate(() => ({
    title: document.title,
    buttons: Array.from(document.querySelectorAll('button,[role=button],.btn,.v-btn')).map(b => (b.textContent || '').trim()).filter(t => t && t.length < 60).slice(0, 80),
    acc: Array.from(document.querySelectorAll('[class*=accordion],details,.v-accordion')).map(a => (a.textContent || '').trim().slice(0, 120)).slice(0, 40),
    texts: Array.from(document.querySelectorAll('h1,h2,h3,h4,label,.v-label,.vue-renderer')).map(t => (t.textContent || '').trim()).filter(t => t.length > 2 && t.length < 80).slice(0, 120),
    iframe: !!document.querySelector('iframe'),
    canvas: Array.from(document.querySelectorAll('canvas')).length,
    html: document.body ? document.body.innerHTML.slice(0, 3000) : ''
  }));
  fs.writeFileSync('v2_scrape.json', JSON.stringify({ assets: Array.from(new Set(assets)).slice(0, 250), urls: Array.from(new Set(urls)).slice(0, 60), dom, errs }, null, 1));
  console.log('assets:', assets.length);
  console.log('TITLE:', dom.title);
  console.log('BTNS:', JSON.stringify(dom.buttons));
  console.log('ACCS:', JSON.stringify(dom.acc));
  console.log('TEXTS:', JSON.stringify(dom.texts));
  await b.close();
})();
