// Разбор строк фреймдаты для подсветки цветом

/** Худшее (минимальное) число из строки вида "-8", "+3c", "-2~+7", "+1~+2", "-10~-8" */
export function worstFrame(s: string | undefined): number | null {
  if (!s) return null;
  const nums = [...s.matchAll(/([+-]?\d+)/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  return Math.min(...nums);
}

export type Safety = 'plus' | 'safe' | 'punish' | 'launch' | 'none';

export function blockSafety(block: string | undefined): Safety {
  const n = worstFrame(block);
  if (n === null) return 'none';
  if (n >= 0) return 'plus';
  if (n >= -9) return 'safe';
  if (n >= -14) return 'punish';
  return 'launch';
}

export const SAFETY_RU: Record<Safety, string> = {
  plus: 'в плюсе — твой ход',
  safe: 'безопасно',
  punish: 'наказуемо',
  launch: 'наказуемо лаунчером',
  none: '',
};

export function hitSafety(hit: string | undefined): Safety {
  if (!hit) return 'none';
  if (/\d+a|\(\+?-?\d+\)|[^a-z]a\b|launch/i.test(hit) || /\da/.test(hit)) return 'plus';
  return blockSafety(hit);
}

/** Самый ранний фрейм старта: "i20~22" → "20", "i16 i27~28" → "16" */
export function startupShort(s: string | undefined): string {
  const m = s?.match(/i?(\d+)/);
  return m ? m[1] : '';
}

const LEVEL_RU: Record<string, string> = { h: 'хай', m: 'мид', l: 'лоу', t: 'бросок', s: 'спец-мид', r: 'неблок.' };

export type LevelChip = { raw: string; kind: string; title: string };

export function hitLevels(level: string | undefined): LevelChip[] {
  if (!level) return [];
  return level
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((raw) => {
      const k = raw.replace(/[^a-z]/gi, '')[0]?.toLowerCase() ?? '';
      const up = raw !== raw.toLowerCase();
      return {
        raw,
        kind: LEVEL_RU[k] ? k : 'x',
        title: (LEVEL_RU[k] ?? raw) + (up ? ' (бьёт лежачего)' : ''),
      };
    });
}

/** Человеческие названия тегов из фреймдаты */
export const TAG_RU: Record<string, string> = {
  he: 'Heat Engager',
  hs: 'Heat Smash',
  hb: 'Heat Burst',
  hom: 'Хоминг',
  trn: 'Торнадо',
  pc: 'Павер-краш',
  bbr: 'Пробивает балкон',
  fbr: 'Пробивает пол',
  wbr: 'Пробивает стену',
  wb: 'Отскок от стены',
  ws: 'Удар в стену',
  spk: 'Спайк',
  elb: 'Локоть',
  kne: 'Колено',
  wpn: 'Оружие',
  chp: 'Чип-урон',
  cs: 'Уходит от хаев',
  js: 'Уходит от лоу',
  ps: 'Парирует',
  fs: 'Подброс',
  bt: 'Спиной',
  ra: 'Rage Art',
  hcrush: 'Уходит от хаев',
  lcrush: 'Уходит от лоу',
};

export function tagChips(tags: Record<string, string> | undefined): string[] {
  if (!tags) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(tags)) {
    const name = TAG_RU[k];
    if (!name) continue;
    out.push(v && v !== 'true' && v !== '' ? `${name} ${v}` : name);
  }
  return out;
}
