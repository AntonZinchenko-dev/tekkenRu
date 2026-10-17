import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CharContext } from '../context';
import { BtnIcon, DirIcon, StepArrow } from '../notation/Notation';
import type { Dir } from '../notation/tokenize';
import { type Beat, comboBeats, splitRoute } from './beats';
import { type Bindings, DEFAULT_BINDINGS, InputSource, type InputEvent, loadBindings, saveBindings } from './input';
import { primeAudio, setVolume, sfx } from './sound';

type Mode = 'free' | 'metro' | 'demo';
type Status = 'todo' | 'ok' | 'perfect' | 'early' | 'late' | 'miss';

const CHORD_MS = 45; // окно, в которое нажатия считаются одновременными (≈3 кадра)
const PERFECT_MS = 60;
const OK_MS = 130;

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

type RunResult = { total: number; gaps: number[]; misses: number; clean: boolean };

export function Trainer({ starters, route, onClose }: { starters: string[]; route: string; onClose: () => void }) {
  const ctx = useContext(CharContext);
  const playableStarters = useMemo(() => starters.filter((s) => comboBeats(s, '', ctx.stances).length > 0), [starters, ctx.stances]);
  const [starter, setStarter] = useState<string | undefined>(playableStarters[0]);
  const beats = useMemo(() => comboBeats(starter, route, ctx.stances), [starter, route, ctx.stances]);
  const steps = useMemo(() => [...(starter ? [starter] : []), ...splitRoute(route)], [starter, route]);
  const comboKey = `trainer:${starter ?? ''}>${route}`;

  const [mode, setMode] = useState<Mode>((ls.get('trainerMode') as Mode) || 'free');
  const [interval, setIntervalMs] = useState(Number(ls.get('trainerInterval')) || 320);
  const [stepFactor, setStepFactor] = useState(Number(ls.get('trainerStepFactor')) || 1.5);
  const [resetOnMiss, setResetOnMiss] = useState(ls.get('trainerReset') !== '0');
  const [vol, setVol] = useState(Number(ls.get('trainerVolume') ?? 0.5));
  const [bindings, setBindings] = useState<Bindings>(loadBindings);
  const [showControls, setShowControls] = useState(false);

  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<Status[]>(() => beats.map(() => 'todo'));
  const [offsets, setOffsets] = useState<(number | null)[]>([]);
  const [liveDir, setLiveDir] = useState<Dir>('n');
  const [liveBtns, setLiveBtns] = useState<number[]>([]);
  const [running, setRunning] = useState(false); // для метронома и показа
  const [cursor, setCursor] = useState(-1); // где сейчас «должен» быть игрок по метроному
  const [stats, setStats] = useState({ attempts: 0, clean: 0, misses: 0 });
  const [last, setLast] = useState<RunResult | null>(null);
  const [ref, setRef] = useState<number[] | null>(() => {
    try {
      return JSON.parse(ls.get(comboKey) ?? 'null');
    } catch {
      return null;
    }
  });
  const [padName, setPadName] = useState('');

  // изменяемое состояние для обработчиков ввода (без пересоздания)
  const S = useRef({
    idx: 0,
    times: [] as number[],
    misses: 0,
    status: [] as Status[],
    chord: null as null | { set: Set<number>; t: number; dir: Dir; timer: number },
    schedule: [] as number[],
    timers: [] as number[],
    mode: mode as Mode,
    finished: false,
  });
  const input = useRef<InputSource | null>(null);

  useEffect(() => setVolume(vol), [vol]);
  useEffect(() => {
    ls.set('trainerMode', mode);
    ls.set('trainerInterval', String(interval));
    ls.set('trainerStepFactor', String(stepFactor));
    ls.set('trainerReset', resetOnMiss ? '1' : '0');
    ls.set('trainerVolume', String(vol));
  }, [mode, interval, stepFactor, resetOnMiss, vol]);
  useEffect(() => {
    try {
      setRef(JSON.parse(ls.get(comboKey) ?? 'null'));
    } catch {
      setRef(null);
    }
  }, [comboKey]);

  const clearTimers = () => {
    S.current.timers.forEach((t) => clearTimeout(t));
    S.current.timers = [];
  };

  const reset = useCallback(() => {
    clearTimers();
    const s = S.current;
    if (s.chord) clearTimeout(s.chord.timer);
    s.idx = 0;
    s.times = [];
    s.misses = 0;
    s.chord = null;
    s.finished = false;
    s.schedule = [];
    s.status = beats.map(() => 'todo');
    setIdx(0);
    setStatus([...s.status]);
    setOffsets([]);
    setRunning(false);
    setCursor(-1);
  }, [beats]);

  useEffect(() => {
    reset();
  }, [reset, mode]);
  useEffect(() => {
    S.current.mode = mode;
  }, [mode]);

  // расписание метронома: отсчёт 4 такта, между шагами комбо пауза длиннее
  const buildSchedule = useCallback(
    (start: number) => {
      const out: number[] = [];
      let t = start + 4 * interval;
      beats.forEach((b, i) => {
        if (i > 0) t += b.step !== beats[i - 1].step ? interval * stepFactor : b.immediate ? interval * 0.5 : interval;
        out.push(t);
      });
      return out;
    },
    [beats, interval, stepFactor],
  );

  const finish = useCallback(
    (t: number) => {
      const s = S.current;
      s.finished = true;
      const gaps = s.times.slice(1).map((x, i) => Math.round(x - s.times[i]));
      const clean = s.misses === 0;
      const res: RunResult = { total: Math.round(t - (s.times[0] ?? t)), gaps, misses: s.misses, clean };
      setLast(res);
      setStats((st) => ({ attempts: st.attempts + 1, clean: st.clean + (clean ? 1 : 0), misses: st.misses + s.misses }));
      if (clean) {
        sfx.done();
        if (s.mode === 'free') {
          ls.set(comboKey, JSON.stringify(gaps));
          setRef((prev) => prev ?? gaps);
        }
      }
      setRunning(false);
      const tm = window.setTimeout(() => reset(), clean ? 1400 : 1000);
      s.timers.push(tm);
    },
    [comboKey, reset],
  );

  const success = useCallback(
    (i: number, t: number) => {
      const s = S.current;
      let st: Status = 'ok';
      if (s.mode === 'metro' && s.schedule[i] !== undefined) {
        const dt = t - s.schedule[i];
        st = Math.abs(dt) <= PERFECT_MS ? 'perfect' : Math.abs(dt) <= OK_MS ? 'ok' : dt < 0 ? 'early' : 'late';
        setOffsets((o) => {
          const n = [...o];
          n[i] = Math.round(dt);
          return n;
        });
      }
      s.status[i] = st;
      s.times[i] = t;
      s.idx = i + 1;
      setStatus([...s.status]);
      setIdx(s.idx);
      if (st === 'perfect') sfx.perfect();
      else sfx.hit();
      if (s.idx >= beats.length) finish(t);
    },
    [beats.length, finish],
  );

  const miss = useCallback(() => {
    const s = S.current;
    s.misses++;
    s.status[s.idx] = 'miss';
    setStatus([...s.status]);
    sfx.miss();
    if (s.mode === 'metro') {
      // в метрономе ритм продолжается — переходим к следующему
      s.idx++;
      setIdx(s.idx);
      if (s.idx >= beats.length) finish(performance.now());
      return;
    }
    if (resetOnMiss) {
      setStats((st) => ({ ...st, attempts: st.attempts + 1, misses: st.misses + 1 }));
      const tm = window.setTimeout(() => reset(), 450);
      s.timers.push(tm);
      s.finished = true;
    } else {
      const i = s.idx;
      const tm = window.setTimeout(() => {
        if (S.current.status[i] === 'miss') {
          S.current.status[i] = 'todo';
          setStatus([...S.current.status]);
        }
      }, 350);
      s.timers.push(tm);
    }
  }, [beats.length, finish, reset, resetOnMiss]);

  const evaluateChord = useCallback(() => {
    const s = S.current;
    const ch = s.chord;
    s.chord = null;
    if (!ch || s.finished) return;
    const pressed = [...ch.set].sort();
    const want = beats[s.idx];
    if (!want) return;
    const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
    if (want.buttons) {
      const dirOk = want.dir ? ch.dir === want.dir : true;
      if (same(pressed, want.buttons) && dirOk) return success(s.idx, ch.t);
      return miss();
    }
    // ждали только направление, а нажата кнопка: если это сразу следующий бит — засчитываем оба
    const next = beats[s.idx + 1];
    if (next?.buttons && same(pressed, next.buttons) && (!next.dir || next.dir === ch.dir)) {
      success(s.idx, ch.t - 1);
      if (!S.current.finished) success(s.idx, ch.t);
      return;
    }
    miss();
  }, [beats, miss, success]);

  const onInput = useCallback(
    (e: InputEvent) => {
      const s = S.current;
      if (e.type === 'restart') return reset();
      if (e.type === 'dir') setLiveDir(e.dir);
      if (e.type === 'btn') setLiveBtns([...(input.current?.pressed ?? [])]);
      if (s.mode === 'demo' || s.finished) return;
      if (s.mode === 'metro' && s.schedule.length === 0) return; // метроном ещё не запущен
      const want = beats[s.idx];
      if (!want) return;
      if (e.type === 'dir') {
        if (!want.buttons && want.dir === e.dir && !s.chord) success(s.idx, e.t);
        return;
      }
      if (s.chord) {
        s.chord.set.add(e.button);
        return;
      }
      s.chord = { set: new Set([e.button]), t: e.t, dir: input.current?.currentDir ?? 'n', timer: 0 };
      s.chord.timer = window.setTimeout(evaluateChord, CHORD_MS);
    },
    [beats, evaluateChord, reset, success],
  );

  // ввод живёт всё время, пока открыт тренажёр
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  useEffect(() => {
    primeAudio();
    document.body.dataset.trainer = '1';
    const src = new InputSource(bindings, (e) => onInputRef.current(e));
    input.current = src;
    src.start();
    const releaseTimer = window.setInterval(() => {
      setLiveBtns([...src.pressed]);
      setPadName(src.padName);
    }, 60);
    return () => {
      src.stop();
      clearInterval(releaseTimer);
      clearTimers();
      delete document.body.dataset.trainer;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    input.current?.setBindings(bindings);
    saveBindings(bindings);
  }, [bindings]);

  // Esc — закрыть
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // метроном и показ
  const startTimed = () => {
    reset();
    primeAudio();
    const now = performance.now();
    const sched = buildSchedule(now);
    const s = S.current;
    s.schedule = sched;
    setRunning(true);
    // отсчёт
    for (let k = 0; k < 4; k++) s.timers.push(window.setTimeout(() => sfx.tick(k === 0), k * interval));
    sched.forEach((t, i) => {
      s.timers.push(
        window.setTimeout(() => {
          setCursor(i);
          if (S.current.mode === 'demo') {
            sfx.hit();
            S.current.status[i] = 'ok';
            setStatus([...S.current.status]);
            setIdx(i + 1);
          } else sfx.tick(false);
        }, t - now),
      );
      // в метрономе: если игрок не нажал — промах
      if (mode === 'metro') {
        s.timers.push(
          window.setTimeout(() => {
            const st = S.current;
            if (!st.finished && st.idx === i && st.status[i] === 'todo') miss();
          }, t - now + OK_MS + 120),
        );
      }
    });
    const end = sched[sched.length - 1] - now + 600;
    s.timers.push(
      window.setTimeout(() => {
        if (S.current.mode === 'demo') {
          setRunning(false);
          setCursor(-1);
        }
      }, end),
    );
  };

  const statusClass = (i: number) => {
    const st = status[i];
    if (st !== 'todo') return st;
    if (mode === 'demo') return i === cursor ? 'current' : 'todo';
    return i === idx ? 'current' : 'todo';
  };

  // группируем биты по шагам комбо
  const groups = useMemo(() => {
    const g: { step: number; items: { b: Beat; i: number }[] }[] = [];
    beats.forEach((b, i) => {
      if (!g.length || g[g.length - 1].step !== b.step) g.push({ step: b.step, items: [] });
      g[g.length - 1].items.push({ b, i });
    });
    return g;
  }, [beats]);

  const BIG = 40;

  return (
    <div className="modal-bg trainer-bg" onClick={onClose}>
      <div className="trainer" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Тренировка комбо</h2>
          <button className="icon-btn" onClick={onClose} title="Закрыть (Esc)">
            ✕
          </button>
        </header>

        {playableStarters.length > 1 && (
          <div className="tr-row">
            <span className="muted small">Стартер:</span>
            {playableStarters.map((s) => (
              <button key={s} className={`chip-btn${s === starter ? ' on' : ''}`} onClick={() => setStarter(s)}>
                {s}
              </button>
            ))}
            <button className={`chip-btn${!starter ? ' on' : ''}`} onClick={() => setStarter(undefined)}>
              без стартера
            </button>
          </div>
        )}

        <div className="tr-row">
          {(['free', 'metro', 'demo'] as Mode[]).map((m) => (
            <button key={m} className={`chip-btn${mode === m ? ' on' : ''}`} onClick={() => setMode(m)}>
              {m === 'free' ? 'Свободно' : m === 'metro' ? 'Под метроном' : 'Показать'}
            </button>
          ))}
          {mode !== 'free' && (
            <>
              <label className="tr-slider">
                <span>Темп: {interval} мс</span>
                <input type="range" min={120} max={800} step={10} value={interval} onChange={(e) => setIntervalMs(Number(e.target.value))} />
              </label>
              <label className="tr-slider" title="Во сколько раз пауза между частями комбо длиннее">
                <span>Пауза между частями: ×{stepFactor}</span>
                <input type="range" min={1} max={3} step={0.25} value={stepFactor} onChange={(e) => setStepFactor(Number(e.target.value))} />
              </label>
              <button className="btn primary" onClick={startTimed} disabled={running}>
                {running ? 'Идёт…' : '▶ Старт'}
              </button>
            </>
          )}
          {mode === 'free' && (
            <label className="check small">
              <input type="checkbox" checked={resetOnMiss} onChange={(e) => setResetOnMiss(e.target.checked)} /> сначала при ошибке
            </label>
          )}
          <label className="tr-slider vol">
            <span>Звук</span>
            <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => setVol(Number(e.target.value))} />
          </label>
        </div>

        <div className="tr-track">
          {groups.map((g, gi) => (
            <Fragment key={g.step}>
              {gi > 0 && <StepArrow />}
              <div className="tr-step" title={steps[g.step]}>
                {g.items.map(({ b, i }) => (
                  <div key={i} className={`tr-beat ${statusClass(i)}`}>
                    <div className="tr-pre">
                      {b.pre.map((p) => (
                        <span key={p} className={p === 'CH' ? 'tag tag-ch' : 'stance'}>
                          {p}
                        </span>
                      ))}
                      {b.justFrame && <span className="tag tag-hold" title="Джаст-фрейм: точный тайминг">JF</span>}
                      {b.immediate && <span className="tag tag-hold" title="Сразу же">~</span>}
                    </div>
                    <div className="tr-icons">
                      {b.dir && <DirIcon d={b.dir} hold={b.hold && !b.buttons} size={BIG} />}
                      {b.buttons && <BtnIcon b={b.buttons} hold={b.hold} size={BIG} digits={ctx.btnDigits} />}
                    </div>
                    <div className="tr-post">
                      {b.post.map((p) => (
                        <span key={p} className="tag tag-tornado">
                          {p}
                        </span>
                      ))}
                      {mode === 'metro' && offsets[i] != null && (
                        <span className="tr-off">
                          {offsets[i]! > 0 ? '+' : ''}
                          {offsets[i]} мс
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Fragment>
          ))}
          {beats.length === 0 && <div className="muted">В этом комбо нет нажатий, которые можно тренировать.</div>}
        </div>

        <div className="tr-bottom">
          <div className="tr-live" title="Что ты сейчас жмёшь">
            <span className="muted small">Ввод</span>
            <DirIcon d={liveDir} size={44} />
            <BtnIcon b={liveBtns} size={44} />
          </div>
          <div className="tr-stats">
            <div>
              Попыток: <b>{stats.attempts}</b> · чистых: <b className="ok">{stats.clean}</b> · ошибок: <b className="bad">{stats.misses}</b>
            </div>
            {last && (
              <div className="small">
                Последняя: {last.clean ? <span className="ok">чисто</span> : <span className="bad">с ошибками ({last.misses})</span>}, {last.total} мс
              </div>
            )}
            {last && last.gaps.length > 0 && <Gaps gaps={last.gaps} reference={ref} />}
          </div>
        </div>

        <footer className="tr-help">
          <span>
            Клавиатура: <b>WASD</b>/стрелки — направления, <b>U I J K</b> (или <b>1 2 3 4</b>) — кнопки 1 2 3 4, <b>Пробел</b> — заново. Геймпад: крестовина или стик,
            X Y A B (□ △ ✕ ○) = 1 2 3 4, Start — заново.{' '}
            {padName ? <span className="ok">Геймпад подключён.</span> : <span className="muted">Геймпад не найден — нажми любую кнопку на нём.</span>}
          </span>
          <button className="btn" onClick={() => setShowControls((v) => !v)}>
            Управление
          </button>
        </footer>
        <p className="muted small tr-note">
          Точных таймингов в записи комбо нет, поэтому тренажёр проверяет порядок нажатий и твой ритм. «Под метроном» — темп задаёшь сам, «Показать» — проигрывает
          комбо со щелчками. После чистого прохода в режиме «Свободно» его ритм запоминается как эталон.
        </p>
        {showControls && <Controls bindings={bindings} onChange={setBindings} />}
      </div>
    </div>
  );
}

function Gaps({ gaps, reference }: { gaps: number[]; reference: number[] | null }) {
  const max = Math.max(...gaps, ...(reference ?? []), 1);
  return (
    <div className="tr-gaps" title="Паузы между нажатиями (мс). Тонкая черта — твой эталон">
      {gaps.map((g, i) => (
        <div key={i} className="tr-gap">
          <div className="tr-gap-bar" style={{ height: `${(g / max) * 100}%` }} />
          {reference?.[i] != null && <div className="tr-gap-ref" style={{ bottom: `${(reference[i] / max) * 100}%` }} />}
          <span>{g}</span>
        </div>
      ))}
    </div>
  );
}

const ROLE_RU: Record<keyof Bindings['keys'], string> = {
  up: 'Вверх',
  down: 'Вниз',
  left: 'Влево',
  right: 'Вправо',
  b1: 'Кнопка 1',
  b2: 'Кнопка 2',
  b3: 'Кнопка 3',
  b4: 'Кнопка 4',
  restart: 'Заново',
};

function Controls({ bindings, onChange }: { bindings: Bindings; onChange: (b: Bindings) => void }) {
  const [wait, setWait] = useState<null | { kind: 'key' | 'pad'; role: string }>(null);

  useEffect(() => {
    if (!wait) return;
    if (wait.kind === 'key') {
      const h = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.code !== 'Escape') onChange({ ...bindings, keys: { ...bindings.keys, [wait.role]: [e.code] } });
        setWait(null);
      };
      window.addEventListener('keydown', h, true);
      return () => window.removeEventListener('keydown', h, true);
    }
    const before = (navigator.getGamepads?.() ?? []).find((p) => p)?.buttons.map((b) => b.pressed) ?? [];
    const t = window.setInterval(() => {
      const pad = (navigator.getGamepads?.() ?? []).find((p) => p);
      if (!pad) return;
      const i = pad.buttons.findIndex((b, k) => b.pressed && !before[k]);
      if (i >= 0) {
        onChange({ ...bindings, pad: { ...bindings.pad, [wait.role]: [i] } });
        setWait(null);
      }
    }, 16);
    return () => clearInterval(t);
  }, [wait, bindings, onChange]);

  return (
    <div className="tr-controls">
      <label className="check">
        <input type="checkbox" checked={bindings.mirrored} onChange={(e) => onChange({ ...bindings, mirrored: e.target.checked })} /> Я справа (P2): «вперёд» = влево
      </label>
      <div className="tr-binds">
        {(Object.keys(ROLE_RU) as (keyof Bindings['keys'])[]).map((role) => (
          <div key={role} className="tr-bind">
            <span>{ROLE_RU[role]}</span>
            <button className="chip-btn" onClick={() => setWait({ kind: 'key', role })}>
              {wait?.kind === 'key' && wait.role === role ? 'нажми клавишу…' : bindings.keys[role].map((c) => c.replace(/^Key|^Digit/, '')).join(', ')}
            </button>
            {role.startsWith('b') && (
              <button className="chip-btn" onClick={() => setWait({ kind: 'pad', role })}>
                {wait?.kind === 'pad' && wait.role === role ? 'нажми на геймпаде…' : `геймпад #${bindings.pad[role as 'b1'].join(',')}`}
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="btn" onClick={() => onChange(structuredClone(DEFAULT_BINDINGS))}>
        Сбросить по умолчанию
      </button>
    </div>
  );
}
