// Ставит иконку и сведения о программе (автор, копирайт) в TekkenRU.exe без Wine/rcedit:
// node set-icon <путь к exe> <путь к .ico>
import * as ResEdit from 'resedit';
import { readFileSync, writeFileSync } from 'node:fs';

const AUTHOR = 'Зинченко Антон Васильевич';
const META = {
  CompanyName: AUTHOR,
  FileDescription: 'TekkenRU — справочник Tekken 8',
  LegalCopyright: `© 2026 ${AUTHOR}`,
  ProductName: 'TekkenRU',
  InternalName: 'TekkenRU',
  OriginalFilename: 'TekkenRU.exe',
};

export function setIcon(exePath, icoPath) {
  const exe = ResEdit.NtExecutable.from(readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(readFileSync(icoPath));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const target = groups[0] ?? { id: 1, lang: 1033 };
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, target.id, target.lang, ico.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    for (const lang of vi.getAllLanguagesForStringValues()) vi.setStringValues(lang, META);
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  writeFileSync(exePath, Buffer.from(exe.generate()));
}

if (process.argv[1] && /set-icon/.test(process.argv[1]) && process.argv[2]) {
  setIcon(process.argv[2], process.argv[3]);
  console.log('Иконка и сведения о программе обновлены:', process.argv[2]);
}
