// Расчёт экрана «я против него»: опасные приёмы соперника и чем их наказывает мой персонаж
import type { Block, CharacterData, MatchupItem, Move } from '../../shared/types';
import { buildMoveIndex } from '../context';
import { moveKey } from '../notation/tokenize';
import { worstFrame } from '../frames';

export type Punisher = { frames: number; cmd: string; why: string; crouch: boolean };

export type Danger = {
  cmd: string;
  label?: string;
  /** совет из гайда, как контрить */
  guideText?: string;
  move?: Move;
  /** готовые подсказки, посчитанные по фреймам */
  hints: { kind: 'punish' | 'safe' | 'plus' | 'duck' | 'low' | 'homing' | 'armor' | 'throw' | 'info'; text: string; punish?: Punisher }[];
};

// ---------- Захваты (броски) ----------
/** Чем ломать бросок: 1 / 2 / 1+2 / любой из 1 и 2 / смотря чем схватил / не ломается */
export type ThrowBreak = '1' | '2' | '1+2' | '1/2' | 'input' | '3+4' | 'none' | 'crouch' | '?';

export const BREAK_ORDER: ThrowBreak[] = ['1', '2', '1+2', '1/2', 'input', '3+4', 'none', 'crouch', '?'];

export const BREAK_TITLE: Record<ThrowBreak, string> = {
  '1': 'Ломай 1',
  '2': 'Ломай 2',
  '1+2': 'Ломай 1+2',
  '1/2': 'Ломай 1 или 2',
  input: '1 или 2 — смотря чем схватил',
  '3+4': 'Ломай 3+4',
  none: 'Не ломается',
  crouch: 'Присед-броски',
  '?': 'Чем ломать — не указано',
};

export const BREAK_NOTE: Record<ThrowBreak, string> = {
  '1': 'схватил левой рукой',
  '2': 'схватил правой рукой',
  '1+2': 'схватил двумя руками',
  '1/2': 'обычный бросок — сработает любая из двух',
  input: 'смотри, какая рука пошла вперёд',
  '3+4': 'редкий слом ногами',
  none: 'только не попадаться: пригнуться или отойти',
  crouch: 'хватают только присевшего, не ломаются — не сиди лишний раз',
  '?': '',
};

const isThrowLevel = (m: Move) => /^\s*t(?!\s*\((a|g|w)\))/i.test(m.hitLevel);
/** Это захват (бросок с ног; воздушные, с земли и у стены не считаем) */
export const isThrowMove = isThrowLevel;

/** Чем ломать бросок — по заметкам фреймдаты */
export function throwBreak(m: Move): ThrowBreak {
  const all = m.notes ?? '';
  if (/^\s*t\s*\(c\)/i.test(m.hitLevel) || /crouch throw/i.test(all)) return 'crouch';
  // только строки про слом броска: «Floor Break», «Balcony Break» и прочее мимо
  const n = all
    .split(/\n/)
    .filter((l) => /throw break|break throw|throw escape|unbreakable|cannot (throw )?break|cannot be broken|^\W*\d(\+\d)? throw break/i.test(l))
    .join('\n');
  if (!n) return '?';
  if (/cannot\s+(throw\s+)?break|unbreakable|cannot be broken/i.test(n)) return 'none';
  if (/depending on|opposite/i.test(n)) return 'input';
  if (/\b1 or 2\b/i.test(n)) return '1/2';
  if (/3\+4 throw break|throw break 3\+4/i.test(n)) return '3+4';
  if (/1\+2 throw break|throw break 1\+2/i.test(n)) return '1+2';
  if (/(^|[^+\d])2 throw break|throw break 2\b/i.test(n)) return '2';
  if (/(^|[^+\d])1 throw break|throw break 1\b/i.test(n)) return '1';
  return '?';
}

export type ThrowInfo = { move: Move; brk: ThrowBreak };
export type ThrowSet = {
  /** броски с команды (начало броска; продолжения цепочек не берём) */
  groups: { brk: ThrowBreak; items: ThrowInfo[] }[];
  /** броски сбоку и со спины */
  positional: { where: string; brk: ThrowBreak; move: Move }[];
};

