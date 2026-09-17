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
  const r = await p.evaluate(async () => {
    const pgSel = document.getElementById('st-sel-pg');
    const envSel = document.getElementById('st-sel-env');
    const gemSel = document.getElementById('st-sel-gem');
    const envOpts = Array.from(envSel.options).map(o => o.textContent);
    const gemOpts = Array.from(gemSel.options).map(o => o.textContent);
    pgSel.value = 'pg1'; pgSel.dispatchEvent(new Event('change'));
    await new Promise(res => setTimeout(res, 3500));
    const ed = window.__ringEditor;
    return {
      envOpts, gemOpts,
      didApply: await p.evaluate(() => new Promise(r => setTimeout(() => r('settled'), 3500))).then(() => true),
      curEnv: document.getElementById('st-cur-pg')?.textContent,
      sceneEnvSet: !!(ed && ed.viewer && (ed.viewer.scene || {}).envMap),
      groundEl: !!(ed && ed.groundEl)
    };
  });
  console.log('env opts:', JSON.stringify(r.envOpts));
  console.log('gem opts:', JSON.stringify(r.gemOpts));
  console.log('preset apply → sceneEnvSet:', r.sceneEnvSet, 'ground:', r.groundEl);
  console.log('HTTP>=400:', bad.length ? bad.slice(0,5) : 'none');
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();
