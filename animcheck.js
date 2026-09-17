const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=LRS-02.glb');
  let ok = false;
  for (let i = 0; i < 8; i++) { ok = await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden')); if (ok) break; await p.waitForTimeout(3000); }
  const r = await p.evaluate(async () => {
    const hasAnim = window.__ringEditor && window.__ringEditor.hasAnimations();
    const animWrap = document.getElementById('st-anim');
    const animVisible = animWrap ? getComputedStyle(animWrap).display !== 'none' : false;
    autoTip = window.__ringEditor.hasAnimations();
    return { hasAnim, animVisible };
  });
  console.log('LRS-02 loaded:', ok, 'hasAnimations:', r.hasAnim, 'anim section visible:', r.animVisible);
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();
