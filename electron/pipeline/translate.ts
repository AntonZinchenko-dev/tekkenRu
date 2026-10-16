// Перевод и сжатие страниц через API языковой модели (ответ строго по схеме через вызов инструмента)
import Anthropic from '@anthropic-ai/sdk';
import type { Block, Section, SourceKind, StanceInfo, TabId } from '../../shared/types';
import { MODELS } from '../../shared/types';
import { looseMoveKey } from '../../src/notation/tokenize';

const TABS: TabId[] = ['overview', 'combos', 'moves', 'tactics', 'counter', 'cheatsheet'];

export const SYSTEM_PROMPT = `Ты — редактор русскоязычного справочника по Tekken 8 для игрока, который смотрит его на втором мониторе прямо во время игры. Тебе дают страницу сайта tekkendocs.com в виде markdown. Перенеси ВСЁ полезное содержание на русский язык в сжатом виде и вызови инструмент save_page.

ПРАВИЛА
1. Команды (нотацию) переноси ДОСЛОВНО, символ в символ, как в источнике: df3+4, BT d+2, qcf1,4, f,F+4, H.2+3, b1f, DEW 3+4. Не переводи, не исправляй, не добавляй и не убирай пробелы.
   В исходнике ссылки на приёмы уже обёрнуты в \`обратные кавычки\`. Команды, выделенные **жирным** или написанные просто текстом, тоже оборачивай в обратные кавычки. Внутри русского текста любая команда ВСЕГДА в обратных кавычках, иначе её не нарисовать.
2. Сжимай: убирай воду, вводные слова, эмоции и шутки автора, повторы, историю патчей (оставляй только то, что важно для игры сейчас). Абзац → 1–3 коротких ясных предложения по сути: что делает приём, когда применять, чем рискуешь. Пиши простым языком, как опытный игрок объясняет другу.
3. Ничего не выдумывай: никаких приёмов, фреймов, комбо и советов, которых нет в источнике. Цифры фреймов переносить можно, только если они есть в тексте.
4. Служебные строки фреймдаты вида "mi20~22+3c oB+8c oH+19a oCH" или "h, hi10-6 oB+4 oH" выбрасывай — фреймы приложение покажет само.
5. Глоссарий: block → блок; on block / on hit → на блоке / при попадании; +5 on block → +5 на блоке; punish / punisher → наказание; whiff punish → наказание за промах; launcher → лаунчер; counter hit → контр-хит (CH); high / mid / low → хай / мид / лоу; homing → хоминг; tracking → трекинг; sidestep → сайдстеп; sidewalk → сайдвок; backdash → бэкдэш; frame trap → фрейм-ловушка; mix-up, 50/50 → миксап, 50/50; wall splat → удар в стену (сплат); wall carry → вынос к стене; chip damage → чип-урон; power crush → павер-краш; jab → джеб; downjab → даун-джеб; string → связка; natural combo → натуральная связка (NC); wake-up / okizeme → ситуация на подъёме (оки); keepout → кипаут (не подпускать); whiff → промах; crouch → присед; high crush → уходит от хаев; float → подброс; poke → тычок. Heat, Heat Engager, Heat Smash, Heat Dash, Heat Burst, Rage Art, Power Crush — оставляй по-английски. Названия приёмов (собственные имена вроде "Submissive Heel") не переводи. Названия стоек — оригинал, при первом упоминании с переводом в скобках.
6. Раскладывай материал по вкладкам (поле tab):
   overview — суть персонажа, сильные и слабые стороны, Heat-система, стойки, общий план игры;
   combos — все комбо (основные, для новичков, у стены, маленькие, эндеры/завершения);
   moves — топ-приёмы, заметные приёмы, ключевые инструменты;
   tactics — наказания (punishers), паник-кнопки, фрейм-ловушки, проверки знаний, сетапы, флоучарты;
   counter — как играть ПРОТИВ этого персонажа: защитные советы, что наказывать, как разбирать связки, какие хаи можно пригнуть;
   cheatsheet — сводные списки и таблицы.
7. Блоки:
   text — короткий абзац;
   bullets — список коротких пунктов;
   move — один приём: cmd (команда дословно), label (2–5 слов о роли приёма, например «Контр-хит лаунчер, мид»), text (1–3 предложения);
   combo — одно комбо: starters (список стартеров — команды дословно, без пояснений), route (шаги через " → ", команды дословно, как в источнике), note (необязательно, по-русски, например «при попадании у стены»);
   table — таблица: columns и rows; команды в ячейках в обратных кавычках; короткие пояснения по-русски.
8. Пустые разделы пропускай. Внешние ссылки (YouTube, Discord, соцсети авторов) не включай.
9. Заголовки секций (title) — по-русски, коротко: «Сильные стороны», «Наказания», «Комбо у стены» и т.п.`;

