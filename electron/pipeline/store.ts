// Локальное хранилище: JSON-файлы в папке данных приложения
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { MatchupCustom, UserCombo, FlowSet, AppMeta, CharacterData, CharacterInfo } from '../../shared/types';

const time = (s?: string) => (s ? Date.parse(s) || 0 : 0);

/**
 * Два слоя данных:
 *  - base (папка base рядом с программой) — постоянная часть, едет вместе с программой и правится руками после патчей;
 *  - dir (AppData) — то, что программа скачала сама («Обновить»), настройки и видео.
 * Для каждого раздела персонажа берётся более свежая версия.
 */
export class Store {
  /** слой обновлений базы, скачанных с GitHub: перекрывает папку base рядом с программой */
  public updDir: string;
  constructor(
    public dir: string,
    public baseDir?: string,
  ) {
    this.updDir = path.join(dir, 'base-update');
  }

  async init() {
    await fs.mkdir(path.join(this.dir, 'characters'), { recursive: true });
  }

  private async readJson<T>(file: string, root = this.dir): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(root, file), 'utf8')) as T;
    } catch {
      return null;
    }
  }

  private async readBase<T>(file: string) {
    const fresh = await this.readJson<T>(file, this.updDir);
    if (fresh) return fresh;
    return this.baseDir ? this.readJson<T>(file, this.baseDir) : null;
  }

  async getMeta(): Promise<AppMeta> {
    return (await this.readBase<AppMeta>('meta.json')) ?? { gameVersion: '', dataUpdated: '' };
  }

  async saveMeta(patch: Partial<AppMeta>) {
    const meta = { ...(await this.getMeta()), ...patch };
    // пишем туда, откуда версия сейчас и берётся (слой обновлений или папка base)
    const upd = path.join(this.updDir, 'meta.json');
    const target = (await this.readJson('meta.json', this.updDir)) || !this.baseDir ? upd : path.join(this.baseDir, 'meta.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(meta, null, 2), 'utf8');
    return meta;
  }

  private async writeJson(file: string, data: unknown) {
    const full = path.join(this.dir, file);
    const tmp = full + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 1), 'utf8');
    await fs.rename(tmp, full);
  }

  getCharacters = async () => (await this.readJson<CharacterInfo[]>('characters.json')) ?? (await this.readBase<CharacterInfo[]>('characters.json'));
  saveCharacters = (list: CharacterInfo[]) => this.writeJson('characters.json', list);

  getCharacter = async (id: string): Promise<CharacterData | null> => {
    const file = `characters/${safe(id)}.json`;
    const ffile = `flows/${safe(id)}.json`;
    const [base, own, baseFlows, ownFlows] = await Promise.all([
      this.readBase<CharacterData>(file),
      this.readJson<CharacterData>(file),
      this.readBase<FlowSet>(ffile),
      this.readJson<FlowSet>(ffile),
    ]);
    // цепочки лежат отдельными файлами (base\flows\<персонаж>.json) — их можно править руками
    const flows = time(ownFlows?.updatedAt) >= time(baseFlows?.updatedAt) ? ownFlows ?? baseFlows : baseFlows;
    const withFlows = (d: CharacterData | null) => (d && flows ? { ...d, flows } : d);
    if (!base) return withFlows(own);
    if (!own) return withFlows(base);
    const out: CharacterData = { ...base, ...own };
    out.frames = time(own.frames?.fetchedAt) >= time(base.frames?.fetchedAt) ? own.frames ?? base.frames : base.frames;
    for (const k of ['guide', 'meta', 'antistrat'] as const) {
      out[k] = time(own[k]?.translatedAt) >= time(base[k]?.translatedAt) ? own[k] ?? base[k] : base[k];
    }
    return withFlows(out);
  };
  saveCharacter = (data: CharacterData) => this.writeJson(`characters/${safe(data.id)}.json`, data);

  // ---- свои списки «Опасное у соперника»: user-matchups.json в папке данных ----
  async getMatchup(oppId: string): Promise<MatchupCustom | null> {
    const all = (await this.readJson<Record<string, MatchupCustom>>('user-matchups.json')) ?? {};
    return all[oppId] ?? null;
  }
  async saveMatchup(oppId: string, m: MatchupCustom | null): Promise<MatchupCustom | null> {
    const all = (await this.readJson<Record<string, MatchupCustom>>('user-matchups.json')) ?? {};
    if (m && m.items.length) all[oppId] = m;
    else delete all[oppId];
    await this.writeJson('user-matchups.json', all);
    return all[oppId] ?? null;
  }

  // ---- свои комбо пользователя: user-combos.json в папке данных ----
  async getUserCombos(charId: string): Promise<UserCombo[]> {
    const all = (await this.readJson<Record<string, UserCombo[]>>('user-combos.json')) ?? {};
    return all[charId] ?? [];
  }
  async saveUserCombos(charId: string, list: UserCombo[]): Promise<UserCombo[]> {
    const all = (await this.readJson<Record<string, UserCombo[]>>('user-combos.json')) ?? {};
    if (list.length) all[charId] = list;
    else delete all[charId];
    await this.writeJson('user-combos.json', all);
    return list;
  }

  async getNotesCache(): Promise<Record<string, string>> {
    return (await this.readJson<Record<string, string>>('notes-ru.json')) ?? {};
  }
  saveNotesCache = (c: Record<string, string>) => this.writeJson('notes-ru.json', c);

  async getSettingsRaw(): Promise<Record<string, unknown>> {
    return (await this.readJson<Record<string, unknown>>('settings.json')) ?? {};
  }
  saveSettingsRaw = (s: Record<string, unknown>) => this.writeJson('settings.json', s);

  async saveDebug(name: string, text: string) {
    await fs.mkdir(path.join(this.dir, 'debug'), { recursive: true });
    await fs.writeFile(path.join(this.dir, 'debug', safe(name)), text, 'utf8');
  }
}

const safe = (s: string) => s.replace(/[^a-z0-9._-]/gi, '_');

export const hashText = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);
