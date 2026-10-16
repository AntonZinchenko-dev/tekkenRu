// Очередь обновления базы: скачать → перевести → сохранить, с прогрессом для интерфейса
import type { CharacterData, CharacterInfo, JobState, Move, SourceKind, TranslatedPage } from '../../shared/types';
import { fetchCharacters, fetchFrameData, fetchPage } from './source';
import { hashText, type Store } from './store';
import { findUnverifiedCommands, Translator } from './translate';

type Opts = { ids?: string[]; force?: boolean; framesOnly?: boolean };

export class UpdateJob {
  state: JobState = { running: false, total: 0, done: 0, current: [], log: [], usage: { input: 0, output: 0, costUsd: 0 } };
  private abort?: AbortController;

  constructor(
    private store: Store,
    private getTranslator: () => Translator | null,
    private concurrency: () => number,
    private emit: (s: JobState) => void,
    private onCharacter: (id: string) => void,
  ) {}

  private log(level: 'info' | 'warn' | 'error', text: string) {
    const time = new Date().toLocaleTimeString('ru-RU');
    this.state.log = [...this.state.log.slice(-300), { time, level, text }];
    this.emit({ ...this.state });
  }

  cancel() {
    this.abort?.abort();
  }

  async run(opts: Opts) {
    if (this.state.running) return;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.state = { running: true, total: 0, done: 0, current: [], log: [], usage: { input: 0, output: 0, costUsd: 0 } };
    this.emit({ ...this.state });

    try {
      const characters = await fetchCharacters(signal);
      await this.store.saveCharacters(characters);
      const targets = opts.ids?.length ? characters.filter((c) => opts.ids!.includes(c.id)) : characters;
      const translator = opts.framesOnly ? null : this.getTranslator();
      if (!translator && !opts.framesOnly) {
        this.log('warn', 'Ключ API для перевода не задан — скачаю только фреймдату (без перевода гайдов). Ключ можно указать в настройках.');
      }
      const kinds: SourceKind[] = translator ? ['guide', 'meta', 'antistrat'] : [];
      this.state.total = targets.length * (1 + kinds.length);
      this.emit({ ...this.state });
      this.log('info', `Персонажей: ${targets.length}. Разделов к обработке: ${this.state.total}.`);

      // Этап 1: фреймдата (быстро, без нейросети)
      await pool(targets, 6, async (c) => {
        if (signal.aborted) return;
        await this.step(`${c.displayName}: фреймдата`, async () => {
          try {
            const frames = await fetchFrameData(c.id, signal);
            await this.patch(c.id, (d) => {
              // переводы заметок сохраняем, если команда та же
              const prevRu = new Map((d.frames?.moves ?? []).map((m) => [m.id + '|' + m.notes, m.notesRu]));
              frames.moves = frames.moves.map((m) => ({ ...m, notesRu: prevRu.get(m.id + '|' + m.notes) }));
              d.frames = frames;
              if (d.errors) delete d.errors.frames;
            });
          } catch (e) {
            await this.patch(c.id, (d) => {
              d.errors = { ...d.errors, frames: errText(e) };
            });
            throw e;
          }
        });
      });

      // Этап 1б: перевод заметок фреймдаты (одним общим словарём на всех)
      if (translator && !signal.aborted) await this.translateNotes(targets, translator, signal);

      // Этап 2: гайды, шпаргалки, анти-страты через нейросеть
      if (translator) {
        const tasks = targets.flatMap((c) => kinds.map((k) => ({ c, k })));
        await pool(tasks, this.concurrency(), async ({ c, k }) => {
          if (signal.aborted) return;
          await this.step(`${c.displayName}: ${KIND_RU[k]}`, () => this.translatePage(c, k, translator, !!opts.force, signal));
        });
      }
      this.log('info', signal.aborted ? 'Остановлено.' : 'Готово ✔');
    } catch (e) {
      this.log('error', `Ошибка: ${errText(e)}`);
    } finally {
      this.state.running = false;
      this.state.current = [];
      this.emit({ ...this.state });
    }
  }

  private async step(label: string, fn: () => Promise<void>) {
    this.state.current = [...this.state.current, label];
    this.emit({ ...this.state });
    try {
      await fn();
    } catch (e) {
      if (!this.abort?.signal.aborted) this.log('error', `${label} — ${errText(e)}`);
    } finally {
      this.state.current = this.state.current.filter((x) => x !== label);
      this.state.done++;
      this.emit({ ...this.state });
    }
  }

  private async load(id: string): Promise<CharacterData> {
    return (await this.store.getCharacter(id)) ?? { id };
  }

