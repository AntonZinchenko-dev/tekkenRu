import { Fragment, useContext, type ReactNode } from 'react';
import type { Block, Move, Section, SourceKind } from '../../shared/types';
import { CharContext } from '../context';
import { blockSafety, hitLevels, SAFETY_RU, startupShort, tagChips } from '../frames';
import { ComboRoute, Notation } from '../notation/Notation';
import { MoveVideo } from './MoveVideo';

/** Текст с командами в `обратных кавычках` и **жирным** */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <Notation key={i} cmd={p.slice(1, -1)} size="sm" />;
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** Компактная полоска фреймов: старт / блок / хит */
export function FrameStrip({ move }: { move: Move }) {
  const safety = blockSafety(move.block);
  return (
    <span className="fstrip">
      {hitLevels(move.hitLevel).map((l, i) => (
        <span key={i} className={`lvl lvl-${l.kind}`} title={l.title}>
          {l.raw}
        </span>
      ))}
      {move.startup && (
        <span className="fs-item" title="Старт (через сколько кадров бьёт)">
          <b>{startupShort(move.startup)}</b>f
        </span>
      )}
      {move.block && (
        <span className={`fs-item safety-${safety}`} title={`На блоке: ${move.block} — ${SAFETY_RU[safety]}`}>
          <span className="fs-k">блок</span> {move.block}
        </span>
      )}
      {move.hit && (
        <span className="fs-item" title={`При попадании: ${move.hit}`}>
          <span className="fs-k">хит</span> {move.hit}
        </span>
      )}
    </span>
  );
}

export function FrameCard({ move }: { move: Move }) {
  const safety = blockSafety(move.block);
  const tags = tagChips(move.tags);
  const notes = (move.notesRu || move.notes || '')
    .split('\n')
    .map((l) => l.replace(/^\s*[*-]\s*/, '').trim())
    .filter(Boolean);
  return (
    <div className="fcard">
      <div className="fcard-head">
        <Notation cmd={move.command} size="lg" plain />
        {move.name && <span className="fcard-name">{move.name}</span>}
      </div>
      <div className="fcard-grid">
        <span>Уровень</span>
        <span>
          {hitLevels(move.hitLevel).map((l, i) => (
            <span key={i} className={`lvl lvl-${l.kind}`} title={l.title}>
              {l.raw}
            </span>
          )) || '—'}
        </span>
        <span>Старт</span>
        <span className="mono">{move.startup || '—'}</span>
        <span>Блок</span>
        <span className={`mono safety-${safety}`}>
          {move.block || '—'} {SAFETY_RU[safety] && <small>· {SAFETY_RU[safety]}</small>}
        </span>
        <span>Попадание</span>
        <span className="mono">{move.hit || '—'}</span>
        <span>Контр-хит</span>
        <span className="mono">{move.counterHit || '—'}</span>
        <span>Урон</span>
        <span className="mono">{move.damage || '—'}</span>
      </div>
      {tags.length > 0 && (
        <div className="fcard-tags">
          {tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <ul className="fcard-notes">
          {notes.slice(0, 8).map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MoveBlock({ cmd, label, text }: { cmd: string; label?: string; text: string }) {
  const ctx = useContext(CharContext);
  const move = ctx.findMove(cmd);
  return (
    <div className="move">
      <div className="move-head">
        <Notation cmd={cmd} size="lg" />
        {label && <span className="move-label">{label}</span>}
        {move && <FrameStrip move={move} />}
        {move && ctx.charId && <MoveVideo charId={ctx.charId} move={move} />}
      </div>
      {text && (
        <p className="move-text">
          <RichText text={text} />
        </p>
      )}
    </div>
  );
}

function looksLikeCommand(s: string) {
  const v = s.trim();
  if (!/^[a-zA-Z0-9+,.~:*/ ]{1,24}$/.test(v) || !/[1-4]/.test(v)) return false;
  // кадры и числа — не команды: "10f", "12 f", "i15", "-13", "+5"
  if (/^(i?\d{1,2}\s*(f|fr|frames?)?|[+-]\d+.*|\d+\s*-\s*\d+f?)$/i.test(v)) return false;
  return true;
}

function Cell({ v }: { v: string }) {
  if (!v.includes('`') && looksLikeCommand(v)) return <Notation cmd={v} size="sm" />;
  return <RichText text={v} />;
}

export function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case 'text':
      return (
        <p>
          <RichText text={b.text} />
        </p>
      );
    case 'bullets':
      return (
        <ul className="bullets">
          {b.items.map((it, i) => (
            <li key={i}>
              <RichText text={it} />
            </li>
          ))}
        </ul>
      );
    case 'move':
      return <MoveBlock cmd={b.cmd} label={b.label} text={b.text} />;
    case 'combo':
      return <ComboRoute starters={b.starters} route={b.route} note={b.note ? <RichText text={b.note} /> : undefined} />;
    case 'table':
      return (
        <div className="table-wrap">
          <table className="tbl">
            {b.columns.length > 0 && (
              <thead>
                <tr>
                  {b.columns.map((c, i) => (
                    <th key={i}>{c}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, k) => (
                    <td key={k}>
                      <Cell v={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

const SOURCE_RU: Record<SourceKind, string> = { guide: 'гайд', meta: 'шпаргалка', antistrat: 'анти-страты' };

export function SectionCard({ section, source, wide }: { section: Section; source: SourceKind; wide?: boolean }) {
  const hasCombos = section.blocks.some((b) => b.type === 'combo' || b.type === 'table');
  return (
    <section className={`card${wide || hasCombos ? ' card-wide' : ''}`}>
      <header className="card-head">
        <h3>{section.title}</h3>
        <span className={`src src-${source}`}>{SOURCE_RU[source]}</span>
      </header>
      <div className="card-body">
        {section.blocks.map((b, i) => (
          <BlockView key={i} b={b} />
        ))}
      </div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
