const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const logs = [];
  p.on('console', m => logs.push('[' + m.type() + '] ' + m.text().slice(0, 300)));
  p.on('pageerror', e => logs.push('[pageerror] ' + e.message.slice(0, 300)));
  await p.goto('https://playground.ijewel3d.com/?noUpdate', { waitUntil: 'networkidle', timeout: 120000 }).catch(e => console.log('goto err', e.message));
  await p.waitForTimeout(6000);
  const info = await p.evaluate(() => {
    const q = (s) => document.querySelectorAll(s);
    const text = q('body').length ? q('body')[0].innerText.slice(0, 3000) : '';
    const links = Array.from(q('a')).map(a => a.href).filter(h => h && h.length < 200);
    const buttons = Array.from(q('button')).map(bt => bt.textContent.trim()).filter(Boolean).slice(0, 40);
    return { title: document.title, text, links, buttons, imgs: q('img').length };
  });
  console.log('TITLE:', info.title);
  console.log('TEXT:', JSON.stringify(info.text).slice(0, 1500));
  console.log('LINKS:', JSON.stringify(info.links).slice(0, 2000));
  console.log('BUTTONS:', JSON.stringify(info.buttons));
  await p.screenshot({ path: 'playground.png' });
  console.log('LOGS:'); console.log(logs.slice(0, 12).join('\n'));
  await b.close();
})();