/** Все захваты соперника, сгруппированные по тому, чем их ломать */
export function throwsOf(opp: CharacterData | null): ThrowSet {
  const moves = opp?.frames?.moves ?? [];
  const groups = new Map<ThrowBreak, ThrowInfo[]>();
  const positional: ThrowSet['positional'] = [];
  const seen = new Set<string>();
  for (const m of moves) {
    if (!isThrowLevel(m) || seen.has(m.command)) continue;
    seen.add(m.command);
    const pos = m.command.match(/^\(?\s*(left|right|behind|back)\b[^.]*throw/i);
    if (pos) {
      const w = pos[1].toLowerCase();
      const where = w === 'left' ? 'Слева' : w === 'right' ? 'Справа' : 'Сзади';
      const brk = throwBreak(m);
      if (!positional.some((p) => p.where === where && p.brk === brk)) positional.push({ where, brk, move: m });
      continue;
    }
    if (m.command.startsWith('(')) continue; // ситуативные, вроде «(back to wall)»
    // продолжения цепочек (у них нет своей скорости) и стойки-броски с земли — не нужны
    if (Number.isNaN(startupNum(m.startup))) continue;
    const brk = throwBreak(m);
    if (!groups.has(brk)) groups.set(brk, []);
    groups.get(brk)!.push({ move: m, brk });
  }
  const dmg = (m: Move) => Number(m.damage.match(/\d+/)?.[0]) || 0;
  return {
    groups: BREAK_ORDER.filter((b) => groups.has(b)).map((brk) => ({ brk, items: groups.get(brk)!.sort((a, b) => dmg(b.move) - dmg(a.move)) })),
    positional: positional.sort((a, b) => a.where.localeCompare(b.where)),
  };
}

const startupNum = (s?: string) => {
  const m = s?.match(/i?(\d+)/);
  return m ? Number(m[1]) : NaN;
};

const levels = (m?: Move) =>
  (m?.hitLevel ?? '')
    .split(/[\s,]+/)
    .map((x) => x.replace(/[^a-z]/gi, '')[0]?.toLowerCase() ?? '')
    .filter(Boolean);

const firstCmd = (cell: string) => {
  const m = cell.match(/`([^`]+)`/);
  return (m ? m[1] : cell).split(/\s+\/\s+/)[0].trim();
};

/** Наказания моего персонажа: из таблиц гайда, а если их нет — из фреймдаты */
export function myPunishers(me: CharacterData | null): Punisher[] {
  if (!me) return [];
  const out: Punisher[] = [];
  for (const sec of me.guide?.sections ?? []) {
    const crouch = /присяд/i.test(sec.title);
    if (!/^Наказания (стоя|из присяда)/i.test(sec.title)) continue;
    for (const b of sec.blocks) {
      if (b.type !== 'table') continue;
      let last = NaN;
      for (const r of b.rows) {
        const f = Number((r[0] ?? '').match(/\d+/)?.[0]);
        if (!Number.isNaN(f)) last = f;
        if (Number.isNaN(last) || !r[1]) continue;
        out.push({ frames: last, cmd: firstCmd(r[1]), why: (r[2] ?? '').replace(/`/g, ''), crouch });
      }
    }
  }
  if (out.some((p) => !p.crouch) && out.some((p) => p.crouch)) return out;
  // запасной вариант: лучший приём под каждую скорость из фреймдаты
  const moves = me.frames?.moves ?? [];
  const score = (m: Move) => (/\d+a/.test(m.hit) ? 1000 : 0) + (Number(m.damage.match(/\d+/)?.[0]) || 0);
  for (const crouch of [false, true]) {
    if (out.some((p) => p.crouch === crouch)) continue;
    const pool = moves.filter((m) => {
      const c = m.command;
      const isWs = /^ws/i.test(c);
      if (crouch !== isWs) return false;
      if (!isWs && /^[A-Z]{2,}\.|^(H|R)\.|^(FC|SS|BT|WR)/i.test(c)) return false;
      return !Number.isNaN(startupNum(m.startup)) && !/^t/i.test(m.hitLevel);
    });
    for (let f = 10; f <= 20; f++) {
      const best = pool.filter((m) => startupNum(m.startup) <= f).sort((a, b) => score(b) - score(a))[0];
      if (best && !out.some((p) => p.crouch === crouch && p.cmd === best.command)) {
        out.push({ frames: startupNum(best.startup), cmd: best.command, why: /\d+a/.test(best.hit) ? 'лаунчер' : `${best.damage} урона`, crouch });
      }
    }
  }
  return out;
}

/** Лучшее наказание за приём с минусом `minus` (положительное число) */
export function bestPunish(list: Punisher[], minus: number, crouch: boolean): Punisher | undefined {
  const pool = list.filter((p) => p.crouch === crouch && p.frames <= minus);
  return pool.sort((a, b) => b.frames - a.frames)[0];
}

function hintsFor(move: Move | undefined, mine: Punisher[]): Danger['hints'] {
  if (!move) return [];
  const out: Danger['hints'] = [];
  const lv = levels(move);
  const first = lv[0];
  const last = lv[lv.length - 1];
  const b = worstFrame(move.block);
  const tags = move.tags ?? {};
  if (isThrowLevel(move)) {
    const brk = throwBreak(move);
    const how =
      brk === 'none' || brk === 'crouch' ? `не ломается — ${BREAK_NOTE[brk]}` : brk === '?' ? 'чем ломать — не указано' : `${BREAK_TITLE[brk].toLowerCase()} (${BREAK_NOTE[brk]})`;
    out.push({ kind: 'throw', text: `Захват: ${how}.` });
    return out;
  }
  if (first === 'l') out.push({ kind: 'low', text: 'Начинается с лоу — блок в присяде.' });
  if (lv.length > 1 && last === 'h') out.push({ kind: 'duck', text: 'Последний удар — хай: можно пригнуться, он промахнётся — наказывай из присяда.' });
  else if (lv.length === 1 && first === 'h') out.push({ kind: 'duck', text: 'Хай — можно пригнуться.' });
  if ('hom' in tags) out.push({ kind: 'homing', text: 'Хоминг — шагом не уйти, блокируй.' });
  if ('pc' in tags) out.push({ kind: 'armor', text: 'Павер-краш — ударом не перебить, блокируй.' });
  if (b !== null) {
    if (b >= 1) out.push({ kind: 'plus', text: `На блоке он в плюсе (+${b}) — после блока не жми, его ход.` });
    else if (b >= -9) out.push({ kind: 'safe', text: `На блоке безопасен (${b}) — не наказывается.` });
    else {
      const crouch = last === 'l';
      const p = bestPunish(mine, -b, crouch);
      out.push({
        kind: 'punish',
        text: p ? `На блоке ${b} — наказывай ${crouch ? 'из присяда' : 'стоя'}:` : `На блоке ${b} — наказывай самым быстрым ${crouch ? 'из присяда' : 'стоя'}.`,
        punish: p,
      });
    }
  }
  return out;
}

