const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const errs = []; const bad = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb&cb=' + Date.now());
  for (let i = 0; i < 8; i++) { if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break; await p.waitForTimeout(3000); }
  const r = await p.evaluate(() => {
    const sel = (id) => document.getElementById(id);
    const envOpts = Array.from(sel('st-sel-env').options).map(o => o.textContent);
    const gemOpts = Array.from(sel('st-sel-gem').options).map(o => o.textContent);
    sel('st-sel-pg').value = 'pg1'; sel('st-sel-pg').dispatchEvent(new Event('change'));
    return { envOpts, gemOpts };
  });
  await p.waitForTimeout(4500);
  const r2 = await p.evaluate(() => {
    const ed = window.__ringEditor;
    return {
      curEnv: document.getElementById('st-cur-pg')?.textContent,
      sceneEnvSet: !!(ed && ed.viewer && (ed.viewer.scene || {}).envMap),
      groundEl: !!(ed && ed.groundEl)
    };
  });
  console.log('env opts:', JSON.stringify(r.envOpts));
  console.log('gem opts:', JSON.stringify(r.gemOpts));
  console.log('preset apply → sceneEnvSet:', r2.sceneEnvSet, 'ground:', r2.groundEl, 'cur:', r2.curEnv);
  console.log('HTTP>=400:', bad.length ? bad.slice(0,5) : 'none');
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();
