import { useContext, useState } from 'react';
import type { Flow, FlowNode, FlowSet } from '../../shared/types';
import { CharContext } from '../context';
import { Empty, FrameStrip, RichText } from '../components/Content';
import { MoveVideo } from '../components/MoveVideo';
import { Notation } from '../notation/Notation';

/** Вкладка «Цепочки»: схемы напора «если соперник сделал это — ты делаешь то» */
export function FlowsView({ set }: { set?: FlowSet }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  if (!set || set.flows.length === 0) return <Empty>Для этого персонажа цепочек пока нет.</Empty>;
  const allOpen = set.flows.every((_, i) => open[i] !== false);
  return (
    <div className="tab-body flows">
      <div className="flows-intro">
        <span>
          Схемы напора: что делать после приёма, смотря как ответит соперник. <b>Зелёное</b> — выгодно, <b>оранжевое</b> — рискованно.
          Наведи на приём — покажутся фреймы.
        </span>
        <button
          className="btn small"
          onClick={() => setOpen(Object.fromEntries(set.flows.map((_, i) => [i, !allOpen])))}
          title="Свернуть или развернуть все схемы"
        >
          {allOpen ? 'Свернуть все' : 'Развернуть все'}
        </button>
      </div>
      {set.flows.map((f, i) => (
        <FlowCard key={i} flow={f} n={i + 1} open={open[i] !== false} onToggle={() => setOpen((o) => ({ ...o, [i]: !(o[i] !== false) }))} />
      ))}
      {set.sources.length > 0 && (
        <p className="muted small flows-src">
          По материалам:{' '}
          {set.sources.map((s, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
            </span>
          ))}
          . Пересказ и схемы — TekkenRU.
        </p>
      )}
    </div>
  );
}

function FlowCard({ flow, n, open, onToggle }: { flow: Flow; n: number; open: boolean; onToggle: () => void }) {
  return (
    <section className={`card flow-card${open ? '' : ' closed'}`}>
      <header className="card-head flow-head" onClick={onToggle}>
        <span className="flow-n">{n}</span>
        <div className="flow-titles">
          <h3>
            <RichText text={flow.title} />
          </h3>
          <span className="flow-when">
            <b>Когда:</b> <RichText text={flow.when} />
          </span>
        </div>
        <span className="flow-toggle">{open ? '▾' : '▸'}</span>
      </header>
      {open && (
        <div className="card-body">
          <div className="flow-tree">
            <NodeView node={flow.root} root />
          </div>
          {flow.note && (
            <p className="flow-note">
              <RichText text={flow.note} />
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function NodeView({ node, root }: { node: FlowNode; root?: boolean }) {
  const ctx = useContext(CharContext);
  const move = node.cmd ? ctx.findMove(node.cmd) : undefined;
  return (
    <div className={`fnode-wrap${root ? ' root' : ''}`}>
      <div className={`fnode out-${node.outcome ?? 'none'}`}>
        <div className="fnode-head">
          {node.cmd && <Notation cmd={node.cmd} size="md" />}
          {node.label && <span className="fnode-label">{node.label}</span>}
          {move && <FrameStrip move={move} />}
          {move && ctx.charId && <MoveVideo charId={ctx.charId} move={move} compact />}
        </div>
        {node.text && (
          <p className="fnode-text">
            <RichText text={node.text} />
          </p>
        )}
      </div>
      {node.next && node.next.length > 0 && (
        <ul className="fbranches">
          {node.next.map((b, i) => (
            <li key={i} className="fbranch">
              <div className="fif">
                <span className="fif-word">если</span> <RichText text={b.if} />
              </div>
              <NodeView node={b.then} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