const blocksOf = (d: CharacterData | null, tab: string) =>
  (d?.guide?.sections ?? []).filter((s) => s.tab === tab).flatMap((s) => s.blocks);

/** Топ опасных приёмов соперника */
export function dangers(opp: CharacterData | null, me: CharacterData | null, limit = 5): Danger[] {
  if (!opp) return [];
  const find = buildMoveIndex(opp.frames?.moves ?? []);
  const mine = myPunishers(me);
  const out: Danger[] = [];
  const seen = new Set<string>();
  const push = (cmd: string, label?: string, guideText?: string) => {
    const k = moveKey(cmd);
    if (!k || seen.has(k) || out.length >= limit) return;
    seen.add(k);
    const move = find(cmd);
    out.push({ cmd, label, guideText, move, hints: hintsFor(move, mine) });
  };
  // 1) из гайда: «опасные приёмы и как их разбирать»
  for (const b of blocksOf(opp, 'counter')) if (b.type === 'move') push(b.cmd, b.label, b.text);
  // 2) ключевые приёмы из гайда
  for (const b of blocksOf(opp, 'moves') as Block[]) if (b.type === 'move' && find(b.cmd)) push(b.cmd, b.label);
  // 3) по фреймам: плюсовые миды, лаунч-наказуемые лоу, контр-хит лаунчеры, Heat Engager
  const moves = opp.frames?.moves ?? [];
  const scored = moves
    .filter((m) => !/^(H|R)\./.test(m.command) && !Number.isNaN(startupNum(m.startup)))
    .map((m) => {
      const b = worstFrame(m.block) ?? 0;
      const lv = levels(m);
      let s = 0;
      if (lv[0] === 'm' && b >= 3) s += 30 + b;
      if (lv[0] === 'l' && b <= -13) s += 25;
      if (/\d+a/.test(m.counterHit) && b >= -9) s += 20;
      if (m.tags && 'he' in m.tags) s += 15;
      if (m.tags && 'hom' in m.tags) s += 5;
      return { m, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  for (const { m } of scored) push(m.command, autoLabel(m));
  return out;
}

function autoLabel(m: Move): string {
  const lv = levels(m);
  const b = worstFrame(m.block) ?? 0;
  if (lv[0] === 'm' && b >= 3) return 'Плюсовой мид';
  if (lv[0] === 'l' && b <= -13) return 'Лоу, наказуем лаунчером';
  if (/\d+a/.test(m.counterHit)) return 'Контр-хит лаунчер';
  if (m.tags && 'he' in m.tags) return 'Heat Engager';
  return 'Ключевой приём';
}

/** Особые приёмы соперника: Heat Smash, павер-краши, Heat Engager */
export function specials(opp: CharacterData | null) {
  const moves = opp?.frames?.moves ?? [];
  const pick = (tag: string) => moves.filter((m) => m.tags && tag in m.tags && !/^R\./.test(m.command)).slice(0, 6);
  return { heatSmash: pick('hs'), powerCrush: pick('pc'), engagers: pick('he') };
}

/** Что гайд говорит про этот приём соперника (подпись и совет) */
export function guideFor(opp: CharacterData | null, cmd: string): { label?: string; text?: string } {
  const k = moveKey(cmd);
  for (const tab of ['counter', 'moves', 'tactics']) {
    for (const b of blocksOf(opp, tab)) if (b.type === 'move' && moveKey(b.cmd) === k) return { label: b.label, text: b.text };
  }
  return {};
}

/** Карточка из своего списка: подпись и описание — твои (или из гайда), подсказки — по фреймдате */
export function dangerFromItem(opp: CharacterData | null, me: CharacterData | null, item: MatchupItem): Danger {
  const find = buildMoveIndex(opp?.frames?.moves ?? []);
  const move = find(item.cmd);
  const g = guideFor(opp, item.cmd);
  return {
    cmd: item.cmd,
    label: item.label ?? g.label ?? (move ? autoLabel(move) : undefined),
    guideText: item.text ?? g.text,
    move,
    hints: hintsFor(move, myPunishers(me)),
  };
}
