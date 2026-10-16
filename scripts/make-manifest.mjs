// Опись базы для автообновления: node scripts/make-manifest.mjs
// Для каждого файла в base/ — короткий отпечаток (sha1). Программа сверяет его с GitHub и докачивает только изменённое.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'base');
const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = path.relative(BASE, full).split(path.sep).join('/');
    if (statSync(full).isDirectory()) walk(full);
    else if (rel !== 'manifest.json' && name.endsWith('.json')) files[rel] = createHash('sha1').update(readFileSync(full)).digest('hex').slice(0, 16);
  }
};
walk(BASE);
const meta = JSON.parse(readFileSync(path.join(BASE, 'meta.json'), 'utf8'));
const manifest = { format: 1, generatedAt: new Date().toISOString(), gameVersion: meta.gameVersion, files };
writeFileSync(path.join(BASE, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`manifest: ${Object.keys(files).length} файлов, версия игры ${meta.gameVersion}`);
