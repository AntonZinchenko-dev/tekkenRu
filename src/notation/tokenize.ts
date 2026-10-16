/**
 * Разбор текстовой нотации Tekken ("df2 → f2,3 → bt1,2 T!") в список токенов,
 * которые потом рисуются SVG-иконками.
 */

export type Dir = 'u' | 'd' | 'f' | 'b' | 'uf' | 'ub' | 'df' | 'db' | 'n';

export type Token =
  | { t: 'dir'; d: Dir; hold: boolean }
  | { t: 'motion'; name: string; dirs: Dir[] }
  | { t: 'btn'; b: number[]; hold: boolean }
  | { t: 'stance'; abbr: string }
  | { t: 'tag'; kind: TagKind; raw: string }
  | { t: 'sep'; s: ',' | '~' | ':' | 'or' | '+' }
  | { t: 'step' }
  | { t: 'paren'; v: '(' | ')' | '[' | ']' }
  | { t: 'text'; v: string };

export type TagKind = 'CH' | 'TORNADO' | 'WALL' | 'BALCONY' | 'FLOOR' | 'HOLD' | 'RAGEART' | 'HEATBURST' | 'POWERCRUSH' | 'HEATENGAGER';

/** Стойки и состояния, общие для всех персонажей */
export const GLOBAL_STANCES = ['ws', 'iws', 'fc', 'bt', 'ss', 'ssl', 'ssr', 'sw', 'swl', 'swr', 'wr', 'cd', 'h', 'r', 'fufa', 'fuft', 'fdfa', 'fdft', 'ot'];

const MOTIONS: Record<string, Dir[]> = {
  qcf: ['d', 'df', 'f'],
  qcb: ['d', 'db', 'b'],
  hcf: ['b', 'db', 'd', 'df', 'f'],
  hcb: ['f', 'df', 'd', 'db', 'b'],
};

const TAGS: { re: RegExp; kind: TagKind }[] = [
  { re: /^T!/i, kind: 'TORNADO' },
  { re: /^S!/i, kind: 'TORNADO' },
  { re: /^W!/i, kind: 'WALL' },
  { re: /^WB!/i, kind: 'WALL' },
  { re: /^BB!/i, kind: 'BALCONY' },
  { re: /^FB!/i, kind: 'FLOOR' },
  { re: /^CH(?![a-z])/i, kind: 'CH' },
  { re: /^RA(?![a-zA-Z.])/, kind: 'RAGEART' },
  { re: /^(hold|held)(?![a-z])/i, kind: 'HOLD' },
];

/** Слова, которые встречаются внутри нотации и не являются вводом */
const WORDS: Record<string, string> = {
  dash: 'рывок',
  backdash: 'бэкдэш',
  delay: 'задержка',
  delayed: 'с задержкой',
  or: 'или',
  then: 'затем',
  wall: 'стена',
  ground: 'на земле',
  on: '',
  the: '',
  low: 'лоу',
  parry: 'парри',
  jump: 'прыжок',
  run: 'бег',
  max: 'макс.',
  min: 'мин.',
  range: 'дистанция',
  close: 'вплотную',
  optional: 'необяз.',
  wr: 'бег',
  heat: 'Heat',
  smash: 'Smash',
  burst: 'Burst',
  dash1: '',
  microdash: 'микрорывок',
  sidestep: 'сайдстеп',
  input: 'ввод',
};

const PURE_DIR_LETTERS = /^[udfbn]+$/i;

type RunPiece =
  | { kind: 'stance'; abbr: string }
  | { kind: 'motion'; name: string }
  | { kind: 'dir'; d: Dir; upper: boolean };

/** Разбивает буквенную «пачку» (например "ff", "bt", "qcf", "uf") на ввод. Возвращает null, если это просто слово. */
function decomposeRun(run: string, stances: string[], nextChar: string): RunPiece[] | null {
  const lower = run.toLowerCase();
  const memo = new Map<number, RunPiece[] | null>();

  const go = (i: number): RunPiece[] | null => {
    if (i === run.length) return [];
    if (memo.has(i)) return memo.get(i)!;
    const rest = lower.slice(i);
    const candidates: { piece: RunPiece; len: number }[] = [];

    // стойки: длинные варианты первыми
    for (const s of stances) {
      if (!rest.startsWith(s)) continue;
      if (PURE_DIR_LETTERS.test(s)) continue; // "DF" как стойка не бывает — это направление
      const after = i + s.length === run.length ? nextChar : run[i + s.length];
      // однобуквенная стойка (H., R.) — только с точкой после
      if (s.length === 1 && after !== '.') continue;
      candidates.push({ piece: { kind: 'stance', abbr: s }, len: s.length });
    }
    for (const m of Object.keys(MOTIONS)) {
      if (rest.startsWith(m)) candidates.push({ piece: { kind: 'motion', name: m }, len: m.length });
    }
    for (const d of ['df', 'db', 'uf', 'ub'] as Dir[]) {
      if (rest.startsWith(d)) {
        const orig = run.slice(i, i + 2);
        candidates.push({ piece: { kind: 'dir', d, upper: orig === orig.toUpperCase() }, len: 2 });
      }
    }
    if ('udfbn'.includes(rest[0])) {
      const orig = run[i];
      candidates.push({ piece: { kind: 'dir', d: rest[0] as Dir, upper: orig === orig.toUpperCase() }, len: 1 });
    }
    candidates.sort((a, b) => b.len - a.len);
    for (const c of candidates) {
      const tail = go(i + c.len);
      if (tail) {
        const res = [c.piece, ...tail];
        memo.set(i, res);
        return res;
      }
    }
    memo.set(i, null);
    return null;
  };
  return go(0);
}

