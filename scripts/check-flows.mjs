// Проверка цепочек: node scripts/check-flows.mjs [id ...]
// Каждая команда должна быть во фреймдате персонажа, структура — по схеме, цифры фреймов — совпадать с данными.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const BASE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'base');
const moveKey = (c) =>
  c
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[\s.+*]/g, '')
    .replace(/^(ch)/, '');
const looseKey = (c) => moveKey(c).replace(/,/g, '');

function index(moves) {
  const strict = new Map();
  const loose = new Map();
  for (const m of moves)
    for (const c of [m.command, m.id.replace(/^[^-]+-/, '')]) {
      if (!strict.has(moveKey(c))) strict.set(moveKey(c), m);
      if (!loose.has(looseKey(c))) loose.set(looseKey(c), m);
    }
  return (cmd) => {
    const c = cmd.replace(/\b(ch|CH)\s+/, '');
    return strict.get(moveKey(c)) ?? loose.get(looseKey(c));
  };
}

const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(path.join(BASE, 'flows')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));

let bad = 0;
for (const id of ids) {
  const errors = [];
  const warns = [];
  const fpath = path.join(BASE, 'flows', `${id}.json`);
  const cpath = path.join(BASE, 'characters', `${id}.json`);
  if (!existsSync(fpath)) {
    console.log(`✗ ${id}: нет файла ${fpath}`);
    bad++;
    continue;
  }
  let set;
  try {
    set = JSON.parse(readFileSync(fpath, 'utf8'));
  } catch (e) {
    console.log(`✗ ${id}: JSON не читается: ${e.message}`);
    bad++;
    continue;
  }
  const ch = JSON.parse(readFileSync(cpath, 'utf8'));
  const find = index(ch.frames?.moves ?? []);
  if (set.charId !== id) errors.push(`charId должен быть "${id}"`);
  if (!set.updatedAt || Number.isNaN(Date.parse(set.updatedAt))) errors.push('updatedAt — дата ISO');
  if (!Array.isArray(set.sources) || !set.sources.length) errors.push('sources: нужен хотя бы один источник {title,url}');
  for (const s of set.sources ?? []) if (!/^https?:\/\//.test(s.url ?? '')) errors.push(`источник без ссылки: ${JSON.stringify(s)}`);
  if (!Array.isArray(set.flows) || set.flows.length < 4) errors.push(`flows: нужно 4–8 схем, сейчас ${set.flows?.length ?? 0}`);
  if (set.flows?.length > 10) warns.push(`много схем (${set.flows.length}) — лучше 5–8`);

  const checkInline = (where, text) => {
    for (const m of String(text ?? '').matchAll(/`([^`]+)`/g)) {
      const c = m[1].trim();
      if (!find(c)) warns.push(`${where}: команда \`${c}\` не найдена во фреймдате`);
    }
    if (/[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(String(text ?? '').replace(/`[^`]*`/g, '')))
      warns.push(`${where}: похоже на непереведённый английский текст: "${String(text).slice(0, 60)}…"`);
  };
  const walk = (node, where, depth) => {
    if (!node || typeof node !== 'object') return errors.push(`${where}: пустой узел`);
    if (depth > 4) errors.push(`${where}: слишком глубоко (максимум 3 уровня веток)`);
    if (!node.cmd && !node.label) errors.push(`${where}: у узла нет ни cmd, ни label`);
    if (node.outcome && !['good', 'risk', 'info'].includes(node.outcome)) errors.push(`${where}: outcome только good|risk|info`);
    if (node.cmd) {
      const mv = find(node.cmd);
      if (!mv) errors.push(`${where}: команда "${node.cmd}" не найдена во фреймдате ${id}`);
      else {
        // цифры «на блоке» в тексте должны совпадать с данными
        for (const m of String(node.text ?? '').matchAll(/([+\-−]\d{1,2})\s*на\s*блоке/g)) {
          const n = m[1].replace('−', '-');
          if (!String(mv.block).includes(n.replace(/^\+/, '')) && !String(mv.block).includes(n))
            warns.push(`${where}: в тексте "${m[0]}", а по данным ${node.cmd} на блоке ${mv.block}`);
        }
      }
    }
    checkInline(where, node.text);
    for (const [i, b] of (node.next ?? []).entries()) {
      if (!b.if) errors.push(`${where}.next[${i}]: нет условия "if"`);
      checkInline(`${where}.next[${i}].if`, b.if);
      walk(b.then, `${where} → ${b.if?.slice(0, 25) ?? i}`, depth + 1);
    }
  };
  for (const [i, f] of (set.flows ?? []).entries()) {
    const w = `схема ${i + 1} «${f.title}»`;
    if (!f.title || !f.when) errors.push(`${w}: нужны title и when`);
    checkInline(w + ' when', f.when);
    checkInline(w + ' note', f.note);
    if (!f.root?.next?.length) warns.push(`${w}: у корня нет веток — это не схема, а просто совет`);
    walk(f.root, w, 1);
  }
  const ok = errors.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${id}: схем ${set.flows?.length ?? 0}, ошибок ${errors.length}, предупреждений ${warns.length}`);
  for (const e of errors) console.log('   ОШИБКА  ' + e);
  for (const w of warns) console.log('   внимание ' + w);
}
process.exit(bad ? 1 : 0);
