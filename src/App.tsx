import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppMeta, AppRelease, BaseUpdateResult, CharacterData, CharacterInfo, JobState, Move, Section, Settings, SourceKind, TabId, VisionSource } from '../shared/types';
import { APP_AUTHOR, APP_YEAR, MODELS, TAB_TITLES } from '../shared/types';
import { api } from './api';
import { CharContext, buildMoveIndex, type CharCtx } from './context';
import { Empty, FrameCard, RichText, SectionCard } from './components/Content';
import { FramesView } from './views/FramesView';
import { VersusView, type VisionStatus } from './versus/VersusView';
import { getThumbMode, setThumbMode, type ThumbMode } from './components/MoveVideo';
import { startVision, type VisionDebug, type VisionHandle } from './vision/vision';
import { Legend } from './views/Legend';
import { FlowsView } from './views/FlowsView';
import { MyCombos } from './combo/MyCombos';
import { ViewMenu } from './components/ViewMenu';

type Tab = TabId | 'flows' | 'frames' | 'legend';
const TABS: Tab[] = ['overview', 'combos', 'moves', 'tactics', 'flows', 'counter', 'cheatsheet', 'frames', 'legend'];
const tabTitle = (t: Tab) => (t === 'legend' ? 'Нотация' : t === 'flows' ? 'Цепочки' : TAB_TITLES[t]);

/** Фокус в поле ввода — горячие клавиши не перехватываем (иначе буквы в описании переключают экраны) */
const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

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

