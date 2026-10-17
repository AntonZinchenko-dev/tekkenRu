// Превращает запись комбо в последовательность «нажатий» (битов) для тренажёра
import { type Dir, type Token, tokenize } from '../notation/tokenize';

export type Beat = {
  /** направление, которое надо держать/нажать в момент нажатия */
  dir?: Dir;
  /** кнопки, которые нажать одновременно */
  buttons?: number[];
  /** зажать (направление или кнопку) */
  hold?: boolean;
  /** подсказки перед битом: стойки (BT, WS, DEW…) */
  pre: string[];
  /** метки после бита: T!, CH, W! */
  post: string[];
  /** сразу же после предыдущего (~) */
  immediate?: boolean;
  /** джаст-фрейм (:) — точно в тайминг */
  justFrame?: boolean;
  /** номер шага комбо (часть между стрелками) */
  step: number;
};

const TAG_LABEL: Record<string, string> = { TORNADO: 'T!', CH: 'CH', WALL: 'W!', BALCONY: 'BB!', FLOOR: 'FB!', RAGEART: 'RA' };

export function splitRoute(route: string): string[] {
  return route
    .split(/\s*(?:→|->|=>|>)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Биты одного шага ("df3+4", "bt1,2 T!", "qcf1,4") */
export function stepBeats(cmd: string, step: number, stances: string[] = []): Beat[] {
  const tokens: Token[] = tokenize(cmd, stances);
  const beats: Beat[] = [];
  let pendingDir: { d: Dir; hold: boolean } | null = null;
  let pre: string[] = [];
  let immediate = false;
  let justFrame = false;
  let depth = 0; // всё в скобках — необязательное продолжение, пропускаем

  const push = (b: Omit<Beat, 'pre' | 'post' | 'step'>) => {
    beats.push({ ...b, pre, post: [], step, immediate: immediate || undefined, justFrame: justFrame || undefined });
    pre = [];
    immediate = false;
    justFrame = false;
  };
  const flushDir = () => {
    if (pendingDir) push({ dir: pendingDir.d, hold: pendingDir.hold || undefined });
    pendingDir = null;
  };

  for (const tk of tokens) {
    if (tk.t === 'paren') {
      if (tk.v === '(' || tk.v === '[') depth++;
      else depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    switch (tk.t) {
      case 'stance':
        flushDir();
        pre.push(tk.abbr.toUpperCase());
        break;
      case 'tag': {
        if (tk.kind === 'HOLD') {
          flushDir();
          const last = beats[beats.length - 1];
          if (last) last.hold = true;
        } else if (tk.kind === 'CH') {
          pre.push('CH');
        } else {
          flushDir();
          const last = beats[beats.length - 1];
          if (last) last.post.push(TAG_LABEL[tk.kind] ?? tk.raw);
        }
        break;
      }
      case 'motion':
        flushDir();
        tk.dirs.slice(0, -1).forEach((d) => push({ dir: d }));
        pendingDir = { d: tk.dirs[tk.dirs.length - 1], hold: false };
        break;
      case 'dir':
        flushDir();
        pendingDir = { d: tk.d, hold: tk.hold };
        break;
      case 'btn': {
        const dir = pendingDir?.d;
        const holdDir = pendingDir?.hold;
        pendingDir = null;
        push({ dir, buttons: tk.b, hold: tk.hold || holdDir || undefined });
        break;
      }
      case 'sep':
        if (tk.s === ',') flushDir();
        else if (tk.s === '~') {
          flushDir();
          immediate = true;
        } else if (tk.s === ':') {
          flushDir();
          justFrame = true;
        } else if (tk.s === 'or') {
          // альтернатива — тренируем первый вариант
          flushDir();
          return beats;
        }
        break;
      default:
        break;
    }
  }
  flushDir();
  return beats;
}

/** Все биты комбо: стартер + шаги маршрута */
export function comboBeats(starter: string | undefined, route: string, stances: string[] = []): Beat[] {
  const steps = [...(starter ? [starter] : []), ...splitRoute(route)];
  return steps.flatMap((s, i) => stepBeats(s, i, stances));
}

export function beatLabel(b: Beat): string {
  return [b.dir ? (b.hold ? b.dir.toUpperCase() : b.dir) : '', b.buttons?.join('+') ?? ''].filter(Boolean).join('+');
}
