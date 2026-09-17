const fs = require('fs');
let s = fs.readFileSync('src/ring-editor.ts', 'utf8');
s = s.replace(/else if \(this\.ringModel\) collect\(this\.ringModel\)/g, 'else collect(this.modelTree())');
s = s.replace(/if \(this\.ringModel\) walk\(this\.ringModel\)/g, 'walk(this.modelTree())');
fs.writeFileSync('src/ring-editor.ts', s);
const left = (s.match(/collect\(this\.ringModel\)|walk\(this\.ringModel\)/g) || []).length;
console.log('remaining direct ringModel walks:', left);