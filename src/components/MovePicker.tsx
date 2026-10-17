import { useMemo, useState } from 'react';
import type { Move } from '../../shared/types';
import { Notation } from '../notation/Notation';
import { BREAK_TITLE, isThrowMove, throwBreak } from '../versus/matchup';

type Cat = 'all' | 'throw' | 'low' | 'mid' | 'high' | 'heat' | 'pc';
const CATS: { id: Cat; title: string }[] = [
  { id: 'all', title: 'Все' },
  { id: 'throw', title: 'Захваты' },
  { id: 'low', title: 'Лоу' },
  { id: 'mid', title: 'Миды' },
  { id: 'high', title: 'Хаи' },
  { id: 'heat', title: 'Heat' },
  { id: 'pc', title: 'Павер-краши' },
];

const firstLevel = (m: Move) => (m.hitLevel ?? '').trim().replace(/^[^a-z]*/i, '')[0]?.toLowerCase() ?? '';

function inCat(m: Move, c: Cat) {
  switch (c) {
    case 'all':
      return true;
    case 'throw':
      return isThrowMove(m);
    case 'low':
      return firstLevel(m) === 'l';
    case 'mid':
      return firstLevel(m) === 'm' || /^s?m/i.test(m.hitLevel.trim());
    case 'high':
      return firstLevel(m) === 'h';
    case 'heat':
      return Boolean(m.tags && ('he' in m.tags || 'hs' in m.tags));
    case 'pc':
      return Boolean(m.tags && 'pc' in m.tags);
  }
}

// по-русски ищут «бросок», «захват» — понимаем это как категорию
const THROW_WORDS = /^(брос|захв|грэб|граб|throw|grab)/i;

/** Поиск приёма по фреймдате: по команде («df2», «b1,4»), по названию или по типу (кнопки сверху) */
export function MovePicker({
  moves,
  onPick,
  placeholder = 'df2, b1,4, название или «бросок»…',
  autoFocus,
}: {
  moves: Move[];
  onPick: (m: Move) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Cat>('all');
  const counts = useMemo(() => Object.fromEntries(CATS.map((c) => [c.id, moves.filter((m) => inCat(m, c.id)).length])) as Record<Cat, number>, [moves]);
  const results = useMemo(() => {
    let q = query.trim().toLowerCase();
    let c = cat;
    if (THROW_WORDS.test(q)) {
      c = 'throw';
      q = '';
    }
    if (!q && c === 'all') return [];
    const qk = q.replace(/[\s+.]/g, '');
    return moves
      .filter((m) => inCat(m, c))
      .filter((m) => !q || m.command.toLowerCase().replace(/[\s+.]/g, '').includes(qk) || (m.name ?? '').toLowerCase().includes(q))
      .slice(0, 60);
  }, [query, cat, moves]);
  return (
    <div className="move-picker">
      <input className="input" placeholder={placeholder} value={query} autoFocus={autoFocus} onChange={(e) => setQuery(e.target.value)} />
      <div className="mp-cats" role="tablist">
        {CATS.filter((c) => c.id === 'all' || counts[c.id] > 0).map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className={`mp-cat${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>
            {c.title}
            {c.id !== 'all' && <span className="mp-n">{counts[c.id]}</span>}
          </button>
        ))}
      </div>
      {results.length > 0 && (
        <div className="cb-results">
          {results.map((m) => {
            const thr = isThrowMove(m) ? throwBreak(m) : null;
            return (
              <button
                key={m.id}
                className="cb-result"
                onClick={() => {
                  onPick(m);
                  setQuery('');
                }}
              >
                <Notation cmd={m.command} size="sm" plain />
                <span className="cb-result-name">{m.name}</span>
                {thr ? <span className={`thr-badge thr-${thrClass(thr)}`}>{BREAK_TITLE[thr]}</span> : <span />}
                <span className="cb-result-f">
                  {m.startup && `${m.startup.match(/\d+/)?.[0] ?? ''}f`} {m.block && `Б ${m.block}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {(query.trim() || cat !== 'all') && results.length === 0 && <p className="muted small">Не нашёл. Попробуй короче: «df2», «b1» — или другой тип.</p>}
    </div>
  );
}

export const thrClass = (b: string) => (b === '1+2' ? 'both' : b === '1/2' ? 'any' : b === '?' ? 'unk' : b);
