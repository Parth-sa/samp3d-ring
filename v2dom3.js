const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  p.on('console', m => { if (m.type() === 'error') console.log('CONSERR', m.text().slice(0,120)); });
  await p.goto('https://playground.ijewel3d.com/v2/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(12000);
  const clickByText = async (txt) => {
    const el = await p.$$('button, a, [role=button], span');
    for (const h of el) { const t = (await h.textContent().catch(()=>'')) || ''; if (t.trim().startsWith(txt) && (await h.isVisible().catch(()=>false))) { await h.click().catch(()=>{}); return true; } }
    return false;
  };
  const labels = await p.evaluate(() => Array.from(document.querySelectorAll('button, a, [role=button]')).map(x => (x.textContent || '').trim().slice(0, 50)).filter(t => /[A-Za-z]/.test(t)));
  await clickByText('Configuration');
  await p.waitForTimeout(2500);
  const labelsAfter = await p.evaluate(() => Array.from(document.querySelectorAll('button, a, [role=button]')).map(x => (x.textContent || '').trim().slice(0, 60)).filter(t => /[A-Za-z0-9]/.test(t)));
  const body = await p.evaluate(() => {
    const seen = new Set(); const lines = [];
    const render = (el, depth) => {
      if (depth > 12 || !el) return;
      let cls = (typeof el.className === 'string' ? el.className.split(' ').slice(0,3).join('.') : '');
      let out = '  '.repeat(depth) + String(el.tagName).toLowerCase() + (el.id ? '#'+el.id : '') + (cls ? '.'+cls : '');
      const txt = (el.childNodes && el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? ' "'+el.childNodes[0].textContent.trim().slice(0,40)+'"' : '');
      const key = out;
      if (seen.has(key) && depth >= 2) return;
      if (depth >= 2) seen.add(key);
      lines.push(out + txt);
      const kids = Array.from(el.children || []);
      if (kids.length > 8 && depth >= 3) { lines.push(' '.repeat(depth*2+2) + '[' + kids.length + ' children]'); return; }
      kids.slice(0, 10).forEach(c => render(c, depth + 1));
    };
    Array.from(document.body.children).forEach(c => render(c, 0));
    return lines.join('\n');
  });
  require('fs').writeFileSync('v2_dom3.txt', body);
  require('fs').writeFileSync('v2_labels_before.txt', Array.from(new Set(labels)).join('\n'));
  require('fs').writeFileSync('v2_labels_after.txt', Array.from(new Set(labelsAfter)).join('\n'));
  console.log('body bytes', body.length, 'labels before', labels.length, 'after', labelsAfter.length);
  await b.close();
})();