function normalizeStances(stances: string[] = []): string[] {
  const set = new Set<string>([...GLOBAL_STANCES]);
  for (const s of stances) if (s && /^[a-z]+$/i.test(s)) set.add(s.toLowerCase());
  return [...set].sort((a, b) => b.length - a.length);
}

export function tokenize(input: string, characterStances: string[] = []): Token[] {
  const stances = normalizeStances(characterStances);
  const src = input
    .replace(/\s*(→|->|=>|>)\s*/g, ' → ')
    .replace(/([udUD])\/([fbFB])/g, '$1$2');
  const out: Token[] = [];
  let i = 0;

  const prev = () => out[out.length - 1];

  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);

    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '→') { out.push({ t: 'step' }); i++; continue; }

    const tag = TAGS.find((tg) => tg.re.test(rest));
    if (tag) {
      const m = rest.match(tag.re)!;
      out.push({ t: 'tag', kind: tag.kind, raw: m[0] });
      i += m[0].length;
      continue;
    }

    // кнопки: 1, 1+2, 3+4, 1+2+3+4, со звёздочкой = зажать
    const btn = rest.match(/^[1-4](?:\+[1-4])*(\*+)?/);
    if (btn) {
      const nums = btn[0].replace(/\*/g, '').split('+').map(Number);
      out.push({ t: 'btn', b: [...new Set(nums)].sort(), hold: Boolean(btn[1]) });
      i += btn[0].length;
      continue;
    }

    const run = rest.match(/^[a-zA-Z]+/);
    if (run) {
      const word = run[0];
      const nextChar = src[i + word.length] ?? '';
      const pieces = decomposeRun(word, stances, nextChar);
      if (pieces) {
        for (const p of pieces) {
          if (p.kind === 'stance') out.push({ t: 'stance', abbr: p.abbr });
          else if (p.kind === 'motion') out.push({ t: 'motion', name: p.name, dirs: MOTIONS[p.name] });
          else out.push({ t: 'dir', d: p.d, hold: p.upper });
        }
      } else {
        const ru = WORDS[word.toLowerCase()];
        const v = ru === undefined ? word : ru;
        if (v) {
          const p = prev();
          if (p && p.t === 'text') p.v += ' ' + v;
          else out.push({ t: 'text', v });
        }
      }
      i += word.length;
      continue;
    }

    if (ch === '+') {
      const p = prev();
      // "d+2", "df+3+4" — плюс между направлением и кнопкой просто склеивает
      if (p && (p.t === 'dir' || p.t === 'motion') && /[1-4]/.test(src[i + 1] ?? '')) { i++; continue; }
      out.push({ t: 'sep', s: '+' });
      i++;
      continue;
    }
    if (ch === '*') {
      const p = prev();
      if (p && (p.t === 'dir' || p.t === 'btn')) p.hold = true;
      i++;
      continue;
    }
    if (ch === ',') { out.push({ t: 'sep', s: ',' }); i++; continue; }
    if (ch === '~') { out.push({ t: 'sep', s: '~' }); i++; continue; }
    if (ch === ':') { out.push({ t: 'sep', s: ':' }); i++; continue; }
    if (ch === '_' || ch === '|') { out.push({ t: 'sep', s: 'or' }); i++; continue; }
    if (ch === '.') { i++; continue; }
    if (ch === '(' || ch === ')' || ch === '[' || ch === ']') { out.push({ t: 'paren', v: ch }); i++; continue; }

    // всё остальное — текст (цифры 5-9, проценты, кириллица и т.п.)
    const other = rest.match(/^[^\s→,~:_|()[\]+*]+/);
    const v = other ? other[0] : ch;
    const p = prev();
    if (p && p.t === 'text') p.v += ' ' + v;
    else out.push({ t: 'text', v });
    i += v.length;
  }

  return postProcess(out);
}

function postProcess(tokens: Token[]): Token[] {
  // "(Hold)" → просто метка «удерж.»
  const res: Token[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const a = tokens[k], b = tokens[k + 1], c = tokens[k + 2];
    if (a.t === 'paren' && a.v === '(' && b?.t === 'tag' && c?.t === 'paren' && c.v === ')') {
      res.push(b);
      k += 2;
      continue;
    }
    res.push(a);
  }

  // Заглавные направления = «зажать», но только если в шаге есть и строчные.
  // "DEW DF4" или "B1,4" написаны капсом просто так — это обычные нажатия.
  let start = 0;
  for (let k = 0; k <= res.length; k++) {
    if (k === res.length || res[k].t === 'step') {
      const step = res.slice(start, k);
      const dirs = step.filter((x): x is Extract<Token, { t: 'dir' }> => x.t === 'dir');
      const hasLower = dirs.some((d) => !d.hold);
      if (!hasLower) for (const d of dirs) d.hold = false;
      start = k + 1;
    }
  }
  // точка после "*" и зажатых направлений уже учтена; убираем пустые шаги
  return res.filter((x, k) => !(x.t === 'step' && (k === 0 || res[k - 1].t === 'step')));
}

/** Делит маршрут комбо на шаги */
export function splitSteps(tokens: Token[]): Token[][] {
  const steps: Token[][] = [[]];
  for (const tk of tokens) {
    if (tk.t === 'step') steps.push([]);
    else steps[steps.length - 1].push(tk);
  }
  return steps.filter((s) => s.length);
}

/** Ключ для поиска приёма во фреймдате: без пробелов, точек, плюсов, регистра */
export function moveKey(cmd: string): string {
  return cmd
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[\s.+*]/g, '')
    .replace(/^(ch)/, '');
}

/** Второй ключ: ещё и без запятых ("f,f+4" == "ff4") */
export function looseMoveKey(cmd: string): string {
  return moveKey(cmd).replace(/,/g, '');
}