const SOURCE_HINT: Record<SourceKind, string> = {
  guide:
    'Это ГАЙД по персонажу. Дополнительно заполни summary (2–3 предложения: кто это и в чём его игра) и stances — все стойки персонажа, которые встречаются в тексте: abbr — сокращение как в нотации (например DEW, RAB, BT), name — оригинальное название, ru — что это и как туда попасть (1 фраза).',
  meta: 'Это ШПАРГАЛКА (cheat sheet): списки Heat-приёмов, хоминга, наказаний, комбо, торнадо, павер-крашей и т.п. Всё клади во вкладку cheatsheet; списки команд оформляй таблицами или маркированными списками; комбо — блоками combo во вкладке cheatsheet.',
  antistrat:
    'Это АНТИ-СТРАТЫ — как играть ПРОТИВ этого персонажа (наказания по фреймам, разбор связок, дакаемые хаи, плюсовые приёмы, стойки, Heat). Всё клади во вкладку counter. Наказания по фреймам удобнее таблицей «Минус на блоке → чем наказать / что делать».',
};

const pageSchema = {
  type: 'object',
  required: ['sections'],
  properties: {
    summary: { type: 'string', description: 'Только для гайда: 2–3 предложения о персонаже' },
    stances: {
      type: 'array',
      items: {
        type: 'object',
        required: ['abbr', 'name', 'ru'],
        properties: { abbr: { type: 'string' }, name: { type: 'string' }, ru: { type: 'string' } },
      },
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tab', 'title', 'blocks'],
        properties: {
          tab: { type: 'string', enum: TABS },
          title: { type: 'string' },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type'],
              properties: {
                type: { type: 'string', enum: ['text', 'bullets', 'move', 'combo', 'table'] },
                text: { type: 'string' },
                items: { type: 'array', items: { type: 'string' } },
                cmd: { type: 'string' },
                label: { type: 'string' },
                starters: { type: 'array', items: { type: 'string' } },
                route: { type: 'string' },
                note: { type: 'string' },
                columns: { type: 'array', items: { type: 'string' } },
                rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  },
} as const;

export type Usage = { input: number; output: number; costUsd: number };

const cost = (model: string, input: number, output: number) => {
  const m = MODELS.find((x) => x.id === model) ?? MODELS[0];
  return (input * m.inPrice + output * m.outPrice) / 1_000_000;
};

export class Translator {
  private client: Anthropic;
  constructor(apiKey: string, public model: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 4 });
  }

  private async callTool<T>(opts: {
    system: string;
    user: string;
    toolName: string;
    toolDescription: string;
    schema: object;
    maxTokens: number;
    signal?: AbortSignal;
  }): Promise<{ data: T; usage: Usage; truncated: boolean }> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: opts.maxTokens,
        system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
        tools: [{ name: opts.toolName, description: opts.toolDescription, input_schema: opts.schema as Anthropic.Tool.InputSchema }],
        tool_choice: { type: 'tool', name: opts.toolName },
        messages: [{ role: 'user', content: opts.user }],
      },
      { signal: opts.signal },
    );
    const msg = await stream.finalMessage();
    const block = msg.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new Error('Модель не вернула результат');
    const u = msg.usage;
    const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    return {
      data: block.input as T,
      usage: { input, output: u.output_tokens, costUsd: cost(this.model, input, u.output_tokens) },
      truncated: msg.stop_reason === 'max_tokens',
    };
  }

  async translatePage(args: {
    kind: SourceKind;
    characterName: string;
    markdown: string;
    sourceLang: 'en' | 'ru';
    signal?: AbortSignal;
  }) {
    const langHint =
      args.sourceLang === 'ru'
        ? 'Исходник УЖЕ на русском (официальный перевод сайта): не переводи заново, а сократи воду и приведи термины к глоссарию.'
        : 'Исходник на английском: переведи на русский.';
    const user = `Персонаж: ${args.characterName}\nРаздел: ${args.kind}\n${SOURCE_HINT[args.kind]}\n${langHint}\n\n<page>\n${args.markdown}\n</page>`;
    const res = await this.callTool<RawPage>({
      system: SYSTEM_PROMPT,
      user,
      toolName: 'save_page',
      toolDescription: 'Сохранить переведённую и сжатую страницу справочника',
      schema: pageSchema,
      maxTokens: 32000,
      signal: args.signal,
    });
    if (res.truncated) throw new Error('Ответ модели обрезан по длине (max_tokens) — попробуйте модель Sonnet');
    return { page: sanitizePage(res.data), usage: res.usage };
  }

  /** Перевод коротких строк заметок фреймдаты ("Homing", "High crush 4~16") */
  async translateLines(lines: string[], signal?: AbortSignal) {
    const schema = {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: { type: 'object', required: ['i', 'ru'], properties: { i: { type: 'integer' }, ru: { type: 'string' } } },
        },
      },
    };
    const system =
      SYSTEM_PROMPT.split('ПРАВИЛА')[0] +
      'Сейчас задача другая: переведи короткие технические заметки из таблицы фреймдаты. Переводи кратко, как в справочнике. Команды и числа оставляй как есть. Термины из глоссария: Homing → Хоминг; Heat Engager/Heat Smash/Heat Dash/Heat Burst/Power Crush/Tornado — оставь по-английски; Balcony Break → Пробивает балкон; Wall bounce/Wall splat → Удар в стену; High crush 4~16 → Уходит от хаев 4~16; Low crush → Уходит от лоу; Floor break → Пробивает пол; chip damage → чип-урон; Cancel to r45 → Отмена в r45; Elbow / Knee → Локоть / Колено; Forces crouch → Сажает в присед; Weapon → Оружие; Spike → Спайк (вбивает в пол); Clean hit → Чистое попадание; Transition to X → Переход в X; Hold to ... → Удерживать, чтобы ...';
    const user =
      'Переведи каждую строку. Верни items: [{i, ru}] для всех номеров.\n\n' +
      lines.map((l, i) => `${i}\t${l}`).join('\n');
    const res = await this.callTool<{ items: { i: number; ru: string }[] }>({
      system,
      user,
      toolName: 'save_translations',
      toolDescription: 'Сохранить переводы строк',
      schema,
      maxTokens: 16000,
      signal,
    });
    const out = new Map<string, string>();
    for (const it of res.data.items ?? []) {
      const src = lines[it.i];
      if (src !== undefined && typeof it.ru === 'string' && it.ru.trim()) out.set(src, it.ru.trim());
    }
    return { map: out, usage: res.usage };
  }
}