export function App() {
  const [chars, setChars] = useState<CharacterInfo[]>([]);
  const [current, setCurrent] = useState<string | null>(ls.get('char'));
  const [data, setData] = useState<CharacterData | null>(null);
  const [tab, setTab] = useState<Tab>((ls.get('tab') as Tab) || 'overview');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [notice, setNotice] = useState<{ text: string; url?: string } | null>(null);
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [compact, setCompact] = useState(ls.get('compact') === '1');
  const [filter, setFilter] = useState('');
  const [hover, setHover] = useState<{ move: Move; rect: DOMRect } | null>(null);
  const [btnDigits, setBtnDigits] = useState(ls.get('btnDigits') === '1');
  useEffect(() => ls.set('btnDigits', btnDigits ? '1' : '0'), [btnDigits]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'char' | 'versus'>(ls.get('mode') === 'versus' ? 'versus' : 'char');
  const [vsMe, setVsMe] = useState<string | null>(ls.get('vsMe'));
  const [vsOpp, setVsOpp] = useState<string | null>(ls.get('vsOpp'));
  const [vision, setVision] = useState<VisionStatus>({ on: false, text: 'Автоопределение выключено. Включи переключатель сверху — соперник будет подставляться сам.' });
  const [visionDebug, setVisionDebug] = useState<VisionDebug | null>(null);
  useEffect(() => ls.set('mode', mode), [mode]);
  useEffect(() => ls.set('vsMe', vsMe ?? ''), [vsMe]);
  useEffect(() => ls.set('vsOpp', vsOpp ?? ''), [vsOpp]);

  const reloadChars = useCallback(() => api.getCharacters().then(setChars), []);

  useEffect(() => {
    reloadChars();
    api.getSettings().then(setSettings);
    api.getMeta?.().then(setMeta).catch(() => setMeta(null));
    // новая версия программы в Releases на GitHub
    api
      .checkAppRelease?.()
      .then((r) => {
        setRelease(r);
        if (r.newer) setNotice({ text: `Вышла новая версия программы ${r.latest} — нажми, чтобы скачать`, url: r.url });
      })
      .catch(() => {});
    api.getJob().then(setJob);
    const off1 = api.onJob((s) => {
      setJob(s);
      if (!s.running || s.done <= 1) reloadChars();
    });
    return off1;
  }, [reloadChars]);

  // база обновилась с GitHub — перечитываем список и версию игры, показываем уведомление
  useEffect(() => {
    const off = api.onBaseUpdated?.((r: BaseUpdateResult) => {
      reloadChars();
      api.getMeta().then(setMeta).catch(() => {});
      setNotice({ text: `База обновлена с GitHub: ${filesWord(r.updated.length)}` });
    });
    return () => off?.();
  }, [reloadChars]);
  useEffect(() => {
    if (!notice || notice.url) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!current && chars.length) setCurrent(chars[0].id);
  }, [chars, current]);

  useEffect(() => {
    if (!vsMe && settings?.myMain) setVsMe(settings.myMain);
  }, [settings?.myMain, vsMe]);

  // автоопределение соперника по экрану игры
  const charsRef = useRef(chars);
  charsRef.current = chars;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const vsMeRef = useRef(vsMe);
  vsMeRef.current = vsMe;
  const visionRef = useRef<VisionHandle | null>(null);
  const showSettingsRef = useRef(false);
  showSettingsRef.current = showSettings;
  const forcePending = useRef(false);
  useEffect(() => {
    if (!settings?.visionEnabled || !window.tekken) {
      setVision({ on: false, text: 'Автоопределение выключено. Включи переключатель сверху — соперник будет подставляться сам.' });
      return;
    }
    setVision({ on: true, text: 'Запускаю автоопределение…' });
    const handle = startVision({
      sourcePref: settings.visionSource,
      chars: () => charsRef.current,
      myMain: () => settingsRef.current?.myMain ?? '',
      myNick: () => settingsRef.current?.myNick ?? '',
      onStatus: (text, ok) => {
        console.debug('[vision]', text);
        setVision({ on: true, text, ok });
      },
      onDebug: setVisionDebug,
      wantDebug: () => showSettingsRef.current,
      onDetect: (d) => {
        console.debug('[vision] detect', JSON.stringify(d));
        if (!d.left || !d.right) return;
        let me: string;
        let opp: string;
        if (d.meSide === 'left') [me, opp] = [d.left, d.right];
        else if (d.meSide === 'right') [me, opp] = [d.right, d.left];
        else if (vsMeRef.current === d.right) [me, opp] = [d.right, d.left];
        else [me, opp] = [d.left, d.right];
        setVsMe(me);
        setVsOpp(opp);
        if (d.forced || (settingsRef.current?.autoSwitch ?? true)) setMode('versus');
      },
    });
    visionRef.current = handle;
    if (forcePending.current) {
      forcePending.current = false;
      handle.force();
    }
    return () => {
      handle.stop();
      if (visionRef.current === handle) visionRef.current = null;
    };
  }, [settings?.visionEnabled, settings?.visionSource]);

  // Num − (работает и когда активна игра): проверить соперника заново прямо сейчас
  useEffect(() => {
    const force = () => {
      if (visionRef.current) visionRef.current.force();
      else {
        // автоопределение выключено — включаем и сразу проверяем
        forcePending.current = true;
        void saveSettingsRef.current?.({ visionEnabled: true });
      }
    };
    const off = api.onVisionForce?.(force);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'NumpadSubtract' && !isTyping(e.target)) force();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off?.();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    ls.set('char', current);
    let alive = true;
    api.getCharacter(current).then((d) => alive && setData(d));
    const off = api.onCharacterUpdated((id) => {
      if (id === current) api.getCharacter(current).then((d) => alive && setData(d));
    });
    return () => {
      alive = false;
      off();
    };
  }, [current]);

  useEffect(() => ls.set('tab', tab), [tab]);
  useEffect(() => ls.set('compact', compact ? '1' : '0'), [compact]);

  const saveSettings = useCallback(async (p: Partial<Settings> & { apiKey?: string }) => setSettings(await api.saveSettings(p)), []);
  const saveSettingsRef = useRef(saveSettings);
  saveSettingsRef.current = saveSettings;

  // горячие клавиши
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTyping(e.target);
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCompact(false);
        setTimeout(() => searchRef.current?.focus(), 0);
      } else if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        if (settings) saveSettings({ zoom: +(settings.zoom + 0.1).toFixed(2) });
      } else if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        if (settings) saveSettings({ zoom: +(settings.zoom - 0.1).toFixed(2) });
      } else if (e.ctrlKey && e.key === '0') {
        saveSettings({ zoom: 1 });
      } else if (!typing && !e.ctrlKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        setMode('char');
        setTab(TABS[Number(e.key) - 1]);
      } else if (!typing && e.key.toLowerCase() === 'b' && !e.ctrlKey) {
        setCompact((c) => !c);
      } else if (!typing && (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'м') && !e.ctrlKey) {
        setMode((m) => (m === 'versus' ? 'char' : 'versus'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settings, saveSettings]);

  const ctx: CharCtx = useMemo(() => {
    const findMove = buildMoveIndex(data?.frames?.moves ?? []);
    const stanceInfo = data?.guide?.stances ?? [];
    const stances = [...(data?.frames?.stances ?? []), ...stanceInfo.map((s) => s.abbr.replace(/\./g, ''))];
    return {
      charId: data?.id,
      stances,
      stanceInfo,
      findMove,
      showFrames: (m, rect) => setHover(m && rect ? { move: m, rect } : null),
      btnDigits,
    };
  }, [data, btnDigits]);

  const info = chars.find((c) => c.id === current);
  const visibleChars = chars.filter((c) => c.displayName.toLowerCase().includes(filter.toLowerCase()));
  const empty = chars.length === 0;

  return (
    <CharContext.Provider value={ctx}>
      <div className={`app${compact ? ' compact' : ''}${mode === 'versus' ? ' mode-vs' : ''}`}>
        {!compact && (
          <aside className="side">
            <div className="brand">
              <img className="brand-mark" src="brand.webp" alt="" draggable={false} />
              <span>
                Tekken<b>RU</b>
              </span>
            </div>
            <input
              ref={searchRef}
              className="input side-search"
              placeholder="Персонаж…  Ctrl+K"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && visibleChars[0]) {
                  setCurrent(visibleChars[0].id);
                  setFilter('');
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <nav className="char-list">
              {visibleChars.map((c) => (
                <button
                  key={c.id}
                  className={`char${(mode === 'versus' ? c.id === vsOpp : c.id === current) ? ' on' : ''}`}
                  title={mode === 'versus' ? 'Выбрать соперником' : undefined}
                  onClick={() => (mode === 'versus' ? setVsOpp(c.id) : setCurrent(c.id))}
                >
                  <Avatar id={c.id} remote={c.avatar} />
                  <span>{c.displayName}</span>
                  {mode === 'versus' && c.id === vsMe && <span className="char-me">ты</span>}
                </button>
              ))}
            </nav>
            {meta?.gameVersion && (
              <div className="game-ver" title={`Данные актуальны для Tekken 8 ${meta.gameVersion}${meta.dataUpdated ? `, обновлены ${meta.dataUpdated}` : ''}. Поменять — в ⚙.`}>
                Tekken 8 · <b>{meta.gameVersion}</b>
              </div>
            )}
            <div className="copyright" title={`TekkenRU © ${APP_YEAR} ${APP_AUTHOR}`}>
              © {APP_YEAR} {APP_AUTHOR}
            </div>
          </aside>
        )}

        <main className="main">
          <header className="top">
            <div className="who">
              {compact && chars.length > 0 && (
                <select className="input char-select" value={current ?? ''} onChange={(e) => setCurrent(e.target.value)}>
                  {chars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              )}
              {mode === 'versus' ? (
                <h1 className="vs-h1">Матчап</h1>
              ) : (
                !compact &&
                info && (
                  <>
                    <Avatar key={info.id} id={info.id} remote={info.avatar} className="who-avatar" />
                    <h1>{info.displayName}</h1>
                  </>
                )
              )}
            </div>
            <div className="top-actions">
              {!empty && (
                <div className="seg mode-seg" role="tablist" title="Переключить экран (V)">
                  <button role="tab" aria-selected={mode === 'char'} className={mode === 'char' ? 'on' : ''} onClick={() => setMode('char')}>
                    Персонаж
                  </button>
                  <button role="tab" aria-selected={mode === 'versus'} className={mode === 'versus' ? 'on vs' : ''} onClick={() => setMode('versus')}>
                    ⚔ Матчап
                  </button>
                </div>
              )}
              {mode === 'versus' && settings && window.tekken && (
                <button
                  className={`auto-toggle${settings.visionEnabled ? ' on' : ''}${vision.ok ? ' ok' : ''}`}
                  role="switch"
                  aria-checked={settings.visionEnabled}
                  title={settings.visionEnabled ? `${vision.text}\nНажми, чтобы выключить` : 'Программа сама узнаёт соперника по экрану игры (проверяет раз в секунду)'}
                  onClick={() => saveSettings({ visionEnabled: !settings.visionEnabled })}
                >
                  <span className={`switch${settings.visionEnabled ? ' on' : ''}`} />
                  Автоопределение
                </button>
              )}
              <span className="top-sep" />
              {compact && meta?.gameVersion && (
                <span className="game-ver-badge" title="Версия игры, для которой актуальны данные. Поменять — в ⚙.">
                  T8 {meta.gameVersion}
                </span>
              )}
              <ViewMenu
                compact={compact}
                onToggleCompact={() => setCompact((c) => !c)}
                onTop={Boolean(settings?.alwaysOnTop)}
                onToggleTop={() => settings && saveSettings({ alwaysOnTop: !settings.alwaysOnTop })}
                btnDigits={btnDigits}
                setBtnDigits={setBtnDigits}
                zoom={settings?.zoom ?? 1}
                setZoom={(zoom) => settings && saveSettings({ zoom })}
              />
              <button className="btn small" title="Настройки и обновление базы" onClick={() => setShowSettings(true)}>
                ⚙ Настройки
              </button>
            </div>
          </header>

          {!empty && mode === 'char' && (
            <nav className="tabs">
              {TABS.map((t, i) => (
                <button key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)} title={`Клавиша ${i + 1}`}>
                  {tabTitle(t)}
                  <TabCount data={data} tab={t} />
                </button>
              ))}
            </nav>
          )}

          <div className="content">
            {empty ? (
              <Welcome settings={settings} job={job} onSave={saveSettings} />
            ) : mode === 'versus' ? (
              <VersusView
                chars={chars}
                meId={vsMe}
                oppId={vsOpp}
                setMe={(id) => {
                  setVsMe(id);
                  void saveSettings({ myMain: id });
                }}
                setOpp={setVsOpp}
                onSwap={() => {
                  setVsMe(vsOpp);
                  setVsOpp(vsMe);
                }}
                vision={vision}
                showFrames={ctx.showFrames}
                btnDigits={btnDigits}
                avatar={(id, cls) => <Avatar key={id} id={id} remote={chars.find((c) => c.id === id)?.avatar ?? ''} className={cls} />}
              />
            ) : (
              <TabContent tab={tab} data={data} info={info} />
            )}
          </div>
        </main>

        {hover && <HoverCard move={hover.move} rect={hover.rect} />}
        {showSettings && settings && (
          <SettingsDialog
            settings={settings}
            job={job}
            current={info}
            chars={chars}
            vision={vision}
            visionDebug={visionDebug}
            onSave={saveSettings}
            meta={meta}
            release={release}
            onSaveMeta={async (patch) => setMeta(await api.saveMeta(patch))}
            onClose={() => setShowSettings(false)}
          />
        )}
        {job && (job.running || job.log.length > 0) && <JobBar job={job} />}
        {notice && (
          <div className="toast" role="status">
            {notice.url ? (
              <a href={notice.url} target="_blank" rel="noreferrer" onClick={() => setNotice(null)}>
                {notice.text}
              </a>
            ) : (
              <span>{notice.text}</span>
            )}
            <button className="toast-x" onClick={() => setNotice(null)} title="Закрыть">
              ×
            </button>
          </div>
        )}
      </div>
    </CharContext.Provider>
  );
}

