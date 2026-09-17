const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb');
  await p.waitForTimeout(4000);
  const t1 = await p.evaluate(() => ({
    hidden: document.getElementById('loader').classList.contains('hidden'),
    steps: document.querySelectorAll('#ld-steps li').length,
    phase: document.getElementById('ld-phase').textContent,
    html: document.getElementById('ld-steps').innerHTML.slice(0,200)
  }));
  for (let i = 0; i < 4; i++) { await p.waitForTimeout(3000); }
  const t2 = await p.evaluate(() => ({
    hidden: document.getElementById('loader').classList.contains('hidden'),
    steps: document.querySelectorAll('#ld-steps li').length,
    phase: document.getElementById('ld-phase').textContent,
    html: document.getElementById('ld-steps').innerHTML.slice(0,200)
  }));
  console.log('t1:', JSON.stringify(t1));
  console.log('t2:', JSON.stringify(t2));
  await b.close();
})();
