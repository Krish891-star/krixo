import fs from 'node:fs';
const file = process.argv[2];
const needle = process.argv[3] || 'id="result-card"';
const s = fs.readFileSync(file, 'utf8');
const i = s.indexOf(needle);
console.log(JSON.stringify(s.slice(i, i + 180)));