/** Аватар: сначала из комплекта программы (работает офлайн), если нет — с сайта */
function Avatar({ id, remote, className }: { id: string; remote: string; className?: string }) {
  const [src, setSrc] = useState(`avatars/${id}.webp`);
  const [hidden, setHidden] = useState(false);
  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      style={hidden ? { visibility: 'hidden' } : undefined}
      onError={() => (src !== remote && remote ? setSrc(remote) : setHidden(true))}
    />
  );
}

const ORDER: SourceKind[] = ['guide', 'antistrat', 'meta'];

function sectionsFor(data: CharacterData | null, tab: TabId): { s: Section; src: SourceKind }[] {
  if (!data) return [];
  const out: { s: Section; src: SourceKind }[] = [];
  for (const src of ORDER) for (const s of data[src]?.sections ?? []) if (s.tab === tab) out.push({ s, src });
  return out;
}

function TabCount({ data, tab }: { data: CharacterData | null; tab: Tab }) {
  if (tab === 'legend') return null;
  const n = tab === 'frames' ? data?.frames?.moves.length ?? 0 : tab === 'flows' ? data?.flows?.flows.length ?? 0 : sectionsFor(data, tab).length;
  if (!n) return null;
  return <span className="tab-n">{n}</span>;
}

function TabContent({ tab, data, info }: { tab: Tab; data: CharacterData | null; info?: CharacterInfo }) {
  if (tab === 'legend') return <Legend />;
  if (!data) return <Empty>Загрузка…</Empty>;
  if (tab === 'frames') return <FramesView frames={data.frames} charId={data.id} />;
  if (tab === 'flows') return <FlowsView set={data.flows} />;

  const list = sectionsFor(data, tab);
  const guide = data.guide;
  const guideBlock = list.length === 0 ? (
        <Empty>
          {tab === 'cheatsheet' && data.errors?.meta ? `Шпаргалка: ${data.errors.meta}` : null}
          {tab === 'counter' && data.errors?.antistrat ? `Анти-страты: ${data.errors.antistrat}` : null}
          {!guide && !data.meta && !data.antistrat
            ? 'Переводы для этого персонажа ещё не скачаны. Открой ⚙ → «Обновить этого персонажа».'
            : 'В этом разделе пока пусто.'}
        </Empty>
      ) : (
        <div className="grid">
          {list.map(({ s, src }, i) => (
            <SectionCard key={src + i} section={s} source={src} />
          ))}
        </div>
      );
  return (
    <div className="tab-body">
      {tab === 'overview' && guide?.summary && (
        <div className="summary">
          <RichText text={guide.summary} />
        </div>
      )}
      {tab === 'overview' && guide?.stances && guide.stances.length > 0 && (
        <section className="card card-wide">
          <header className="card-head">
            <h3>Стойки</h3>
          </header>
          <div className="card-body stance-list">
            {guide.stances.map((s) => (
              <div key={s.abbr} className="stance-row">
                <span className="stance">
                  {s.abbr.toUpperCase()}
                </span>
                <b>{s.name}</b>
                <span className="muted">
                  <RichText text={s.ru} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {tab === 'combos' ? (
        <MyCombos data={data} charName={info?.displayName ?? data.id}>
          {guideBlock}
        </MyCombos>
      ) : (
        guideBlock
      )}
      <Credits data={data} info={info} />
    </div>
  );
}

function Credits({ data, info }: { data: CharacterData; info?: CharacterInfo }) {
  const g = data.guide;
  return (
    <footer className="credits">
      Источник:{' '}
      {g && !g.url.includes('tekkendocs.com') ? (
        <>
          гайд — <a href={g.url}>{new URL(g.url).hostname}</a> (CC BY-SA), фреймдата — <a href={`https://tekkendocs.com/t8/${data.id}`}>tekkendocs.com</a>
        </>
      ) : (
        <>
          <a href={g?.url ?? `https://tekkendocs.com/t8/${data.id}`}>tekkendocs.com</a> и rbnorway.org
        </>
      )}
      {g?.author && <> · автор гайда: {g.author}</>}
      {g?.sourceLang === 'ru' && <> · за основу взят официальный русский перевод</>}
      {g && <> · русская версия от {new Date(g.translatedAt).toLocaleDateString('ru-RU')}</>}
      {info && <> · {info.displayName}</>}
    </footer>
  );
}

function HoverCard({ move, rect }: { move: Move; rect: DOMRect }) {
  const w = 340;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - w - 8);
  const below = rect.bottom + 8;
  const style = below + 260 > window.innerHeight ? { left, bottom: window.innerHeight - rect.top + 8 } : { left, top: below };
  return (
    <div className="hover-card" style={{ ...style, width: w }}>
      <FrameCard move={move} />
    </div>
  );
}

function Welcome({ settings, job, onSave }: { settings: Settings | null; job: JobState | null; onSave: (p: Partial<Settings> & { apiKey?: string }) => void }) {
  const [key, setKey] = useState('');
  return (
    <div className="welcome">
      <h2>База пока пустая</h2>
      <p>
        Приложение скачает с tekkendocs.com всех персонажей и все разделы (фреймдата, гайд, шпаргалка, анти-страты), переведёт и сожмёт их на русский через Claude и
        сохранит у тебя на компьютере. Дальше всё работает без интернета.
      </p>
      <ol>
        <li>
          Вставь ключ API для перевода (<a href="https://console.anthropic.com/settings/keys">получить ключ</a>) или положи файл <code>.env</code> со
          строкой <code>TRANSLATE_API_KEY=...</code> рядом с программой.
        </li>
        <li>Нажми «Скачать всё». Первый прогон занимает примерно 20–40 минут (гайды длинные), дальше обновления быстрые.</li>
      </ol>
      {settings?.apiKeySet ? (
        <p className="ok">✔ Ключ найден ({settings.apiKeySource === 'env' ? 'из .env' : 'в настройках'})</p>
      ) : (
        <div className="row">
          <input className="input" type="password" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn" disabled={!key} onClick={() => onSave({ apiKey: key })}>
            Сохранить ключ
          </button>
        </div>
      )}
      <div className="row">
        <button className="btn primary" disabled={job?.running} onClick={() => api.startUpdate({})}>
          {job?.running ? 'Идёт загрузка…' : 'Скачать всё'}
        </button>
        <button className="btn" disabled={job?.running} onClick={() => api.startUpdate({ framesOnly: true })} title="Без ключа: только таблицы фреймов на английском">
          Только фреймдата (без ключа)
        </button>
      </div>
    </div>
  );
}

function SettingsDialog({
  settings,
  job,
  current,
  chars,
  vision,
  visionDebug,
  onSave,
  meta,
  release,
  onSaveMeta,
  onClose,
}: {
  settings: Settings;
  job: JobState | null;
  current?: CharacterInfo;
  chars: CharacterInfo[];
  vision: VisionStatus;
  visionDebug: VisionDebug | null;
  onSave: (p: Partial<Settings> & { apiKey?: string }) => void;
  meta: AppMeta | null;
  release: AppRelease | null;
  onSaveMeta: (p: Partial<AppMeta>) => Promise<void>;
  onClose: () => void;
}) {
  const [key, setKey] = useState('');
  const [sources, setSources] = useState<VisionSource[]>([]);
  const [portable, setPortable] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [nick, setNick] = useState(settings.myNick);
  const [thumbMode, setThumbModeState] = useState<ThumbMode>(getThumbMode());
  const [ver, setVer] = useState(meta?.gameVersion ?? '');
  const [verSaved, setVerSaved] = useState(false);
  const [bu, setBu] = useState<BaseUpdateResult | null>(null);
  const [buBusy, setBuBusy] = useState(false);
  useEffect(() => {
    // старая сборка программы этих функций не знает — тогда просто молчим
    if (window.tekken && typeof api.lastBaseUpdate === 'function') api.lastBaseUpdate().then(setBu).catch(() => {});
  }, []);
  useEffect(() => {
    if (window.tekken) api.visionSources().then(setSources).catch(() => setSources([]));
  }, []);
  const running = Boolean(job?.running);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Настройки</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <h4>Обновление базы</h4>
        <div className="row wrap">
          <button className="btn primary" disabled={running} onClick={() => api.startUpdate({})}>
            Обновить всё
          </button>
          {current && (
            <button className="btn" disabled={running} onClick={() => api.startUpdate({ ids: [current.id] })}>
              Обновить: {current.displayName}
            </button>
          )}
          {current && (
            <button className="btn" disabled={running} onClick={() => api.startUpdate({ ids: [current.id], force: true })} title="Перевести заново, даже если на сайте ничего не поменялось">
              Перевести заново: {current.displayName}
            </button>
          )}
          {running && (
            <button className="btn danger" onClick={() => api.cancelUpdate()}>
              Остановить
            </button>
          )}
        </div>
        <p className="muted small">«Обновить» переводит только то, что изменилось на сайте с прошлого раза — повторный прогон почти бесплатный.</p>

        <h4>Перевод (ключ API)</h4>
        <p className="small">
          Ключ: {settings.apiKeySet ? <span className="ok">задан ({settings.apiKeySource === 'env' ? 'файл .env' : 'сохранён в настройках, зашифрован'})</span> : <span className="bad">не задан</span>}
        </p>
        <div className="row">
          <input className="input" type="password" placeholder="Новый ключ sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn" disabled={!key} onClick={() => (onSave({ apiKey: key }), setKey(''))}>
            Сохранить
          </button>
          {settings.apiKeySource === 'settings' && (
            <button className="btn" onClick={() => onSave({ apiKey: '' })}>
              Удалить
            </button>
          )}
        </div>
        <label className="field">
          <span>Модель</span>
          <select className="input" value={settings.model} onChange={(e) => onSave({ model: e.target.value })}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Параллельных запросов: {settings.concurrency}</span>
          <input type="range" min={1} max={8} value={settings.concurrency} onChange={(e) => onSave({ concurrency: Number(e.target.value) })} />
        </label>

        <h4>Автоопределение соперника</h4>
        <p className="small muted">
          Программа смотрит на окно игры так же, как Discord при показе экрана, и читает имена персонажей на плашках у полосок здоровья. В саму игру не
          лезет и кнопки не нажимает. Как только начинается бой — сама открывает экран «Матчап».
        </p>
        <label className="check">
          <input type="checkbox" checked={settings.visionEnabled} onChange={(e) => onSave({ visionEnabled: e.target.checked })} /> Включить автоопределение
        </label>
        <label className="field">
          <span>Откуда смотреть</span>
          <select className="input" value={settings.visionSource} onChange={(e) => onSave({ visionSource: e.target.value })}>
            <option value="auto">Автоматически (окно TEKKEN 8, иначе монитор без этой программы)</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.kind === 'window' ? `Окно: ${s.name}` : s.name}
                {s.appHere ? ' — тут эта программа' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Мой основной персонаж (по нему понимаю, на какой ты стороне)</span>
          <select className="input" value={settings.myMain} onChange={(e) => onSave({ myMain: e.target.value })}>
            <option value="">не выбран</option>
            {chars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Мой ник в игре (необязательно; помогает понять сторону, если играешь не мейном)</span>
          <div className="row">
            <input className="input" value={nick} placeholder="например, PesPerdoon" onChange={(e) => setNick(e.target.value)} />
            <button className="btn" disabled={nick === settings.myNick} onClick={() => onSave({ myNick: nick })}>
              Сохранить
            </button>
          </div>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.autoSwitch} onChange={(e) => onSave({ autoSwitch: e.target.checked })} /> Сам переключаться на экран «Матчап» в начале
          боя
        </label>
        <p className={`small ${vision.ok ? 'ok' : 'muted'}`}>Статус: {vision.text}</p>
        {visionDebug && (
          <div className="vis-debug">
            {visionDebug.frame && (
              <div className="vis-crop vis-frame">
                <span className="muted small">Что видит программа: {visionDebug.source}</span>
                <img src={visionDebug.frame} alt="" />
              </div>
            )}
            {Object.entries(visionDebug.crops).map(([k, src]) => (
              <div key={k} className="vis-crop">
                <span className="muted small">
                  {k}: <b>{visionDebug.text[k] || '—'}</b>
                </span>
                <img src={src} alt="" />
              </div>
            ))}
          </div>
        )}

        <h4>Вид</h4>
        <label className="field">
          <span>Масштаб: {Math.round(settings.zoom * 100)}%</span>
          <input type="range" min={0.6} max={2} step={0.05} value={settings.zoom} onChange={(e) => onSave({ zoom: Number(e.target.value) })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.alwaysOnTop} onChange={(e) => onSave({ alwaysOnTop: e.target.checked })} /> Поверх всех окон
        </label>
        <label className="field">
          <span>Видео-миниатюры на экране «Матчап»</span>
          <select className="input" value={thumbMode} onChange={(e) => (setThumbMode(e.target.value as ThumbMode), setThumbModeState(e.target.value as ThumbMode))}>
            <option value="all">Крутятся все сразу, всегда</option>
            <option value="queue">По очереди — меньше нагрузка на компьютер</option>
          </select>
        </label>

        <h4>Версия игры</h4>
        <label className="field">
          <span>Для какой версии Tekken 8 актуальны данные (видно в углу программы)</span>
          <div className="row">
            <input className="input" value={ver} placeholder="например, Ver. 3.02.01" onChange={(e) => (setVer(e.target.value), setVerSaved(false))} />
            <button
              className="btn"
              disabled={ver.trim() === (meta?.gameVersion ?? '')}
              onClick={async () => {
                try {
                  await onSaveMeta({ gameVersion: ver.trim() });
                  setVerSaved(true);
                } catch {
                  alert('Не получилось сохранить: программа лежит в папке, куда нельзя записывать. Поправь файл base\\meta.json вручную.');
                }
              }}
            >
              Сохранить
            </button>
          </div>
        </label>
        {verSaved && <p className="small ok">Сохранено в папку base рядом с программой (файл meta.json).</p>}
        {meta?.dataUpdated && <p className="small muted">Базовые данные собраны: {meta.dataUpdated}</p>}

        <h4>О программе</h4>
        <p className="small">
          <b>TekkenRU</b> — русский справочник по Tekken 8. Версия {release?.current ?? '—'}
          {release?.newer ? (
            <>
              {' '}
              · <a href={release.url}>есть новая {release.latest} — скачать</a>
            </>
          ) : release?.latest ? (
            <> · это последняя версия</>
          ) : null}
          .
          <br />© {APP_YEAR} {APP_AUTHOR}. Все права защищены.
        </p>
        <p className="small muted">
          Данные о приёмах и гайды: tekkendocs.com, rbnorway.org и wavu.wiki (CC BY-SA), авторы гайдов указаны на страницах персонажей. Tekken — товарный знак
          Bandai Namco; программа с ними не связана.
        </p>

        <h4>Обновление базы с GitHub</h4>
        <p className="small muted">
          Когда выходит патч, база (персонажи, переводы, цепочки, версия игры) обновляется на GitHub, и программа сама подтягивает изменённые файлы. Твои
          настройки, свои комбо и свои списки соперников не трогаются.
        </p>
        <label className="check">
          <input type="checkbox" checked={settings.autoBaseUpdate} onChange={(e) => onSave({ autoBaseUpdate: e.target.checked })} /> Проверять обновления базы
          при запуске
        </label>
        <div className="row wrap">
          <button
            className="btn"
            disabled={buBusy}
            onClick={async () => {
              setBuBusy(true);
              try {
                setBu(
                  typeof api.checkBaseUpdate === 'function'
                    ? await api.checkBaseUpdate()
                    : { ok: false, checkedAt: new Date().toISOString(), updated: [], error: 'эта сборка программы не умеет обновлять базу — нужна полная пересборка (npm run pack:win)' },
                );
              } catch (e) {
                setBu({ ok: false, checkedAt: new Date().toISOString(), updated: [], error: (e as Error).message });
              } finally {
                setBuBusy(false);
              }
            }}
          >
            {buBusy ? 'Проверяю…' : 'Проверить сейчас'}
          </button>
          {bu && (
            <span className={`small ${bu.ok ? 'ok' : 'bad'}`}>
              {bu.ok
                ? bu.updated.length
                  ? `Обновлено: ${filesWord(bu.updated.length)}`
                  : 'База актуальна'
                : `Не получилось: ${bu.error}`}{' '}
              <span className="muted">({new Date(bu.checkedAt).toLocaleString('ru-RU')})</span>
            </span>
          )}
        </div>

        <h4>Данные</h4>
        <div className="row wrap">
          <button className="btn" onClick={() => api.openDataFolder()}>
            Открыть папку с данными
          </button>
          <button
            className="btn"
            disabled={portable === 'busy'}
            onClick={async () => {
              setPortable('busy');
              try {
                await api.makePortable();
                setPortable('done');
              } catch {
                setPortable('error');
              }
            }}
          >
            {portable === 'busy' ? 'Копирую…' : 'Сделать переносную копию'}
          </button>
        </div>
        {portable === 'done' && (
          <p className="small ok">
            Готово: база лежит рядом с программой. Скопируй папку <b>TekkenRU-win32-x64</b> целиком на другой компьютер и запусти TekkenRU.exe — всё уже
            будет на месте.
          </p>
        )}
        {portable === 'error' && <p className="small bad">Не получилось скопировать. Проверь, что на диске есть место.</p>}
        <p className="muted small">
          Горячие клавиши: <b>Num −</b> узнать соперника заново (работает и из игры), <b>V</b> экран «Матчап», <b>1–9</b> вкладки, <b>B</b> скрыть список персонажей, <b>Ctrl+K</b> поиск персонажа, <b>Ctrl ±</b> масштаб.
        </p>
      </div>
    </div>
  );
}

function JobBar({ job }: { job: JobState }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (job.running) setHidden(false);
  }, [job.running]);
  if (hidden) return null;
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const errors = job.log.filter((l) => l.level === 'error').length;
  return (
    <div className={`job${open ? ' open' : ''}`}>
      <div className="job-row" onClick={() => setOpen((o) => !o)}>
        <div className="job-bar">
          <div className="job-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="job-text">
          {job.running ? `${job.done}/${job.total} · ${job.current.slice(0, 2).join(', ') || 'подготовка…'}` : `Готово: ${job.done}/${job.total}`}
          {errors > 0 && <span className="bad"> · ошибок: {errors}</span>}
          {job.usage.costUsd > 0 && <span className="muted"> · ≈ ${job.usage.costUsd.toFixed(2)}</span>}
        </span>
        {!job.running && (
          <button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              setHidden(true);
            }}
          >
            ✕
          </button>
        )}
      </div>
      {open && (
        <div className="job-log">
          {job.log
            .slice()
            .reverse()
            .map((l, i) => (
              <div key={i} className={`log-${l.level}`}>
                <span className="muted">{l.time}</span> {l.text}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function filesWord(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'файл' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'файла' : 'файлов';
  return `${n} ${w}`;
}
