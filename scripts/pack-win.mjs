// Сборка портативной версии под Windows x64 (можно запускать на Linux/macOS/Windows)
import { packager } from '@electron/packager';
import { cpSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setIcon } from './set-icon.mjs';

const keep = [/^\/dist(\/|$)/, /^\/dist-electron(\/|$)/, /^\/package\.json$/];

const [outDir] = await packager({
  dir: '.',
  out: 'release',
  name: 'TekkenRU',
  executableName: 'TekkenRU',
  platform: 'win32',
  arch: 'x64',
  overwrite: true,
  asar: true,
  prune: false,
  ignore: (p) => p !== '' && !keep.some((r) => r.test(p)),
  appCopyright: '© 2026 Зинченко Антон Васильевич',
  win32metadata: {
    CompanyName: 'Зинченко Антон Васильевич',
    FileDescription: 'TekkenRU — справочник Tekken 8',
    ProductName: 'TekkenRU',
    InternalName: 'TekkenRU',
    OriginalFilename: 'TekkenRU.exe',
  },
});

// оставляем только русскую и английскую локализацию Chromium (минус ~45 МБ)
for (const f of readdirSync(path.join(outDir, 'locales'))) {
  if (!['ru.pak', 'en-US.pak'].includes(f)) rmSync(path.join(outDir, 'locales', f));
}

// иконка Кинга на exe
setIcon(path.join(outDir, 'TekkenRU.exe'), 'build/king.ico');

// папка data рядом с exe = портативный режим (всё хранится рядом с программой)
mkdirSync(path.join(outDir, 'data'), { recursive: true });
writeFileSync(path.join(outDir, '.env.example'), 'TRANSLATE_API_KEY=ваш-ключ\n');
// постоянные данные (персонажи, переводы, версия игры) — лежат рядом с программой, их можно править руками
if (existsSync('base')) {
  execFileSync(process.execPath, ['scripts/make-manifest.mjs'], { stdio: 'inherit' }); // опись для автообновления
  cpSync('base', path.join(outDir, 'base'), { recursive: true });
}
if (existsSync('ПРОЧТИ.txt')) cpSync('ПРОЧТИ.txt', path.join(outDir, 'ПРОЧТИ.txt'));
console.log('Готово:', outDir);
