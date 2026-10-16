// Переведённый гайд персонажа обычным текстом: node scripts/guide-text.mjs lili
import { readFileSync } from 'node:fs';
import path from 'node:path';
const BASE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'base');
const id = process.argv[2];
const ch = JSON.parse(readFileSync(path.join(BASE, 'characters', `${id}.json`), 'utf8'));
for (const src of ['guide', 'antistrat', 'meta']) {
  const g = ch[src];
  if (!g) continue;
  console.log(`===== ${src}: ${g.url} (автор: ${g.author ?? '—'})`);
  if (g.summary) console.log('КРАТКО: ' + g.summary);
  for (const s of g.stances ?? []) console.log(`СТОЙКА ${s.abbr} (${s.name}): ${s.ru}`);
  for (const s of g.sections) {
    console.log(`\n## [${s.tab}] ${s.title}`);
    for (const b of s.blocks) {
      if (b.type === 'text') console.log(b.text);
      else if (b.type === 'bullets') b.items.forEach((x) => console.log('- ' + x));
      else if (b.type === 'move') console.log(`* \`${b.cmd}\` ${b.label ? '[' + b.label + '] ' : ''}${b.text}`);
      else if (b.type === 'combo') console.log(`combo: ${b.starters.join(' / ')} > ${b.route}${b.note ? ' (' + b.note + ')' : ''}`);
      else if (b.type === 'table') {
        console.log(b.columns.join(' | '));
        b.rows.forEach((r) => console.log(r.join(' | ')));
      }
    }
  }
}
