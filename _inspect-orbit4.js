var fs = require('fs');
var s = fs.readFileSync('dist-opt/webgi-orbit4.js', 'utf8');
var i = s.indexOf('fitFactor');
console.log('fitFactor idx', i, 'of', s.length);
console.log('ctx:\n', s.slice(i - 700, i + 420));
var j = s.search(/fitDistance = d \* /);
console.log('\nfitDistance assign idx', j);
if (j > 0) console.log(s.slice(j - 40, j + 40));