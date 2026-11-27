import fs from 'node:fs';
const file = process.argv[2] || 'dist/assets/main-dGw_B6Um.css';
const s = fs.readFileSync(file, 'utf8');
const i = s.indexOf('.kx-hero-art{height:auto');
console.log(JSON.stringify(s.slice(i, i + 420)));
