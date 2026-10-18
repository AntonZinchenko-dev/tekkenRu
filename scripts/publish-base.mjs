// Выложить свою базу всем: node scripts/publish-base.mjs [папка данных]
//
// Программа держит базу в двух слоях:
//   base/                         — общая часть, её же пользователи скачивают с GitHub;
//   %APPDATA%\TekkenRU\data       — то, что твоя программа скачала и перевела сама («Обновить всё»).
// Скрипт сливает твой слой в base/ точно так же, как программа выбирает данные при показе
// (по каждому разделу берётся более свежий), и пересчитывает опись base/manifest.json.
// Личное (настройки, ключ, свои комбо, свои списки соперников, видео) НЕ трогается и не выкладывается.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, 'base');

// где лежит твой слой: аргумент, иначе %APPDATA%\TekkenRU\data, иначе переносная папка рядом с программой
const candidates = [
  process.argv[2],
  process.env.APPDATA && path.join(process.env.APPDATA, 'TekkenRU', 'data'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'TekkenRU', 'data'),
  path.join(ROOT, 'TekkenRU', 'TekkenRU-win32-x64', 'data'),
].filter(Boolean);
const DATA = candidates.find((d) => existsSync(path.join(d, 'characters')));
if (!DATA) {
  console.error('Не нашёл папку данных программы. Искал:\n  ' + candidates.join('\n  '));
  console.error('Укажи её явно: node scripts/publish-base.mjs "C:\\путь\\к\\data"');
  process.exit(1);
}
console.log(`Твоя база: ${DATA}`);

const time = (s) => (s ? Date.parse(s) || 0 : 0);
const read = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const list = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')) : []);
// Сравниваем по содержимому, а не по тексту: если данные те же — файл не трогаем вовсе
// (иначе у всех пользователей зря перекачается вся база). Пишем в формате, принятом для этого файла.
const write = (file, data, before, indent) => {
  if (before !== null && JSON.stringify(JSON.parse(before)) === JSON.stringify(data)) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, indent ? JSON.stringify(data, null, indent) : JSON.stringify(data));
  return true;
};
const rawOf = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);

const changed = [];
const stale = []; // где в base/ свежее, чем у тебя (кто-то уже выложил новее) — не трогаем, только говорим

// 1) персонажи: по разделам, как в программе (фреймдата — по fetchedAt, гайды — по translatedAt)
for (const name of list(path.join(DATA, 'characters'))) {
  const own = read(path.join(DATA, 'characters', name));
  if (!own?.id) continue;
  const file = path.join(BASE, 'characters', name);
  const beforeRaw = rawOf(file);
  const base = beforeRaw ? JSON.parse(beforeRaw) : null;
  let out;
  if (!base) out = own;
  else {
    out = { ...base, ...own };
    out.frames = time(own.frames?.fetchedAt) >= time(base.frames?.fetchedAt) ? own.frames ?? base.frames : base.frames;
    if (time(base.frames?.fetchedAt) > time(own.frames?.fetchedAt)) stale.push(`${name}: фреймдата`);
    for (const k of ['guide', 'meta', 'antistrat']) {
      out[k] = time(own[k]?.translatedAt) >= time(base[k]?.translatedAt) ? own[k] ?? base[k] : base[k];
      if (time(base[k]?.translatedAt) > time(own[k]?.translatedAt)) stale.push(`${name}: ${k}`);
    }
    // цепочки внутрь файла персонажа не кладём — они лежат отдельно в base/flows
    delete out.flows;
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  }
  if (write(file, out, beforeRaw, 0)) changed.push(`characters/${name}`); // персонажи — одной строкой
}

// 2) цепочки: целиком, кто свежее по updatedAt
for (const name of list(path.join(DATA, 'flows'))) {
  const own = read(path.join(DATA, 'flows', name));
  if (!own) continue;
  const file = path.join(BASE, 'flows', name);
  const beforeRaw = rawOf(file);
  const base = beforeRaw ? JSON.parse(beforeRaw) : null;
  if (base && time(base.updatedAt) >= time(own.updatedAt)) continue;
  if (base && JSON.stringify(base) === JSON.stringify(own)) continue;
  // цепочки отформатированы руками — копируем файл как есть
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, readFileSync(path.join(DATA, 'flows', name)));
  changed.push(`flows/${name}`);
}

// 3) список персонажей (если программа скачала свежий — с новыми бойцами)
const ownChars = read(path.join(DATA, 'characters.json'));
if (Array.isArray(ownChars) && ownChars.length) {
  const file = path.join(BASE, 'characters.json');
  const beforeRaw = rawOf(file);
  const base = beforeRaw ? JSON.parse(beforeRaw) : [];
  // никого не теряем: свои + те, кого нет в своём списке
  const ids = new Set(ownChars.map((c) => c.id));
  const merged = [...ownChars, ...base.filter((c) => !ids.has(c.id))];
  if (write(file, merged, beforeRaw, 1)) changed.push('characters.json');
}

// 4) версия игры: если ты её поменял в программе (⚙ → «Версия игры»)
const ownMeta = read(path.join(DATA, 'base-update', 'meta.json'));
if (ownMeta?.gameVersion) {
  const file = path.join(BASE, 'meta.json');
  const beforeRaw = rawOf(file);
  const base = beforeRaw ? JSON.parse(beforeRaw) : {};
  if (ownMeta.gameVersion !== base.gameVersion) {
    const meta = { ...base, gameVersion: ownMeta.gameVersion, dataUpdated: new Date().toISOString().slice(0, 10) };
    writeFileSync(file, JSON.stringify(meta, null, 2));
    changed.push('meta.json');
  }
}

// 5) опись для автообновления — пересчитываем всегда, когда что-то поменялось
if (changed.length) {
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
  const meta = read(path.join(BASE, 'meta.json')) ?? {};
  writeFileSync(path.join(BASE, 'manifest.json'), JSON.stringify({ format: 1, generatedAt: new Date().toISOString(), gameVersion: meta.gameVersion, files }, null, 1) + '\n');
}

console.log('');
if (!changed.length) console.log('Твоя база ничем не новее той, что уже в base/ — выкладывать нечего.');
else {
  console.log(`Обновлено в base/: ${changed.length} файл(ов):`);
  for (const f of changed) console.log('  ' + f);
  console.log('Опись base/manifest.json пересчитана.');
}
if (stale.length) {
  console.log(`\nВ base/ уже есть более свежие разделы, чем у тебя (их оставил как есть): ${stale.length}`);
  for (const s of stale.slice(0, 10)) console.log('  ' + s);
  if (stale.length > 10) console.log('  …');
}
