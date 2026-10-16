import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Move, UserCombo } from '../../shared/types';
import { CharContext } from '../context';
import { FrameStrip } from '../components/Content';
import { MovePicker } from '../components/MovePicker';
import { BtnIcon, ComboRoute, DirIcon, Notation } from '../notation/Notation';
import type { Dir } from '../notation/tokenize';

/** Метки ситуации, которые можно повесить на комбо */
export const COMBO_TAGS = ['Обычный стартер', 'После контр-хита', 'У стены', 'В Heat', 'После лоу', 'Для новичков', 'Максимум урона'];

const DIR_GRID: Dir[] = ['ub', 'u', 'uf', 'b', 'n', 'f', 'db', 'd', 'df'];
const BTN_SINGLE = [[1], [2], [3], [4]];
const BTN_COMBO = [
  [1, 2],
  [3, 4],
  [1, 3],
  [2, 4],
  [2, 3],
  [1, 4],
  [1, 2, 3, 4],
];
const COMMON_STANCES = ['WS', 'FC', 'BT', 'SS', 'WR', 'H'];
const MARKS: { v: string; title: string }[] = [
  { v: 'CH', title: 'Контр-хит' },
  { v: 'T!', title: 'Торнадо' },
  { v: 'W!', title: 'Удар в стену' },
  { v: 'Hold', title: 'Удерживать' },
  { v: 'BB!', title: 'Пробитие балкона' },
  { v: 'FB!', title: 'Пробитие пола' },
];

type Lane = 'starter' | 'step';
type Sel = { lane: Lane; i: number };

const newId = () => Math.random().toString(36).slice(2, 10);

// ---- как дописывать кусочки нотации к шагу ----
const endsWithPress = (s: string) => /[\d*)]$/.test(s.trimEnd());
function addDir(s: string, d: Dir, hold: boolean) {
  const v = d === 'n' ? 'n' : hold ? d.toUpperCase() : d;
  const base = endsWithPress(s) ? s.trimEnd() + ',' : s;
  return base + v;
}
function addBtn(s: string, b: number[], hold: boolean) {
  const v = b.join('+') + (hold ? '*' : '');
  if (!s.trim()) return v;
  if (endsWithPress(s)) return s.trimEnd() + ',' + v;
  if (/[a-z]$/i.test(s) && !/\s$/.test(s)) return s + (/[udfbn]$/i.test(s) ? '+' : ' ') + v;
  return s + v;
}
function addStance(s: string, st: string) {
  return s.trim() ? s.trimEnd() + ' ' + st + ' ' : st + ' ';
}
function addMark(s: string, m: string) {
  return (s.trimEnd() + ' ' + m).trim();
}
/** Стереть последний кусочек: метку, кнопки, направление или знак */
function backspace(s: string) {
  const t = s.trimEnd();
  const m =
    t.match(/\s*(CH|T!|W!|BB!|FB!|Hold)$/i) ??
    t.match(/[1-4](\+[1-4])*\*?$/) ??
    t.match(/\s*[A-Z]{2,4}\s*$/) ??
    t.match(/(df|db|uf|ub|DF|DB|UF|UB)$/) ??
    t.match(/.$/);
  return m ? t.slice(0, t.length - m[0].length) : t;
}

