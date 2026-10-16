import { useEffect, useState } from 'react';
import type { Move } from '../../shared/types';

// Одновременно играет только один ролик: открыли новый — предыдущий закрывается
let closeCurrent: (() => void) | null = null;

export function videoUrl(charId: string, move?: Move) {
  return move?.video ? `tkvideo://v/${charId}/${encodeURIComponent(move.video)}` : null;
}

/** Кнопка «видео» и ролик под ней. Грузится только по нажатию, потом берётся из кэша. */
export function MoveVideo({ charId, move, compact }: { charId: string; move?: Move; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const url = videoUrl(charId, move);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    if (closeCurrent && closeCurrent !== close) closeCurrent();
    closeCurrent = close;
    return () => {
      if (closeCurrent === close) closeCurrent = null;
    };
  }, [open]);

  if (!url) return null;
  return (
    <>
      <button
        className={`vid-btn${open ? ' on' : ''}${compact ? ' compact' : ''}`}
        title={open ? 'Скрыть видео' : 'Показать видео приёма'}
        onClick={(e) => {
          e.stopPropagation();
          setError(false);
          setOpen((o) => !o);
        }}
      >
        {open ? '■' : '▶'}
        {!compact && <span>{open ? 'скрыть' : 'видео'}</span>}
      </button>
      {open && (
        <div className="vid-box" onClick={(e) => e.stopPropagation()}>
          {error ? (
            <div className="vid-err">Видео не загрузилось — нет интернета или ролика нет на сервере.</div>
          ) : (
            <video src={url} autoPlay muted loop playsInline controls={false} onError={() => setError(true)} onClick={(e) => {
              const v = e.currentTarget;
              if (v.paused) void v.play();
              else v.pause();
            }} />
          )}
        </div>
      )}
    </>
  );
}

// ---------- Миниатюры на экране «против» ----------
// Два режима (⚙ → Вид):
//  • «все сразу» (по умолчанию) — все ролики крутятся всегда, наводить мышь не нужно;
//  • «по очереди» — экономный: одна доиграла, включается следующая (сверху вниз). Наведи мышь — ролик крутится, пока мышь на нём.
export type ThumbMode = 'all' | 'queue';
let mode: ThumbMode = (() => {
  try {
    return localStorage.getItem('thumbMode') === 'queue' ? 'queue' : 'all';
  } catch {
    return 'all';
  }
})();
export const getThumbMode = () => mode;
export function setThumbMode(m: ThumbMode) {
  mode = m;
  try {
    localStorage.setItem('thumbMode', m);
  } catch {
    /* не страшно */
  }
  for (const t of thumbs) t.el.loop = m === 'all';
  if (m === 'all') {
    clearTimeout(guard);
    active = null;
    if (!document.hidden) for (const t of thumbs) void t.el.play().catch(() => {});
  } else playThumb(ordered()[0] ?? null);
}

type Thumb = { el: HTMLVideoElement; box: HTMLElement };
const thumbs = new Set<Thumb>();
let active: Thumb | null = null;
let hovered: Thumb | null = null;
let guard = 0;

const ordered = () => [...thumbs].sort((a, b) => a.box.getBoundingClientRect().top - b.box.getBoundingClientRect().top);

function playThumb(t: Thumb | null) {
  clearTimeout(guard);
  for (const x of thumbs) if (x !== t && !x.el.paused) x.el.pause();
  active = t;
  if (!t || document.hidden) return;
  t.el.currentTime = 0;
  void t.el.play().catch(() => {});
  // страховка: если ролик застрял (не догрузился), через 12 секунд переходим к следующему
  guard = window.setTimeout(() => active === t && hovered !== t && playAfter(t), 12000);
}

function playAfter(t: Thumb) {
  const list = ordered();
  if (!list.length) return playThumb(null);
  const i = list.indexOf(t);
  playThumb(list[(i + 1) % list.length]);
}

if (typeof document !== 'undefined') {
  // окно свернули — ничего не крутим; развернули — продолжаем
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) for (const x of thumbs) x.el.pause();
    else if (mode === 'all') for (const x of thumbs) void x.el.play().catch(() => {});
    else if (active) void active.el.play().catch(() => {});
  });
}

/** Миниатюра без звука для экрана «против». Грузится, только когда видна на экране; играет по очереди с соседями. */
export function VideoThumb({ charId, move }: { charId: string; move?: Move }) {
  const url = videoUrl(charId, move);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);
  const [big, setBig] = useState(false);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [el, setEl] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!box) return;
    const io = new IntersectionObserver((e) => setVisible(e.some((x) => x.isIntersecting)), { rootMargin: '200px' });
    io.observe(box);
    return () => io.disconnect();
  }, [box]);

  useEffect(() => {
    if (!el || !box) return;
    const me: Thumb = { el, box };
    thumbs.add(me);
    el.loop = mode === 'all';
    const onEnded = () => {
      if (mode === 'queue') hovered === me ? playThumb(me) : playAfter(me);
    };
    const onReady = () => {
      if (mode === 'all') {
        if (!document.hidden) void el.play().catch(() => {});
      } else if (!active) playThumb(me);
    };
    const onEnter = () => {
      hovered = me;
      if (mode === 'queue' && active !== me) playThumb(me);
    };
    const onLeave = () => {
      if (hovered === me) hovered = null;
    };
    el.addEventListener('ended', onEnded);
    el.addEventListener('loadeddata', onReady);
    box.addEventListener('mouseenter', onEnter);
    box.addEventListener('mouseleave', onLeave);
    if (el.readyState >= 2) onReady();
    return () => {
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('loadeddata', onReady);
      box.removeEventListener('mouseenter', onEnter);
      box.removeEventListener('mouseleave', onLeave);
      thumbs.delete(me);
      if (hovered === me) hovered = null;
      if (mode === 'queue' && active === me) playAfter(me);
    };
  }, [el, box]);

  if (!url) return null;
  return (
    <div ref={setBox} className={`vthumb${big ? ' big' : ''}`} title={big ? 'Уменьшить' : 'Увеличить'} onClick={() => setBig((b) => !b)}>
      {error ? (
        <div className="vid-err">нет видео</div>
      ) : visible ? (
        <video ref={setEl} src={url} muted playsInline preload="auto" onError={() => setError(true)} />
      ) : (
        <div className="vthumb-wait" />
      )}
    </div>
  );
}
