// Автообновление базы с GitHub: сверяем опись (manifest.json) и докачиваем только изменённые файлы.
// Скачанное кладём в отдельный слой <папка данных>/base-update — папку программы не трогаем.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const REPO = 'AntonZinchenko-dev/tekkenRu';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/base/`;

export type BaseManifest = { format: number; generatedAt: string; gameVersion?: string; files: Record<string, string> };
export type BaseUpdateResult = { ok: boolean; checkedAt: string; updated: string[]; error?: string; remoteDate?: string };

const hash = (b: Buffer | Uint8Array) => createHash('sha1').update(b).digest('hex').slice(0, 16);
// только наши json-файлы, без выхода за пределы папки
const SAFE = /^[a-z0-9_-]+(\/[a-z0-9_.-]+)*\.json$/i;

async function readMaybe(file: string) {
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}

export async function updateBase(
  fetchFn: (url: string) => Promise<Response>,
  baseDir: string,
  updDir: string,
): Promise<BaseUpdateResult> {
  const checkedAt = new Date().toISOString();
  try {
    const res = await fetchFn(`${RAW}manifest.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`GitHub ответил ${res.status}`);
    const remote = (await res.json()) as BaseManifest;
    if (!remote || remote.format !== 1 || typeof remote.files !== 'object') throw new Error('непонятная опись базы');
    const updated: string[] = [];
    for (const [rel, sha] of Object.entries(remote.files)) {
      if (!SAFE.test(rel) || rel.includes('..')) continue;
      // что у нас сейчас: сначала слой обновлений, потом база рядом с программой
      const local = (await readMaybe(path.join(updDir, rel))) ?? (await readMaybe(path.join(baseDir, rel)));
      if (local && hash(local) === sha) continue;
      const r = await fetchFn(`${RAW}${rel}?v=${sha}`);
      if (!r.ok) throw new Error(`не скачался ${rel} (${r.status})`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (hash(buf) !== sha) throw new Error(`файл ${rel} пришёл повреждённым`);
      JSON.parse(buf.toString('utf8')); // это точно JSON
      const out = path.join(updDir, rel);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out + '.tmp', buf);
      await fs.rename(out + '.tmp', out);
      updated.push(rel);
    }
    await fs.mkdir(updDir, { recursive: true });
    await fs.writeFile(path.join(updDir, 'manifest.json'), JSON.stringify(remote));
    return { ok: true, checkedAt, updated, remoteDate: remote.generatedAt };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    return { ok: false, checkedAt, updated: [], error: /fetch|ENOTFOUND|ERR_INTERNET|network/i.test(msg) ? 'нет интернета или GitHub недоступен' : msg };
  }
}

/** Есть ли новая версия программы в Releases */
export async function checkAppRelease(fetchFn: (url: string) => Promise<Response>, current: string) {
  const res = await fetchFn(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (!res.ok) return { current, latest: null as string | null, url: `https://github.com/${REPO}/releases`, newer: false };
  const j = (await res.json()) as { tag_name?: string; html_url?: string };
  const latest = (j.tag_name ?? '').replace(/^v/i, '') || null;
  const num = (v: string) => v.split('.').map((x) => parseInt(x, 10) || 0);
  const cmp = (a: string, b: string) => {
    const x = num(a);
    const y = num(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1;
    return 0;
  };
  const newer = latest ? cmp(latest, current) > 0 : false;
  return { current, latest, url: j.html_url ?? `https://github.com/${REPO}/releases`, newer };
}
