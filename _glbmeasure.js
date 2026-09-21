const { chromium } = require('playwright-core');
const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const THREE_URL = 'https://unpkg.com/three@0.139.2/build/three.min.js';
const LOADER_URL = 'https://unpkg.com/three@0.139.2/examples/js/loaders/GLTFLoader.js';
const DRACO_URL = 'https://unpkg.com/three@0.139.2/examples/js/loaders/DRACOLoader.js';
const DRACO_PATH = 'https://unpkg.com/three@0.139.2/examples/js/libs/draco/gltf/';
(async () => {
  const b = await chromium.launch({ executablePath: exe });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto('https://ring-options.pages.dev/lr12-raw.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.addScriptTag({ url: THREE_URL });
  await p.addScriptTag({ url: DRACO_URL });
  await p.addScriptTag({ url: LOADER_URL });
  for (const asset of ['assets/LRS-02.glb', 'assets/LR-12-v2.glb']) {
    const r = await p.evaluate(async ({ asset, DRACO_PATH }) => {
      const loader = new THREE.GLTFLoader();
      loader.setDRACOLoader(new THREE.DRACOLoader().setDecoderPath(DRACO_PATH));
      const gltf = await loader.loadAsync(asset);
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const out = [];
      root.traverse(c => {
        if (!c.isMesh) return;
        let box;
        if (c.geometry.boundingBox) box = c.geometry.boundingBox;
        else { c.geometry.computeBoundingBox(); box = c.geometry.boundingBox; }
        const v = new THREE.Vector3(); box.getSize(v);
        const diag = v.length();
        const worldPos = new THREE.Vector3(); c.getWorldPosition(worldPos);
        const ws = c.getWorldScale(new THREE.Vector3());
        const mat = c.material;
        out.push({
          node: c.name,
          mat: (typeof mat === 'object' && mat.name) ? mat.name : (Array.isArray(mat) ? mat.map(m => m.name).join(',') : '?'),
          size: diag,
          worldScale: [ws.x, ws.y, ws.z],
          pos: [Math.round(worldPos.x * 100) / 100, Math.round(worldPos.y * 100) / 100, Math.round(worldPos.z * 100) / 100],
        });
      });
      return { asset, meshes: out };
    }, { asset, DRACO_PATH });
    console.log('\n== ' + asset);
    for (const m of r.meshes) console.log('  ' + m.node + ' | mat=' + m.mat + ' | size=' + m.size.toFixed(3) + ' | scale=' + m.worldScale.join(','));
  }
  await b.close();
  console.log('errors:', errs.length ? errs.join(' ;; ') : 'none');
})();