export function ComboBuilder({
  charName,
  stances,
  moves,
  initial,
  onSave,
  onClose,
}: {
  charName: string;
  stances: string[];
  moves: Move[];
  initial?: Partial<UserCombo>;
  onSave: (c: UserCombo) => void;
  onClose: () => void;
}) {
  const ctx = useContext(CharContext);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [starters, setStarters] = useState<string[]>(initial?.starters?.length ? initial.starters : ['']);
  const [steps, setSteps] = useState<string[]>(() => {
    const r = (initial?.route ?? '')
      .split(/\s*(?:→|->|=>|>)\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    return r.length ? r : [''];
  });
  const [sel, setSel] = useState<Sel>({ lane: 'starter', i: 0 });
  const [hold, setHold] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = sel.lane === 'starter' ? starters : steps;
  const setList = sel.lane === 'starter' ? setStarters : setSteps;
  const value = list[sel.i] ?? '';
  const setValue = (v: string) => setList((l) => l.map((x, k) => (k === sel.i ? v : x)));
  const found = value.trim() ? ctx.findMove(value.trim()) : undefined;

  useEffect(() => {
    inputRef.current?.focus();
  }, [sel.lane, sel.i]);

  // Esc — закрыть
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);


  const allStances = useMemo(() => {
    // только настоящие аббревиатуры стоек (BT, DEW, RAB…), без мусора из текста гайда
    const own = stances.map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z][A-Z0-9]{1,5}$/.test(s) && !COMMON_STANCES.includes(s));
    return [...COMMON_STANCES, ...[...new Set(own)]];
  }, [stances]);

  const addPill = (lane: Lane) => {
    const l = lane === 'starter' ? starters : steps;
    // пустую плашку второй раз не плодим — просто выбираем её
    const empty = l.findIndex((x) => !x.trim());
    if (empty >= 0) return setSel({ lane, i: empty });
    (lane === 'starter' ? setStarters : setSteps)([...l, '']);
    setSel({ lane, i: l.length });
  };
  const removePill = (lane: Lane, i: number) => {
    const l = lane === 'starter' ? starters : steps;
    const next = l.filter((_, k) => k !== i);
    (lane === 'starter' ? setStarters : setSteps)(next.length ? next : ['']);
    setSel({ lane, i: Math.max(0, Math.min(i, next.length - 1)) });
  };
  const movePill = (dir: -1 | 1) => {
    const j = sel.i + dir;
    if (j < 0 || j >= list.length) return;
    setList((l) => {
      const c = [...l];
      [c[sel.i], c[j]] = [c[j], c[sel.i]];
      return c;
    });
    setSel({ ...sel, i: j });
  };

  const cleanStarters = starters.map((s) => s.trim()).filter(Boolean);
  const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
  const canSave = cleanSteps.length > 0 || cleanStarters.length > 0;

  const save = () => {
    const now = new Date().toISOString();
    onSave({
      id: initial?.id ?? newId(),
      title: title.trim() || undefined,
      note: note.trim() || undefined,
      tags: tags.length ? tags : undefined,
      starters: cleanStarters,
      route: cleanSteps.join(' → '),
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    });
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal cb" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>
            {initial?.id ? 'Правка комбо' : 'Новое комбо'} · {charName}
          </h2>
          <button className="icon-btn" onClick={onClose} title="Закрыть (Esc)">
            ✕
          </button>
        </header>

        <div className="cb-grid">
          {/* ---- левая колонка: само комбо ---- */}
          <div className="cb-main">
            <input className="input cb-title" placeholder="Название (необязательно), например «Основное с df2»" value={title} onChange={(e) => setTitle(e.target.value)} />

            <div className="cb-lanes">
              <Lane
                label="старт"
                hint="чем начинаешь (можно несколько вариантов)"
                items={starters}
                lane="starter"
                sel={sel}
                onSelect={setSel}
                onAdd={() => addPill('starter')}
                onRemove={(i) => removePill('starter', i)}
                sepLabel="или"
              />
              <Lane
                label="дальше"
                hint="шаги комбо по порядку"
                items={steps}
                lane="step"
                sel={sel}
                onSelect={setSel}
                onAdd={() => addPill('step')}
                onRemove={(i) => removePill('step', i)}
              />
            </div>

            {/* редактор выбранной плашки */}
            <div className="cb-editor">
              <div className="cb-editor-head">
                <span className="cb-editing">
                  Редактируешь: <b>{sel.lane === 'starter' ? `старт ${sel.i + 1}` : `шаг ${sel.i + 1}`}</b>
                </span>
                {list.length > 1 && (
                  <span className="cb-move-btns">
                    <button className="btn small" disabled={sel.i === 0} onClick={() => movePill(-1)} title="Сдвинуть раньше">
                      ‹
                    </button>
                    <button className="btn small" disabled={sel.i === list.length - 1} onClick={() => movePill(1)} title="Сдвинуть позже">
                      ›
                    </button>
                  </span>
                )}
              </div>
              <div className="cb-input-row">
                <input
                  ref={inputRef}
                  className="input cb-input"
                  value={value}
                  placeholder="Нажимай иконки ниже или пиши: df2, f2,3, BT 1,2 T!"
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addPill(sel.lane === 'starter' ? 'step' : 'step');
                    }
                  }}
                />
                <button className="btn small" onClick={() => setValue(backspace(value))} title="Стереть последний кусочек">
                  ⌫
                </button>
                <button className="btn small" onClick={() => setValue('')} title="Очистить шаг">
                  Очистить
                </button>
              </div>
              <div className="cb-preview">
                {value.trim() ? <Notation cmd={value} size="lg" /> : <span className="muted small">тут появится нотация</span>}
                {found ? (
                  <span className="cb-found ok">
                    ✓ {found.name ?? 'приём'} <FrameStrip move={found} />
                  </span>
                ) : value.trim() ? (
                  <span className="cb-found muted">своя запись — во фреймдате такого приёма целиком нет (это нормально для связок)</span>
                ) : null}
              </div>
            </div>

            <div className="cb-final">
              <div className="cb-final-head">Как будет выглядеть</div>
              {canSave ? (
                <ComboRoute starters={cleanStarters} route={cleanSteps.join(' → ')} noCopy />
              ) : (
                <p className="muted small">Добавь хотя бы один шаг.</p>
              )}
            </div>

            <div className="cb-meta">
              <div className="cb-tags">
                {COMBO_TAGS.map((t) => (
                  <button
                    key={t}
                    className={`cb-tag${tags.includes(t) ? ' on' : ''}`}
                    onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <textarea className="input cb-note" rows={2} placeholder="Заметка: урон, где работает, на что обратить внимание…" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {/* ---- правая колонка: палитра и поиск ---- */}
          <aside className="cb-side">
            <div className="cb-group">
              <div className="cb-group-head">
                <span>Направления</span>
                <label className="cb-hold" title="Удерживать направление или кнопку">
                  <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} /> зажать
                </label>
              </div>
              <div className="cb-dirs">
                {DIR_GRID.map((d) => (
                  <button key={d} className="cb-key" onClick={() => setValue(addDir(value, d, hold))} title={d}>
                    <DirIcon d={d} hold={hold && d !== 'n'} size={30} />
                  </button>
                ))}
              </div>
            </div>

            <div className="cb-group">
              <div className="cb-group-head">
                <span>Кнопки</span>
              </div>
              <div className="cb-btns">
                {BTN_SINGLE.map((b) => (
                  <button key={b.join()} className="cb-key" onClick={() => setValue(addBtn(value, b, hold))} title={b.join('+')}>
                    <BtnIcon b={b} hold={hold} size={30} />
                  </button>
                ))}
              </div>
              <div className="cb-btns cb-btns-combo">
                {BTN_COMBO.map((b) => (
                  <button key={b.join()} className="cb-key" onClick={() => setValue(addBtn(value, b, hold))} title={b.join('+')}>
                    <BtnIcon b={b} hold={hold} size={26} />
                    <span className="cb-key-cap">{b.join('+')}</span>
                  </button>
                ))}
              </div>
              <div className="cb-row">
                <button className="cb-chip" onClick={() => setValue(value.trimEnd() + ',')} title="Следующее нажатие по очереди">
                  , затем
                </button>
                <button className="cb-chip" onClick={() => setValue(value.trimEnd() + '~')} title="Сразу же, без паузы">
                  ~ сразу
                </button>
              </div>
            </div>

            <div className="cb-group">
              <div className="cb-group-head">
                <span>Стойки</span>
              </div>
              <div className="cb-row">
                {allStances.map((s) => (
                  <button key={s} className="cb-chip stance-chip" onClick={() => setValue(addStance(value, s))}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="cb-group">
              <div className="cb-group-head">
                <span>Метки</span>
              </div>
              <div className="cb-row">
                {MARKS.map((m) => (
                  <button key={m.v} className="cb-chip" title={m.title} onClick={() => setValue(addMark(value, m.v))}>
                    <Notation cmd={m.v} size="sm" plain />
                  </button>
                ))}
              </div>
            </div>

            <div className="cb-group cb-search">
              <div className="cb-group-head">
                <span>Найти приём</span>
              </div>
              <MovePicker moves={moves} onPick={(m) => setValue(m.command)} />
            </div>
          </aside>
        </div>

        <footer className="cb-foot">
          <span className="muted small">Комбо сохраняется у тебя на компьютере и не пропадает при обновлениях.</span>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!canSave} onClick={save}>
            Сохранить
          </button>
        </footer>
      </div>
    </div>
  );
}

function Lane({
  label,
  hint,
  items,
  lane,
  sel,
  onSelect,
  onAdd,
  onRemove,
  sepLabel,
}: {
  label: string;
  hint: string;
  items: string[];
  lane: Lane;
  sel: Sel;
  onSelect: (s: Sel) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  sepLabel?: string;
}) {
  return (
    <div className="cb-lane">
      <div className="cb-lane-label" title={hint}>
        {label}
      </div>
      <div className="cb-lane-items">
        {items.map((v, i) => {
          const on = sel.lane === lane && sel.i === i;
          return (
            <span key={i} className="cb-seg">
              {i > 0 && (sepLabel ? <span className="combo-or">{sepLabel}</span> : <span className="cb-arrow">›</span>)}
              <span className={`cb-pill${on ? ' on' : ''}${lane === 'starter' ? ' starter' : ''}${v.trim() ? '' : ' empty'}`} onClick={() => onSelect({ lane, i })}>
                {v.trim() ? <Notation cmd={v} size="sm" plain /> : <span className="cb-pill-empty">пусто</span>}
                {items.length > 1 && (
                  <button
                    className="cb-pill-x"
                    title="Убрать"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(i);
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            </span>
          );
        })}
        <button className="cb-add" onClick={onAdd} title={lane === 'starter' ? 'Ещё вариант старта' : 'Добавить шаг (Enter)'}>
          ＋
        </button>
      </div>
    </div>
  );
}