type RawPage = { summary?: unknown; stances?: unknown; sections?: unknown };

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strArr = (v: unknown) => arr(v).map(s).filter(Boolean);

/** Приводит ответ модели к строгому формату; мусор отбрасывает */
export function sanitizePage(raw: RawPage): { summary?: string; stances?: StanceInfo[]; sections: Section[] } {
  const sections: Section[] = [];
  for (const sec of arr(raw.sections)) {
    const o = sec as Record<string, unknown>;
    const tab = TABS.includes(o.tab as TabId) ? (o.tab as TabId) : 'overview';
    const blocks: Block[] = [];
    for (const b of arr(o.blocks)) {
      const x = b as Record<string, unknown>;
      switch (x.type) {
        case 'text':
          if (s(x.text)) blocks.push({ type: 'text', text: s(x.text) });
          break;
        case 'bullets': {
          const items = strArr(x.items);
          if (items.length) blocks.push({ type: 'bullets', items });
          break;
        }
        case 'move':
          if (s(x.cmd)) blocks.push({ type: 'move', cmd: s(x.cmd).replace(/`/g, ''), label: s(x.label) || undefined, text: s(x.text) });
          break;
        case 'combo':
          if (s(x.route))
            blocks.push({
              type: 'combo',
              starters: strArr(x.starters).map((t) => t.replace(/`/g, '')),
              route: s(x.route).replace(/`/g, ''),
              note: s(x.note) || undefined,
            });
          break;
        case 'table': {
          const columns = strArr(x.columns);
          const rows = arr(x.rows).map((r) => arr(r).map(s)).filter((r) => r.some(Boolean));
          if (rows.length) blocks.push({ type: 'table', columns, rows });
          break;
        }
      }
    }
    if (blocks.length) sections.push({ tab, title: s(o.title) || 'Без названия', blocks });
  }
  const stances = arr(raw.stances)
    .map((st) => {
      const o = st as Record<string, unknown>;
      return { abbr: s(o.abbr), name: s(o.name), ru: s(o.ru) };
    })
    .filter((st) => st.abbr && /^[A-Za-z.]+$/.test(st.abbr));
  return { summary: s(raw.summary) || undefined, stances: stances.length ? stances : undefined, sections };
}

/** Команды из перевода, которых нет в исходнике — признак того, что модель что-то напутала */
export function findUnverifiedCommands(page: { sections: Section[] }, source: string): string[] {
  const norm = source.toLowerCase().replace(/[\s.+*,]/g, '');
  const cmds = new Set<string>();
  const grab = (t?: string) => {
    for (const m of (t ?? '').matchAll(/`([^`]+)`/g)) cmds.add(m[1]);
  };
  for (const sec of page.sections)
    for (const b of sec.blocks) {
      if (b.type === 'text') grab(b.text);
      if (b.type === 'bullets') b.items.forEach(grab);
      if (b.type === 'move') { cmds.add(b.cmd); grab(b.text); }
      if (b.type === 'combo') { b.starters.forEach((x) => cmds.add(x)); b.route.split(/\s*→\s*/).forEach((x) => cmds.add(x)); }
      if (b.type === 'table') b.rows.flat().forEach(grab);
    }
  return [...cmds].filter((c) => {
    const k = looseMoveKey(c);
    return k.length > 0 && !norm.includes(k);
  });
}
