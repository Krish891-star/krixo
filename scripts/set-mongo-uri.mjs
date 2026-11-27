import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const uri = (await rl.question('Paste your MongoDB Atlas connection string: ')).trim();
rl.close();

if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
  console.error('That does not look like a MongoDB connection string. Nothing was changed.');
  process.exit(1);
}

let env = fs.readFileSync(envPath, 'utf8');
const line = `MONGODB_URI=${uri}`;
if (/^MONGODB_URI=.*$/m.test(env)) {
  env = env.replace(/^MONGODB_URI=.*$/m, line);
} else {
  env = `${env.trimEnd()}\n${line}\n`;
}
fs.writeFileSync(envPath, env);
console.log('MONGODB_URI saved to .env. Restart the server to apply it.');
