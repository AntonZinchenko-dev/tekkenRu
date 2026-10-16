import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import type { CharacterData, CharacterInfo, MatchupCustom, MatchupItem, Move } from '../../shared/types';
import { api } from '../api';
import { CharContext, buildMoveIndex, type CharCtx } from '../context';
import { FrameStrip, RichText } from '../components/Content';
import { VideoThumb } from '../components/MoveVideo';
import { Notation } from '../notation/Notation';
import { dangerFromItem, dangers, guideFor, myPunishers, specials, type Danger } from './matchup';
import { MovePicker } from '../components/MovePicker';

export type VisionStatus = { on: boolean; text: string; ok?: boolean };

type Props = {
  chars: CharacterInfo[];
  meId: string | null;
  oppId: string | null;
  setMe: (id: string) => void;
  setOpp: (id: string) => void;
  onSwap: () => void;
  vision: VisionStatus;
  showFrames: CharCtx['showFrames'];
  btnDigits: boolean;
  avatar: (id: string, cls?: string) => ReactNode;
};

function useCharacter(id: string | null) {
  const [data, setData] = useState<CharacterData | null>(null);
  useEffect(() => {
    if (!id) return setData(null);
    let alive = true;
    api.getCharacter(id).then((d) => alive && setData(d));
    const off = api.onCharacterUpdated((u) => {
      if (u === id) api.getCharacter(id).then((d) => alive && setData(d));
    });
    return () => {
      alive = false;
      off();
    };
  }, [id]);
  return data;
}

function makeCtx(d: CharacterData | null, showFrames: CharCtx['showFrames'], btnDigits: boolean): CharCtx {
  const stanceInfo = d?.guide?.stances ?? [];
  return {
    charId: d?.id,
    stances: [...(d?.frames?.stances ?? []), ...stanceInfo.map((s) => s.abbr.replace(/\./g, ''))],
    stanceInfo,
    findMove: buildMoveIndex(d?.frames?.moves ?? []),
    showFrames,
    btnDigits,
  };
}

