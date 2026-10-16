import { useMemo, useState } from 'react';
import type { Move } from '../../shared/types';
import { Notation } from '../notation/Notation';

/** Поиск приёма по фреймдате: по команде («df2», «b1,4») или по названию */
export function MovePicker({
  moves,
  onPick,
  placeholder = 'df2, b1,4 или название…',
  autoFocus,
}: {
  moves: Move[];
  onPick: (m: Move) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const qk = q.replace(/[\s+.]/g, '');
    return moves
      .filter((m) => m.command.toLowerCase().replace(/[\s+.]/g, '').includes(qk) || (m.name ?? '').toLowerCase().includes(q))
      .slice(0, 40);
  }, [query, moves]);
  return (
    <div className="move-picker">
      <input className="input" placeholder={placeholder} value={query} autoFocus={autoFocus} onChange={(e) => setQuery(e.target.value)} />
      {results.length > 0 && (
        <div className="cb-results">
          {results.map((m) => (
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
              <span className="cb-result-f">
                {m.startup && `${m.startup.match(/\d+/)?.[0] ?? ''}f`} {m.block && `Б ${m.block}`}
              </span>
            </button>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && <p className="muted small">Не нашёл. Попробуй короче: «df2», «b1».</p>}
    </div>
  );
}
