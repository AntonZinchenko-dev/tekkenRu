import { useDeferredValue, useMemo, useState } from 'react';
import type { FrameData } from '../../shared/types';
import { blockSafety, hitLevels, startupShort, tagChips } from '../frames';
import { Notation } from '../notation/Notation';
import { Empty } from '../components/Content';
import { MoveVideo } from '../components/MoveVideo';

type Filter = 'all' | 'h' | 'm' | 'l' | 'plus' | 'launch' | 'heat' | 'homing' | 'pc';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'm', label: 'Миды' },
  { id: 'l', label: 'Лоу' },
  { id: 'h', label: 'Хаи' },
  { id: 'plus', label: 'Плюс на блоке' },
  { id: 'launch', label: 'Наказуемы лаунчером' },
  { id: 'homing', label: 'Хоминг' },
  { id: 'heat', label: 'Heat' },
  { id: 'pc', label: 'Павер-краш' },
];

export function FramesView({ frames, charId }: { frames?: FrameData; charId: string }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sortStartup, setSortStartup] = useState(false);
  const dq = useDeferredValue(q);

  const rows = useMemo(() => {
    if (!frames) return [];
    const needle = dq.trim().toLowerCase().replace(/\s+/g, '');
    let list = frames.moves.filter((m) => {
      if (needle) {
        const hay = (m.command + '|' + (m.name ?? '') + '|' + (m.notesRu ?? '') + '|' + m.notes).toLowerCase().replace(/\s+/g, '');
        if (!hay.includes(needle)) return false;
      }
      const lv = hitLevels(m.hitLevel)[0]?.kind;
      const tags = m.tags ?? {};
      switch (filter) {
        case 'h':
        case 'm':
        case 'l':
          return lv === filter;
        case 'plus':
          return blockSafety(m.block) === 'plus';
        case 'launch':
          return blockSafety(m.block) === 'launch';
        case 'homing':
          return 'hom' in tags;
        case 'heat':
          return 'he' in tags || 'hs' in tags || 'hb' in tags || /^H\./.test(m.command);
        case 'pc':
          return 'pc' in tags;
        default:
          return true;
      }
    });
    if (sortStartup) list = [...list].sort((a, b) => (Number(startupShort(a.startup)) || 999) - (Number(startupShort(b.startup)) || 999));
    return list;
  }, [frames, dq, filter, sortStartup]);

  if (!frames) return <Empty>Фреймдата ещё не скачана. Нажми «Обновить» сверху.</Empty>;

  return (
    <div className="frames">
      <div className="frames-tools">
        <input className="input" placeholder="Поиск: команда, название, заметка…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips-row">
          {FILTERS.map((f) => (
            <button key={f.id} className={`chip-btn${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
          <button className={`chip-btn${sortStartup ? ' on' : ''}`} onClick={() => setSortStartup((v) => !v)} title="Сортировать по скорости">
            ⚡ по скорости
          </button>
        </div>
        <span className="muted">{rows.length} приёмов</span>
      </div>
      <div className="table-wrap">
        <table className="tbl frames-tbl">
          <thead>
            <tr>
              <th>Команда</th>
              <th>Уровень</th>
              <th title="Старт">Старт</th>
              <th title="На блоке">Блок</th>
              <th title="При попадании">Хит</th>
              <th title="Контр-хит">CH</th>
              <th>Урон</th>
              <th>Заметки</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const s = blockSafety(m.block);
              const notes = (m.notesRu || m.notes)
                .split('\n')
                .map((l) => l.replace(/^\s*[*-]\s*/, '').trim())
                .filter(Boolean);
              return (
                <tr key={m.id}>
                  <td className="nowrap cmd-cell">
                    <div className="cmd-line">
                      <Notation cmd={m.command} size="sm" plain />
                      <MoveVideo charId={charId} move={m} compact />
                    </div>
                    <div className="move-name">
                      <span className="mono">{m.command}</span>
                      {m.name && <> · {m.name}</>}
                    </div>
                  </td>
                  <td>
                    {hitLevels(m.hitLevel).map((l, i) => (
                      <span key={i} className={`lvl lvl-${l.kind}`} title={l.title}>
                        {l.raw}
                      </span>
                    ))}
                  </td>
                  <td className="mono">{m.startup}</td>
                  <td className={`mono safety-${s}`}>{m.block}</td>
                  <td className="mono">{m.hit}</td>
                  <td className="mono">{m.counterHit}</td>
                  <td className="mono dim">{m.damage}</td>
                  <td className="notes-cell">
                    {tagChips(m.tags).map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                    {notes.length > 0 && <div className="notes-lines">{notes.join(' · ')}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
