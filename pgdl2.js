const https = require('https');
const fs = require('fs');
const files = {
  'gem/env-gem-001.exr': 'https://playground.ijewel3d.com/assets/hdrmaps/gem/env-gem-001.exr',
  'gem/env-gem-002.exr': 'https://playground.ijewel3d.com/assets/hdrmaps/gem/env-gem-002.exr',
  'gem/env-gem-003.hdr': 'https://playground.ijewel3d.com/assets/hdrmaps/gem/env-gem-003.hdr',
  'gem/env-gem-004.exr': 'https://playground.ijewel3d.com/assets/hdrmaps/gem/env-gem-004.exr',
  'metal/env-metal-001.hdr': 'https://playground.ijewel3d.com/assets/hdrmaps/metal/env-metal-001.hdr',
  'metal/env-metal-002.exr': 'https://playground.ijewel3d.com/assets/hdrmaps/metal/env-metal-002.exr',
  'metal/env-metal-003.hdr': 'https://playground.ijewel3d.com/assets/hdrmaps/metal/env-metal-003.hdr'
};
const dir = 'assets/hdrmaps';
fs.mkdirSync(dir + '/gem', { recursive: true });
fs.mkdirSync(dir + '/metal', { recursive: true });
const get = (u) => new Promise((res, rej) => {
  https.get(u, r => {
    if (r.statusCode !== 200) return rej('HTTP ' + r.statusCode);
    const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => res(Buffer.concat(chunks)));
  }).on('error', rej);
});
(async () => {
  for (const [rel, url] of Object.entries(files)) {
    try {
      const buf = await get(url);
      fs.writeFileSync(dir + '/' + rel, buf);
      console.log(rel, buf.length + ' bytes');
    } catch (e) { console.log(rel, 'FAIL', e); }
  }
})();
