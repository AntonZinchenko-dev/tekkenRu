import { createContext } from 'react';
import type { Move, StanceInfo } from '../shared/types';
import { looseMoveKey, moveKey } from './notation/tokenize';

export type CharCtx = {
  /** id персонажа, к которому относятся команды (для видео) */
  charId?: string;
  stances: string[];
  stanceInfo: StanceInfo[];
  findMove: (cmd: string) => Move | undefined;
  showFrames: (m: Move | null, rect?: DOMRect) => void;
  /** рисовать кнопки цифрами вместо точек */
  btnDigits?: boolean;
};

export const CharContext = createContext<CharCtx>({
  stances: [],
  stanceInfo: [],
  findMove: () => undefined,
  showFrames: () => {},
});

const GLOBAL_STANCE_RU: Record<string, string> = {
  WS: 'While Standing — удар при вставании из присяда',
  IWS: 'Instant While Standing — мгновенный удар при вставании',
  FC: 'Full Crouch — полный присед',
  BT: 'Back Turned — спиной к сопернику',
  SS: 'Sidestep — сайдстеп',
  SSL: 'Сайдстеп влево',
  SSR: 'Сайдстеп вправо',
  SW: 'Sidewalk — сайдвок (зажатый шаг в сторону)',
  SWL: 'Сайдвок влево',
  SWR: 'Сайдвок вправо',
  WR: 'While Running — с разбега',
  CD: 'Crouch Dash — рывок в присяде',
  H: 'Heat — приём в режиме Heat',
  R: 'Rage — приём в режиме Rage',
  FUFA: 'Лёжа на спине, ногами к сопернику',
  FUFT: 'Лёжа на спине, головой к сопернику',
  FDFA: 'Лёжа на животе, ногами к сопернику',
  FDFT: 'Лёжа на животе, головой к сопернику',
  OT: 'Opponent Turned — соперник спиной',
};

export function stanceTitle(abbr: string, ctx: CharCtx): string {
  const up = abbr.toUpperCase();
  const own = ctx.stanceInfo.find((s) => s.abbr.toUpperCase() === up);
  if (own) return `${up} — ${own.name}${own.ru ? ': ' + own.ru : ''}`;
  return GLOBAL_STANCE_RU[up] ?? `Стойка ${up}`;
}

/** Индекс приёмов фреймдаты по нормализованной команде */
export function buildMoveIndex(moves: Move[]) {
  const strict = new Map<string, Move>();
  const loose = new Map<string, Move>();
  for (const m of moves) {
    for (const c of [m.command, m.id.replace(/^[^-]+-/, '')]) {
      const k = moveKey(c);
      if (!strict.has(k)) strict.set(k, m);
      const l = looseMoveKey(c);
      if (!loose.has(l)) loose.set(l, m);
    }
  }
  return (cmd: string): Move | undefined => {
    const c = cmd.replace(/\b(ch|CH)\s+/, '');
    return strict.get(moveKey(c)) ?? loose.get(looseMoveKey(c));
  };
}