export function VersusView(p: Props) {
  const me = useCharacter(p.meId);
  const opp = useCharacter(p.oppId);
  const meCtx = useMemo(() => makeCtx(me, p.showFrames, p.btnDigits), [me, p.showFrames, p.btnDigits]);
  const oppCtx = useMemo(() => makeCtx(opp, p.showFrames, p.btnDigits), [opp, p.showFrames, p.btnDigits]);
  const punishers = useMemo(() => myPunishers(me), [me]);
  const sp = useMemo(() => specials(opp), [opp]);
  const name = (id: string | null) => p.chars.find((c) => c.id === id)?.displayName ?? '—';
  const counterTips = (opp?.guide?.sections ?? [])
    .filter((s) => s.tab === 'counter' && s.title.startsWith('Как играть против'))
    .flatMap((s) => s.blocks)
    .flatMap((b) => (b.type === 'bullets' ? b.items : b.type === 'text' ? [b.text] : []))
    .slice(0, 4);

  return (
    <div className="vs">
      <div className="vs-head">
        <Side label="Ты" id={p.meId} chars={p.chars} onPick={p.setMe} avatar={p.avatar} />
        <div className="vs-mid">
          <div className="vs-word">VS</div>
          <button className="icon-btn" title="Поменять местами" onClick={p.onSwap}>
            ⇄
          </button>
        </div>
        <Side label="Соперник" id={p.oppId} chars={p.chars} onPick={p.setOpp} avatar={p.avatar} right />
      </div>
      <div className={`vs-vision${p.vision.on ? ' on' : ''}${p.vision.ok ? ' ok' : ''}`}>
        <span className="dot-live" /> {p.vision.text}
        <span className="vs-force-hint" title="Работает и когда активна игра">
          <kbd>Num −</kbd> узнать соперника заново
        </span>
      </div>

      {!p.oppId || !opp ? (
        <div className="empty">Выбери соперника слева в списке — или включи автоопределение в ⚙.</div>
      ) : (
        <>
          <VsSections
            blocks={{
              dangers: (
          <DangerList
            opp={opp}
            me={me}
            oppCtx={oppCtx}
            meCtx={meCtx}
            title={
              <>
                Опасное у {name(p.oppId)} — и как это разбирать{p.meId && <> за {name(p.meId)}</>}
              </>
            }
          />
              ),
              plan: counterTips.length > 0 ? (
                <section className="card">
                <header className="card-head">
                  <h3>Общий план против {name(p.oppId)}</h3>
                </header>
                <div className="card-body">
                  <ul className="bullets">
                    {counterTips.map((t, i) => (
                      <li key={i}>
                        <CharContext.Provider value={oppCtx}>
                          <RichText text={t} />
                        </CharContext.Provider>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
              ) : null,
              specials: (
                <section className="card">
              <header className="card-head">
                <h3>Его особые приёмы</h3>
              </header>
              <div className="card-body">
                <CharContext.Provider value={oppCtx}>
                  <MoveRow title="Heat Smash" moves={sp.heatSmash} />
                  <MoveRow title="Павер-краши" moves={sp.powerCrush} />
                  <MoveRow title="Heat Engager" moves={sp.engagers} />
                </CharContext.Provider>
              </div>
            </section>
              ),
              punish: punishers.length > 0 ? (
                <section className="card">
                <header className="card-head">
                  <h3>Твои наказания ({name(p.meId)})</h3>
                </header>
                <div className="card-body">
                  <CharContext.Provider value={meCtx}>
                    <table className="tbl">
                      <tbody>
                        {punishers.map((x, i) => (
                          <tr key={i}>
                            <td className="mono">{x.frames}f</td>
                            <td>{x.crouch ? 'из присяда' : 'стоя'}</td>
                            <td>
                              <Notation cmd={x.cmd} size="sm" />
                            </td>
                            <td className="dim">{x.why}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CharContext.Provider>
                </div>
              </section>
              ) : null,
            }}
          />
        </>
      )}
    </div>
  );
}

function Side({
  label,
  id,
  chars,
  onPick,
  avatar,
  right,
}: {
  label: string;
  id: string | null;
  chars: CharacterInfo[];
  onPick: (id: string) => void;
  avatar: Props['avatar'];
  right?: boolean;
}) {
  return (
    <div className={`vs-side${right ? ' right' : ''}`}>
      {id ? avatar(id, 'vs-avatar') : <div className="vs-avatar empty-av">?</div>}
      <div className="vs-who">
        <span className="vs-label">{label}</span>
        <select className="input vs-select" value={id ?? ''} onChange={(e) => onPick(e.target.value)}>
          <option value="" disabled>
            выбрать…
          </option>
          {chars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

type CardEdit = {
  onEdit: () => void;
  onRemove: () => void;
  onUp?: () => void;
  onDown?: () => void;
  editor?: ReactNode;
};

function DangerCard({ n, d, oppCtx, meCtx, edit }: { n: number; d: Danger; oppCtx: CharCtx; meCtx: CharCtx; edit?: CardEdit }) {
  return (
    <div className="danger">
      <div className="danger-n">
        {edit && (
          <span className="danger-grip" title="Потяни, чтобы переставить">
            ⠿
          </span>
        )}
        {n}
      </div>
      <div className="danger-body">
        {edit && (
          <div className="danger-tools">
            <button className="icon-btn small" disabled={!edit.onUp} onClick={edit.onUp} title="Выше">
              ↑
            </button>
            <button className="icon-btn small" disabled={!edit.onDown} onClick={edit.onDown} title="Ниже">
              ↓
            </button>
            <button className={`icon-btn small${edit.editor ? ' on' : ''}`} onClick={edit.onEdit} title="Изменить подпись и описание">
              ✎
            </button>
            <button className="icon-btn small" onClick={edit.onRemove} title="Убрать из списка">
              🗑
            </button>
          </div>
        )}
        <CharContext.Provider value={oppCtx}>
          <div className="move-head">
            <Notation cmd={d.cmd} size="lg" />
            {d.label && <span className="move-label">{d.label}</span>}
            {d.move && <FrameStrip move={d.move} />}
          </div>
          {edit?.editor ??
            (d.guideText && (
              <p className="danger-guide">
                <RichText text={d.guideText} />
              </p>
            ))}
        </CharContext.Provider>
        {d.hints.length > 0 && (
          <ul className="danger-hints">
            {d.hints.map((h, i) => (
              <li key={i} className={`hint hint-${h.kind}`}>
                {h.text}
                {h.punish && (
                  <CharContext.Provider value={meCtx}>
                    {' '}
                    <Notation cmd={h.punish.cmd} size="md" /> <span className="dim">({h.punish.frames}f{h.punish.why ? `, ${h.punish.why}` : ''})</span>
                  </CharContext.Provider>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {d.move?.video && oppCtx.charId && <VideoThumb charId={oppCtx.charId} move={d.move} />}
    </div>
  );
}

function MoveRow({ title, moves }: { title: string; moves: Move[] }) {
  if (!moves.length) return null;
  return (
    <div className="vs-row">
      <span className="vs-row-title">{title}</span>
      <span className="vs-row-moves">
        {moves.map((m) => (
          <span key={m.id} className="vs-chip">
            <Notation cmd={m.command} size="sm" />
          </span>
        ))}
      </span>
    </div>
  );
}

/** Список «Опасное у соперника»: автоподбор или свой порядок, свои подписи и описания */
function DangerList({
  opp,
  me,
  oppCtx,
  meCtx,
  title,
}: {
  opp: CharacterData;
  me: CharacterData | null;
  oppCtx: CharCtx;
  meCtx: CharCtx;
  title: ReactNode;
}) {
  const [custom, setCustom] = useState<MatchupCustom | null>(null);
  const [edit, setEdit] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let alive = true;
    setEdit(false);
    setOpen(null);
    setAdding(false);
    setCustom(null);
    api
      .getMatchup(opp.id)
      .then((m) => alive && setCustom(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [opp.id]);

  const auto = useMemo(() => dangers(opp, me, 5), [opp, me]);
  const items: MatchupItem[] = useMemo(() => custom?.items ?? auto.map((d) => ({ cmd: d.cmd })), [custom, auto]);
  const list = useMemo(() => items.map((it) => dangerFromItem(opp, me, it)), [items, opp, me]);

  const save = (next: MatchupItem[]) => {
    const m = next.length ? { items: next, updatedAt: new Date().toISOString() } : null;
    setCustom(m);
    void api.saveMatchup(opp.id, m);
  };
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    save(next);
    if (open === from) setOpen(to);
  };
  const update = (i: number, patch: Partial<MatchupItem>) => save(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));

  // перетаскивание мышью
  const onDragStart = (i: number) => (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
    setDrag({ from: i, to: i });
  };
  const onDragOver = (i: number) => (e: DragEvent<HTMLDivElement>) => {
    if (!drag) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const to = e.clientY < r.top + r.height / 2 ? i : i + 1;
    if (to !== drag.to) setDrag({ ...drag, to });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (drag) move(drag.from, drag.to > drag.from ? drag.to - 1 : drag.to);
    setDrag(null);
  };

  return (
    <>
      <div className="vs-list-head">
        <h2 className="vs-title">{title}</h2>
        {custom && !edit && <span className="cb-tag on static">свой список</span>}
        <span className="vs-list-tools">
          {edit ? (
            <>
              <button className="btn small" onClick={() => setAdding((a) => !a)}>
                ＋ Добавить приём
              </button>
              {custom &&
                (confirmReset ? (
                  <>
                    <span className="small">Вернуть автоподбор?</span>
                    <button
                      className="btn small danger"
                      onClick={() => {
                        save([]);
                        setConfirmReset(false);
                        setOpen(null);
                      }}
                    >
                      Да
                    </button>
                    <button className="btn small" onClick={() => setConfirmReset(false)}>
                      Нет
                    </button>
                  </>
                ) : (
                  <button className="btn small" onClick={() => setConfirmReset(true)} title="Забыть свои правки для этого соперника">
                    ↺ Автоподбор
                  </button>
                ))}
              <button
                className="btn primary small"
                onClick={() => {
                  setEdit(false);
                  setOpen(null);
                  setAdding(false);
                }}
              >
                ✓ Готово
              </button>
            </>
          ) : (
            <button className="btn small" onClick={() => setEdit(true)} title="Выбрать приёмы, переставить, написать свои описания">
              ✎ Настроить список
            </button>
          )}
        </span>
      </div>

      {edit && (
        <p className="muted small vs-edit-hint">
          Перетаскивай карточки мышью (или стрелками ↑ ↓), чтобы важное было сверху. ✎ — своя подпись и описание, 🗑 — убрать. Подсказки «чем наказывать»
          программа считает сама по фреймам. Настройки сохраняются для этого соперника.
        </p>
      )}

      {edit && adding && (
        <div className="vs-add">
          <CharContext.Provider value={oppCtx}>
            <MovePicker
              moves={opp.frames?.moves ?? []}
              autoFocus
              placeholder="Найди приём соперника: df2, b1,4 или название…"
              onPick={(m) => {
                save([...items, { cmd: m.command }]);
                setOpen(items.length);
                setAdding(false);
              }}
            />
          </CharContext.Provider>
        </div>
      )}

      <div className={`vs-list${edit ? ' editing' : ''}`} onDragOver={(e) => drag && e.preventDefault()} onDrop={onDrop}>
        {list.map((d, i) => (
          <div
            key={items[i].cmd + i}
            className={`danger-wrap${drag && drag.from === i ? ' dragging' : ''}${drag && drag.to === i && drag.from !== i && drag.from !== i - 1 ? ' drop-before' : ''}${
              drag && drag.to === i + 1 && i === list.length - 1 && drag.from !== i ? ' drop-after' : ''
            }`}
            draggable={edit && open !== i}
            onDragStart={onDragStart(i)}
            onDragOver={onDragOver(i)}
            onDragEnd={() => setDrag(null)}
          >
            <DangerCard
              n={i + 1}
              d={d}
              oppCtx={oppCtx}
              meCtx={meCtx}
              edit={
                edit
                  ? {
                      onEdit: () => setOpen(open === i ? null : i),
                      onRemove: () => {
                        save(items.filter((_, k) => k !== i));
                        setOpen(null);
                      },
                      onUp: i > 0 ? () => move(i, i - 1) : undefined,
                      onDown: i < items.length - 1 ? () => move(i, i + 1) : undefined,
                      editor:
                        open === i ? (
                          <ItemEditor
                            key={items[i].cmd}
                            opp={opp}
                            item={items[i]}
                            shown={d}
                            onSave={(patch) => {
                              update(i, patch);
                              setOpen(null);
                            }}
                            onCancel={() => setOpen(null)}
                          />
                        ) : undefined,
                    }
                  : undefined
              }
            />
          </div>
        ))}
        {list.length === 0 && <div className="empty">Для этого персонажа нет данных. Обнови фреймдату в ⚙ или добавь приёмы сам.</div>}
      </div>
    </>
  );
}

/** Правка карточки: своя подпись и описание (команды можно писать в `кавычках` — нарисуются иконками) */
function ItemEditor({
  opp,
  item,
  shown,
  onSave,
  onCancel,
}: {
  opp: CharacterData;
  item: MatchupItem;
  shown: Danger;
  onSave: (patch: Partial<MatchupItem>) => void;
  onCancel: () => void;
}) {
  const g = guideFor(opp, item.cmd);
  const [label, setLabel] = useState(shown.label ?? '');
  const [text, setText] = useState(shown.guideText ?? '');
  const [cmd, setCmd] = useState(item.cmd);
  const [replace, setReplace] = useState(false);
  const [insert, setInsert] = useState(false);
  return (
    <div className="item-editor" onClick={(e) => e.stopPropagation()}>
      <div className="item-editor-row">
        <span className="item-editor-cap">Приём</span>
        <Notation cmd={cmd} size="md" plain />
        <button className="btn small" onClick={() => setReplace((r) => !r)}>
          {replace ? 'Не менять' : 'Заменить приём'}
        </button>
      </div>
      {replace && (
        <MovePicker
          moves={opp.frames?.moves ?? []}
          autoFocus
          onPick={(m) => {
            setCmd(m.command);
            setReplace(false);
          }}
        />
      )}
      <input className="input" placeholder="Подпись: «Главный лоу», «Плюсовой мид»…" value={label} onChange={(e) => setLabel(e.target.value)} />
      <textarea
        className="input"
        rows={3}
        placeholder="Твоё описание: как разбирать, на что смотреть. Приёмы вставляй кнопкой ниже — нарисуются иконками."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="item-editor-row">
        <button className="btn small" onClick={() => setInsert((v) => !v)} title="Найти приём соперника и вставить его в описание иконками">
          {insert ? 'Не вставлять' : '＋ приём в текст'}
        </button>
      </div>
      {insert && (
        <MovePicker
          moves={opp.frames?.moves ?? []}
          autoFocus
          onPick={(m) => {
            setText((t) => (t.trimEnd() ? t.trimEnd() + ' ' : '') + '`' + m.command + '` ');
            setInsert(false);
          }}
        />
      )}
      {text.trim() && (
        <p className="danger-guide item-editor-preview">
          <RichText text={text} />
        </p>
      )}
      <div className="item-editor-row end">
        {(g.label || g.text) && (
          <button
            className="btn small"
            title="Вернуть подпись и описание из гайда"
            onClick={() => {
              setLabel(g.label ?? '');
              setText(g.text ?? '');
            }}
          >
            ↺ Текст гайда
          </button>
        )}
        <button className="btn small" onClick={onCancel}>
          Отмена
        </button>
        <button
          className="btn primary small"
          onClick={() =>
            onSave({
              cmd,
              // совпадает с гайдом — не сохраняем копию, чтобы обновления гайда подтягивались сами
              label: label.trim() && label.trim() !== (g.label ?? '') ? label.trim() : undefined,
              text: text.trim() && text.trim() !== (g.text ?? '') ? text.trim() : undefined,
            })
          }
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

// ---------- Разделы экрана «против»: свой порядок, скрытие, ширина ----------
type SecId = 'dangers' | 'plan' | 'specials' | 'punish';
const SEC_TITLES: Record<SecId, string> = {
  dangers: 'Опасные приёмы соперника',
  plan: 'Общий план против него',
  specials: 'Его особые приёмы',
  punish: 'Твои наказания',
};
const SEC_DEFAULT: SecId[] = ['dangers', 'plan', 'specials', 'punish'];
type VsLayout = { order: SecId[]; hidden: SecId[]; wide: SecId[] };

function loadLayout(): VsLayout {
  const def: VsLayout = { order: SEC_DEFAULT, hidden: [], wide: ['dangers'] };
  try {
    const raw = JSON.parse(localStorage.getItem('vsLayout') || 'null') as Partial<VsLayout> | null;
    if (!raw) return def;
    const ok = (x: unknown): x is SecId => SEC_DEFAULT.includes(x as SecId);
    const order = (raw.order ?? []).filter(ok);
    for (const id of SEC_DEFAULT) if (!order.includes(id)) order.push(id); // новые разделы — в конец
    return { order, hidden: (raw.hidden ?? []).filter(ok), wide: (raw.wide ?? def.wide).filter(ok) };
  } catch {
    return def;
  }
}

function VsSections({ blocks }: { blocks: Record<SecId, ReactNode | null> }) {
  const [layout, setLayout] = useState<VsLayout>(loadLayout);
  const [edit, setEdit] = useState(false);
  const [drag, setDrag] = useState<{ from: SecId; over: SecId | null; after: boolean } | null>(null);

  const save = (l: VsLayout) => {
    setLayout(l);
    try {
      localStorage.setItem('vsLayout', JSON.stringify(l));
    } catch {
      /* не страшно */
    }
  };
  const moveTo = (id: SecId, target: SecId, after: boolean) => {
    if (id === target) return;
    const order = layout.order.filter((x) => x !== id);
    const at = order.indexOf(target) + (after ? 1 : 0);
    order.splice(at, 0, id);
    save({ ...layout, order });
  };
  const shift = (id: SecId, d: -1 | 1) => {
    const i = layout.order.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= layout.order.length) return;
    const order = [...layout.order];
    [order[i], order[j]] = [order[j], order[i]];
    save({ ...layout, order });
  };
  const toggle = (key: 'hidden' | 'wide', id: SecId) =>
    save({ ...layout, [key]: layout[key].includes(id) ? layout[key].filter((x) => x !== id) : [...layout[key], id] });

  const visible = layout.order.filter((id) => blocks[id] != null && (edit || !layout.hidden.includes(id)));

  return (
    <>
      <div className="vs-layout-bar">
        {edit ? (
          <>
            <span className="muted small">Перетаскивай разделы за шапку или двигай стрелками. 👁 — скрыть, ⇔ — на всю ширину или в половину.</span>
            <button className="btn small" onClick={() => save({ order: SEC_DEFAULT, hidden: [], wide: ['dangers'] })}>
              ↺ Как было
            </button>
            <button className="btn primary small" onClick={() => setEdit(false)}>
              ✓ Готово
            </button>
          </>
        ) : (
          <button className="btn small ghost" onClick={() => setEdit(true)} title="Поменять порядок разделов на этом экране">
            ⇅ Порядок разделов
          </button>
        )}
      </div>
      <div className={`vs-sections${edit ? ' editing' : ''}`}>
        {visible.map((id, i) => {
          const hidden = layout.hidden.includes(id);
          const cls = [
            'vs-sec',
            layout.wide.includes(id) ? 'wide' : '',
            hidden ? 'is-hidden' : '',
            drag?.from === id ? 'dragging' : '',
            drag?.over === id && drag.from !== id ? (drag.after ? 'drop-after' : 'drop-before') : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={id}
              className={cls}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const wide = r.width > (e.currentTarget.parentElement?.clientWidth ?? r.width) * 0.75;
                const after = wide ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
                if (drag.over !== id || drag.after !== after) setDrag({ ...drag, over: id, after });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag?.over) moveTo(drag.from, drag.over, drag.after);
                setDrag(null);
              }}
            >
              {edit && (
                <div
                  className="vs-sec-bar"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', id);
                    setDrag({ from: id, over: null, after: false });
                  }}
                  onDragEnd={() => setDrag(null)}
                >
                  <span className="danger-grip">⠿</span>
                  <b>{SEC_TITLES[id]}</b>
                  {hidden && <span className="muted small">скрыт</span>}
                  <span className="vs-sec-tools">
                    <button className="icon-btn small" disabled={i === 0} onClick={() => shift(id, -1)} title="Выше">
                      ↑
                    </button>
                    <button className="icon-btn small" disabled={i === visible.length - 1} onClick={() => shift(id, 1)} title="Ниже">
                      ↓
                    </button>
                    <button className={`icon-btn small${layout.wide.includes(id) ? ' on' : ''}`} onClick={() => toggle('wide', id)} title="На всю ширину / в половину">
                      ⇔
                    </button>
                    <button className={`icon-btn small${hidden ? ' on' : ''}`} onClick={() => toggle('hidden', id)} title={hidden ? 'Показать' : 'Скрыть'}>
                      👁
                    </button>
                  </span>
                </div>
              )}
              <div className="vs-sec-body">{blocks[id]}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
