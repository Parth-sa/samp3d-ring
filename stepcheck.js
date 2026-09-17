const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 4; i++) {
    const st = await p.evaluate(() => {
      const ls = document.getElementById('ld-steps');
      const ld = document.getElementById('loader');
      const steps = (window.__ED_diag && window.__ED_diag.steps || []).map(s => s.n);
      return { hidden: ld && ld.classList.contains('hidden'), steps, html: ls ? ls.innerText.split('\n').filter(Boolean).join(' | ') : '' };
    });
    console.log('poll', i + 1, JSON.stringify(st).slice(0, 400));
    if (st.hidden) break;
    await p.waitForTimeout(2500);
  }
  await b.close();
})();
