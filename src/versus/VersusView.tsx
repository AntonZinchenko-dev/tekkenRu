import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import type { CharacterData, CharacterInfo, MatchupCustom, MatchupItem, Move } from '../../shared/types';
import { api } from '../api';
import { CharContext, buildMoveIndex, type CharCtx } from '../context';
import { FrameStrip, RichText } from '../components/Content';
import { VideoThumb, videoUrl } from '../components/MoveVideo';
import { Notation } from '../notation/Notation';
import { BREAK_NOTE, BREAK_TITLE, dangerFromItem, dangers, guideFor, myPunishers, specials, throwsOf, type Danger, type ThrowBreak, type ThrowSet } from './matchup';
import { MovePicker, thrClass } from '../components/MovePicker';


type Props = {
  chars: CharacterInfo[];
  meId: string | null;
  oppId: string | null;
  setMe: (id: string) => void;
  setOpp: (id: string) => void;
  onSwap: () => void;
  /** убрать соперника — откроется выбор */
  onClearOpp: () => void;
  /** недавние соперники (сверху в выборе) */
  recent: string[];
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
  const thr = useMemo(() => throwsOf(opp), [opp]);
  const [layoutEdit, setLayoutEdit] = useState(false);
  // «Кратко» — для взгляда между раундами: без длинных пояснений, ролики меньше
  const [dense, setDense] = useState(() => {
    try {
      return localStorage.getItem('vsDense') === '1';
    } catch {
      return false;
    }
  });
  const toggleDense = (v: boolean) => {
    setDense(v);
    try {
      localStorage.setItem('vsDense', v ? '1' : '0');
    } catch {
      /* не страшно */
    }
  };
  const name = (id: string | null) => p.chars.find((c) => c.id === id)?.displayName ?? '—';
  const counterTips = (opp?.guide?.sections ?? [])
    .filter((s) => s.tab === 'counter' && s.title.startsWith('Как играть против'))
    .flatMap((s) => s.blocks)
    .flatMap((b) => (b.type === 'bullets' ? b.items : b.type === 'text' ? [b.text] : []))
    .slice(0, 4);

  return (
    <div className={`vs${dense ? ' dense' : ''}`}>
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
      <div className="vs-bar">
        <div className="vs-bar-left">
          {p.oppId && (
            <button className="btn small" onClick={p.onClearOpp} title="Открыть выбор соперника (Num −, работает и из игры)">
              ⇆ Другой соперник
            </button>
          )}
          <span className="vs-force-hint" title="Нажми прямо в игре — на этом экране откроется выбор соперника">
            <kbd>Num −</kbd> выбрать соперника, даже из игры
          </span>
        </div>
        {p.oppId && opp && !layoutEdit && (
          <div className="seg seg-sm" role="radiogroup" title="Сколько показывать: «Кратко» — для взгляда между раундами">
            <button role="radio" aria-checked={!dense} className={!dense ? 'on' : ''} onClick={() => toggleDense(false)}>
              Подробно
            </button>
            <button role="radio" aria-checked={dense} className={dense ? 'on' : ''} onClick={() => toggleDense(true)}>
              Кратко
            </button>
          </div>
        )}
        {p.oppId && opp && (
          <button
            className={`btn small${layoutEdit ? ' primary' : ' ghost'}`}
            onClick={() => setLayoutEdit((v) => !v)}
            title="Поменять порядок, ширину и видимость разделов на этом экране"
          >
            {layoutEdit ? '✓ Готово' : '⇅ Разделы'}
          </button>
        )}
      </div>

      {!p.oppId ? (
        <OppPicker chars={p.chars} recent={p.recent} onPick={p.setOpp} avatar={p.avatar} />
      ) : !opp ? (
        <div className="empty">Загружаю {name(p.oppId)}…</div>
      ) : (
        <>
          <VsSections
            edit={layoutEdit}
            blocks={{
              dangers: (
          <DangerList
            dense={dense}
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
                <section className="card opp">
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
              throws:
                thr.groups.length + thr.positional.length > 0 ? (
                  <CharContext.Provider value={oppCtx}>
                    <ThrowsCard set={thr} name={name(p.oppId)} charId={opp.id} />
                  </CharContext.Provider>
                ) : null,
              specials: (
                <section className="card opp">
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
                <section className="card me">
                <header className="card-head">
                  <h3>Твои наказания ({name(p.meId)})</h3>
                </header>
                <div className="card-body">
                  <CharContext.Provider value={meCtx}>
                    <table className="tbl pun-tbl">
                      <tbody>
                        {punishers.map((x, i) => (
                          <tr key={i}>
                            <td className="pun-f">
                              <b>{x.frames}</b>f<span className="pun-pos">{x.crouch ? 'присед' : 'стоя'}</span>
                            </td>
                            <td className="pun-cmd">
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

/** Соперник ещё не выбран — сразу показываем всех, выбрать в один клик */
function OppPicker({ chars, recent, onPick, avatar }: { chars: CharacterInfo[]; recent: string[]; onPick: (id: string) => void; avatar: Props['avatar'] }) {
  const [q, setQ] = useState('');
  // зеркальные матчи бывают — себя из списка не убираем
  const list = chars.filter((c) => c.displayName.toLowerCase().includes(q.trim().toLowerCase()));
  const recentChars = q.trim() ? [] : recent.map((id) => chars.find((c) => c.id === id)).filter((c): c is CharacterInfo => Boolean(c));
  return (
    <section className="opp-pick">
      <div className="opp-pick-head">
        <h2>Кто соперник?</h2>
        <input
          className="input"
          placeholder="Поиск…"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && list[0] && onPick(list[0].id)}
        />
      </div>
      <p className="muted small">Начни печатать имя и нажми Enter — или кликни по аватарке. Прямо из игры это окно открывается клавишей Num −.</p>
      {recentChars.length > 0 && (
        <>
          <h3 className="opp-sub">Недавние</h3>
          <div className="opp-grid opp-recent">
            {recentChars.map((c) => (
              <button key={c.id} className="opp-cell" onClick={() => onPick(c.id)}>
                {avatar(c.id, 'opp-av')}
                <span>{c.displayName}</span>
              </button>
            ))}
          </div>
          <h3 className="opp-sub">Все</h3>
        </>
      )}
      <div className="opp-grid">
        {list.map((c) => (
          <button key={c.id} className="opp-cell" onClick={() => onPick(c.id)}>
            {avatar(c.id, 'opp-av')}
            <span>{c.displayName}</span>
          </button>
        ))}
      </div>
    </section>
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

function DangerCard({ n, d, oppCtx, meCtx, edit, dense }: { n: number; d: Danger; oppCtx: CharCtx; meCtx: CharCtx; edit?: CardEdit; dense?: boolean }) {
  const [more, setMore] = useState(false);
  const showGuide = !dense || more || Boolean(edit?.editor);
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
            (d.guideText &&
              (showGuide ? (
                <p className="danger-guide">
                  <RichText text={d.guideText} />
                  {dense && (
                    <button className="link-btn" onClick={() => setMore(false)}>
                      свернуть
                    </button>
                  )}
                </p>
              ) : (
                <button className="link-btn danger-more" onClick={() => setMore(true)}>
                  Пояснение из гайда
                </button>
              )))}
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

/** Захваты соперника: сгруппированы по кнопке слома, у каждого — ролик, если он есть */
function ThrowsCard({ set, name, charId }: { set: ThrowSet; name: string; charId?: string }) {
  const total = set.groups.reduce((n, g) => n + g.items.length, 0) + set.positional.length;
  const [all, setAll] = useState(false);
  // главные группы (то, что реально ломают в бою) — сразу; цепочки стоек и экзотика — по кнопке
  const MAIN = new Set(['1', '2', '1+2', '1/2', 'input', 'none', 'crouch']);
  const shown = all ? set.groups : set.groups.filter((g) => MAIN.has(g.brk));
  const hiddenN = set.groups.filter((g) => !MAIN.has(g.brk)).reduce((n, g) => n + g.items.length, 0);
  // крупный просмотр: все захваты с роликом подряд, листать стрелками
  const withVideo = shown.flatMap((g) => g.items.filter((x) => x.move.video));
  const [zoom, setZoom] = useState<number | null>(null);
  const openZoom = (m: Move) => {
    const i = withVideo.findIndex((x) => x.move.id === m.id);
    if (i >= 0) setZoom(i);
  };
  return (
    <section className="card opp">
      <header className="card-head">
        <h3>
          Захваты {name} <span className="tab-n">{total}</span>
        </h3>
      </header>
      <div className="card-body thr">
        <p className="thr-tip">
          Ломай кнопкой той руки, которой схватили: левая — <b>1</b>, правая — <b>2</b>, обе — <b>1+2</b>. От обычных бросков можно пригнуться.
        </p>
        {set.positional.length > 0 && (
          <div className="thr-pos-row">
            {set.positional.map((x) => (
              <span key={x.move.id} className="thr-pos-chip" title={x.move.name ?? ''}>
                {x.where}: <b>{x.brk === 'none' ? 'не ломается' : x.brk === '?' ? '—' : x.brk === '1/2' || x.brk === 'input' ? '1 или 2' : x.brk}</b>
              </span>
            ))}
          </div>
        )}
        <div className="thr-groups">
        {shown.map((g) => (
          <div key={g.brk} className={`thr-group${g.items.length > 3 ? ' big' : ''}`}>
            <div className="thr-group-head">
              <span className={`thr-badge thr-${thrClass(g.brk)}`}>{BREAK_TITLE[g.brk]}</span>
              {BREAK_NOTE[g.brk] && <span className="thr-note">{BREAK_NOTE[g.brk]}</span>}
            </div>
            <div className="thr-tiles">
              {g.items.map(({ move: m }) => (
                <div key={m.id} className="thr-tile">
                  {m.video && charId ? (
                    <div
                      className="thr-thumb"
                      title="Открыть крупно"
                      onClickCapture={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        openZoom(m);
                      }}
                    >
                      <VideoThumb charId={charId} move={m} />
                      <span className="thr-zoom" aria-hidden>
                        ⤢
                      </span>
                    </div>
                  ) : (
                    <div className="thr-novid">без ролика</div>
                  )}
                  <div className="thr-tile-cmd">
                    <Notation cmd={m.command} size="sm" />
                  </div>
                  <div className="thr-tile-meta">
                    <span className="thr-tile-name">{m.name ?? ' '}</span>
                    <span className="thr-tile-num">
                      {m.damage.match(/\d+/)?.[0] ?? '—'} ур{m.startup && /\d/.test(m.startup) ? ` · i${m.startup.match(/\d+/)?.[0]}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        </div>
        {zoom !== null && charId && withVideo[zoom] && (
          <ThrowZoom
            charId={charId}
            item={withVideo[zoom]}
            pos={zoom}
            total={withVideo.length}
            onNav={(d) => setZoom((z) => (z === null ? z : (z + d + withVideo.length) % withVideo.length))}
            onClose={() => setZoom(null)}
          />
        )}
        {hiddenN > 0 && (
          <button className="btn small ghost thr-more" onClick={() => setAll((v) => !v)}>
            {all ? 'Скрыть редкие' : `Ещё ${hiddenN}: из стоек и с особым сломом`}
          </button>
        )}
      </div>
    </section>
  );
}

/** Крупный просмотр захвата: ролик почти на весь экран, замедление, листание ← → */
function ThrowZoom({
  charId,
  item,
  pos,
  total,
  onNav,
  onClose,
}: {
  charId: string;
  item: { move: Move; brk: ThrowBreak };
  pos: number;
  total: number;
  onNav: (d: 1 | -1) => void;
  onClose: () => void;
}) {
  const [speed, setSpeed] = useState(() => {
    try {
      return Number(localStorage.getItem('thrSpeed')) || 0.5;
    } catch {
      return 0.5;
    }
  });
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (el) el.playbackRate = speed;
    try {
      localStorage.setItem('thrSpeed', String(speed));
    } catch {
      /* не страшно */
    }
  }, [el, speed, item]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onNav(1);
      else if (e.key === 'ArrowLeft') onNav(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose, onNav]);
  const m = item.move;
  const url = videoUrl(charId, m);
  return (
    <div className="thr-lightbox" onClick={onClose} role="dialog" aria-label={m.name ?? m.command}>
      <div className="thr-lb-box" onClick={(e) => e.stopPropagation()}>
        <div className="thr-lb-head">
          <Notation cmd={m.command} size="md" />
          <span className="thr-lb-name">{m.name}</span>
          <span className={`thr-badge thr-${thrClass(item.brk)}`}>{BREAK_TITLE[item.brk]}</span>
          <span className="thr-lb-num">
            {m.damage.match(/\d+/)?.[0] ?? '—'} урона{m.startup && /\d/.test(m.startup) ? ` · i${m.startup.match(/\d+/)?.[0]}` : ''}
          </span>
          <button className="icon-btn thr-lb-x" onClick={onClose} title="Закрыть (Esc)">
            ✕
          </button>
        </div>
        {url && <video key={url} ref={setEl} className="thr-lb-video" src={url} autoPlay loop muted playsInline />}
        <div className="thr-lb-foot">
          <button className="btn small" onClick={() => onNav(-1)} disabled={total < 2} title="Предыдущий (←)">
            ← Пред.
          </button>
          <div className="seg seg-sm" role="radiogroup" aria-label="Скорость">
            {[1, 0.5, 0.25].map((v) => (
              <button key={v} role="radio" aria-checked={speed === v} className={speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>
                {v === 1 ? 'Обычно' : `${v}×`}
              </button>
            ))}
          </div>
          <span className="thr-lb-pos">
            {pos + 1} из {total}
          </span>
          <span className="thr-lb-hint">{BREAK_NOTE[item.brk]}</span>
          <button className="btn small" onClick={() => onNav(1)} disabled={total < 2} title="Следующий (→)">
            След. →
          </button>
        </div>
      </div>
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
  dense,
}: {
  dense?: boolean;
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
              dense={dense}
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
type SecId = 'dangers' | 'plan' | 'throws' | 'specials' | 'punish';
const SEC_TITLES: Record<SecId, string> = {
  dangers: 'Опасные приёмы соперника',
  plan: 'Общий план против него',
  throws: 'Его захваты',
  specials: 'Его особые приёмы',
  punish: 'Твои наказания',
};
const SEC_DEFAULT: SecId[] = ['dangers', 'plan', 'specials', 'punish', 'throws'];
const SEC_WIDE: SecId[] = ['dangers', 'throws'];
type VsLayout = { order: SecId[]; hidden: SecId[]; wide: SecId[] };

function loadLayout(): VsLayout {
  const def: VsLayout = { order: SEC_DEFAULT, hidden: [], wide: [...SEC_WIDE] };
  try {
    const raw = JSON.parse(localStorage.getItem('vsLayout') || 'null') as Partial<VsLayout> | null;
    if (!raw) return def;
    const ok = (x: unknown): x is SecId => SEC_DEFAULT.includes(x as SecId);
    const order = (raw.order ?? []).filter(ok);
    const wide = (raw.wide ?? def.wide).filter(ok);
    // новые разделы — в конец; если по умолчанию они широкие, то и тут широкие
    for (const id of SEC_DEFAULT)
      if (!order.includes(id)) {
        order.push(id);
        if (SEC_WIDE.includes(id) && !wide.includes(id)) wide.push(id);
      }
    return { order, hidden: (raw.hidden ?? []).filter(ok), wide };
  } catch {
    return def;
  }
}

/** Разделы подряд в половину ширины склеиваем в «поток» из двух колонок (без дыр), широкие — отдельно */
function runs(ids: SecId[], wide: SecId[]) {
  const out: { wide: boolean; ids: SecId[] }[] = [];
  for (const id of ids) {
    const w = wide.includes(id);
    const last = out[out.length - 1];
    if (!w && last && !last.wide) last.ids.push(id);
    else out.push({ wide: w, ids: [id] });
  }
  return out;
}

function VsSections({ blocks, edit }: { blocks: Record<SecId, ReactNode | null>; edit: boolean }) {
  const [layout, setLayout] = useState<VsLayout>(loadLayout);
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

  const renderSec = (id: SecId) => {
    const i = visible.indexOf(id);
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
  };

  return (
    <>
      {edit && (
        <div className="vs-layout-bar">
          <span className="muted small">Перетаскивай разделы за шапку или двигай стрелками. 👁 — скрыть, ⇔ — на всю ширину или в половину.</span>
          <button className="btn small" onClick={() => save({ order: SEC_DEFAULT, hidden: [], wide: [...SEC_WIDE] })}>
            ↺ Как было
          </button>
        </div>
      )}
      <div className={`vs-sections${edit ? ' editing' : ''}`}>
        {(edit ? visible.map((id) => ({ wide: true, ids: [id] })) : runs(visible, layout.wide)).map((run) =>
          run.wide ? (
            renderSec(run.ids[0])
          ) : (
            <div key={run.ids.join()} className="vs-run">
              {run.ids.map(renderSec)}
            </div>
          ),
        )}
      </div>

    </>
  );
}
