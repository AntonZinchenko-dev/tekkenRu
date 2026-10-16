// Компактная фреймдата персонажа: node scripts/moves-table.mjs lili [фильтр]
import { readFileSync } from 'node:fs';
import path from 'node:path';
const BASE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'base');
const [id, filter] = process.argv.slice(2);
const ch = JSON.parse(readFileSync(path.join(BASE, 'characters', `${id}.json`), 'utf8'));
console.log('команда | уровни | старт | блок | хит | контрхит | теги | заметки');
for (const m of ch.frames.moves) {
  const line = [m.command, m.hitLevel, m.startup, m.block, m.hit, m.counterHit, Object.keys(m.tags ?? {}).join(' '), (m.notes ?? '').replace(/\s*\n\s*/g, '; ').slice(0, 140)].join(' | ');
  if (!filter || line.toLowerCase().includes(filter.toLowerCase())) console.log(line);
}
console.log('стойки:', ch.frames.stances.join(', '));
