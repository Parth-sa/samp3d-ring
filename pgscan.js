const fs = require('fs');
for (const f of fs.readdirSync('pg_assets')) {
  const s = fs.readFileSync('pg_assets/' + f, 'utf8');
  const m = s.match(/"([a-zA-Z]*[uU]rl[a-zA-Z]*|environment[a-zA-Z]*|background[a-zA-Z]*|texture[a-zA-Z]*|src|path|file)":\s*"([^"]+)"/g) || [];
  console.log('==== ' + f + ' len=' + s.length);
  console.log(Array.from(new Set(m)).slice(0, 20).join('\n') || '(no url-ish keys)');
}
