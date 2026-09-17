const fs = require('fs');
for (const f of fs.readdirSync('pg_assets')) {
  if (!f.includes('vjson')) continue;
  const s = fs.readFileSync('pg_assets/' + f, 'utf8');
  const urls = Array.from(new Set(['https:'].concat((s.match(/assets\/[a-zA-Z0-9_\/.\-]+/g) || []).map(x => '/ ' + x))));
  console.log(f, '=>', urls.join(' | '));
}
