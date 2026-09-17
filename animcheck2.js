const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=LRS-02.glb');
  for (let i = 0; i < 6; i++) {
    await p.waitForTimeout(5000);
    const st = await p.evaluate(() => {
      const l = document.getElementById('loader');
      const steps = Array.from(document.querySelectorAll('#ld-steps li')).map(li => li.className + ':' + li.textContent);
      return { hidden: l?.classList.contains('hidden'), phase: document.getElementById('ld-phase')?.textContent, status: document.getElementById('ld-status')?.textContent, steps: steps.slice(0,8) };
    });
    console.log(i+1, JSON.stringify(st));
    if (st.hidden) break;
  }
  const r = await p.evaluate(() => ({ hasAnim: window.__ringEditor ? window.__ringEditor.hasAnimations() : 'no-editor', animVisible: getComputedStyle(document.getElementById('st-anim')).display !== 'none', model: window.__ringEditor ? window.__ringEditor.currentModelName : null }));
  console.log('final:', JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,4) : 'none');
  await b.close();
})();