  // Сохранение одного персонажа последовательно, чтобы параллельные задачи не затирали друг друга
  private saveChain = new Map<string, Promise<void>>();
  private async patch(id: string, fn: (d: CharacterData) => void) {
    const prev = this.saveChain.get(id) ?? Promise.resolve();
    const next = prev.then(async () => {
      const d = await this.load(id);
      fn(d);
      await this.store.saveCharacter(d);
    });
    this.saveChain.set(id, next.catch(() => {}));
    await next;
    this.onCharacter(id);
  }

  private addUsage(u: { input: number; output: number; costUsd: number }) {
    this.state.usage = {
      input: this.state.usage.input + u.input,
      output: this.state.usage.output + u.output,
      costUsd: this.state.usage.costUsd + u.costUsd,
    };
  }

  private async translatePage(c: CharacterInfo, kind: SourceKind, tr: Translator, force: boolean, signal: AbortSignal) {
    const src = await fetchPage(c.id, kind, signal);
    if (!src) {
      await this.patch(c.id, (d) => {
        d.errors = { ...d.errors, [kind]: 'На сайте нет этого раздела' };
      });
      return;
    }
    const hash = hashText(src.markdown);
    const existing = (await this.load(c.id))[kind];
    // гайды, подготовленные вручную, не переводим заново без явной команды «Перевести заново»
    if (!force && existing?.hash?.startsWith('manual-') && existing.sections.length) return;
    if (!force && existing && existing.hash === hash && existing.sections.length) {
      return; // не изменилось — перевод не нужен
    }
    await this.store.saveDebug(`${c.id}-${kind}.md`, src.markdown);
    const { page, usage } = await tr.translatePage({
      kind,
      characterName: c.displayName,
      markdown: src.markdown,
      sourceLang: src.lang,
      signal,
    });
    this.addUsage(usage);
    const bad = findUnverifiedCommands(page, src.markdown);
    if (bad.length > 3) this.log('warn', `${c.displayName}: ${KIND_RU[kind]} — команды не найдены в исходнике, проверь: ${bad.slice(0, 6).join(', ')}`);
    const result: TranslatedPage = {
      source: kind,
      url: src.url,
      hash,
      model: tr.model,
      translatedAt: new Date().toISOString(),
      sourceLang: src.lang,
      author: src.author,
      ...page,
    };
    await this.patch(c.id, (d) => {
      d[kind] = result;
      if (d.errors) delete d.errors[kind];
    });
  }

  private async translateNotes(targets: CharacterInfo[], tr: Translator, signal: AbortSignal) {
    const cache = await this.store.getNotesCache();
    const all = new Set<string>();
    const datas: CharacterData[] = [];
    for (const c of targets) {
      const d = await this.load(c.id);
      datas.push(d);
      for (const m of d.frames?.moves ?? []) for (const l of noteLines(m.notes)) all.add(l);
    }
    const missing = [...all].filter((l) => !(l in cache));
    if (missing.length) {
      this.log('info', `Перевожу заметки фреймдаты: ${missing.length} строк…`);
      const batches: string[][] = [];
      for (let i = 0; i < missing.length; i += 200) batches.push(missing.slice(i, i + 200));
      await pool(batches, this.concurrency(), async (batch) => {
        if (signal.aborted) return;
        try {
          const { map, usage } = await tr.translateLines(batch, signal);
          this.addUsage(usage);
          for (const [k, v] of map) cache[k] = v;
        } catch (e) {
          this.log('warn', `Часть заметок не переведена: ${errText(e)}`);
        }
      });
      await this.store.saveNotesCache(cache);
    }
    for (const d of datas) {
      if (!d.frames) continue;
      await this.patch(d.id, (fresh) => {
        if (!fresh.frames) return;
        fresh.frames.moves = fresh.frames.moves.map((m: Move) => ({ ...m, notesRu: translateNotes(m.notes, cache) }));
      });
    }
  }
}

const KIND_RU: Record<SourceKind, string> = { guide: 'гайд', meta: 'шпаргалка', antistrat: 'анти-страты' };

export const noteLines = (notes: string) =>
  notes
    .split('\n')
    .map((l) => l.replace(/^\s*[*-]\s*/, '').trim())
    .filter(Boolean);

const translateNotes = (notes: string, cache: Record<string, string>) =>
  noteLines(notes)
    .map((l) => cache[l] ?? l)
    .join('\n');

const errText = (e: unknown) => {
  if (e instanceof Error) {
    const status = (e as { status?: number }).status;
    if (status === 401) return 'неверный ключ API (401)';
    if (status === 429) return 'слишком много запросов, лимит API (429) — уменьши параллельность';
    if (status === 529) return 'сервер перевода перегружен (529), повтори позже';
    return e.message;
  }
  return String(e);
};

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) {
      const x = items[i++];
      await fn(x);
    }
  });
  await Promise.all(workers);
}
