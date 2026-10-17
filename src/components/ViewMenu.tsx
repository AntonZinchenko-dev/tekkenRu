import { useEffect, useRef, useState } from 'react';

type Props = {
  compact: boolean;
  onToggleCompact: () => void;
  onTop: boolean;
  onToggleTop: () => void;
  btnDigits: boolean;
  setBtnDigits: (v: boolean) => void;
  zoom: number;
  setZoom: (z: number) => void;
};

/** Меню «Вид»: всё, что раньше было отдельными кнопками в шапке */
export function ViewMenu(p: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const z = (v: number) => p.setZoom(+Math.min(2, Math.max(0.6, v)).toFixed(2));

  return (
    <div className="menu" ref={ref}>
      <button className={`btn small menu-btn${open ? ' open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {p.onTop && <span className="menu-pin" title="Окно поверх всех">📌</span>}
        Вид <span className="menu-caret">▾</span>
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <div className="menu-group">
            <div className="menu-cap">Окно</div>
            <Toggle label="Список персонажей" hint="B" on={!p.compact} onClick={p.onToggleCompact} />
            <Toggle label="Поверх всех окон" hint="📌" on={p.onTop} onClick={p.onToggleTop} />
          </div>
          <div className="menu-group">
            <div className="menu-cap">Кнопки в нотации</div>
            <div className="seg seg-sm">
              <button className={!p.btnDigits ? 'on' : ''} onClick={() => p.setBtnDigits(false)}>
                ⁘ Точки
              </button>
              <button className={p.btnDigits ? 'on' : ''} onClick={() => p.setBtnDigits(true)}>
                1+2 Цифры
              </button>
            </div>
          </div>
          <div className="menu-group">
            <div className="menu-cap">Масштаб</div>
            <div className="menu-zoom">
              <button className="icon-btn small" onClick={() => z(p.zoom - 0.1)} title="Мельче (Ctrl −)">
                −
              </button>
              <button className="menu-zoom-val" onClick={() => z(1)} title="Сбросить (Ctrl 0)">
                {Math.round(p.zoom * 100)}%
              </button>
              <button className="icon-btn small" onClick={() => z(p.zoom + 0.1)} title="Крупнее (Ctrl +)">
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, hint, on, onClick }: { label: string; hint?: string; on: boolean; onClick: () => void }) {
  return (
    <button className="menu-item" role="menuitemcheckbox" aria-checked={on} onClick={onClick}>
      <span className={`switch${on ? ' on' : ''}`} />
      <span className="menu-label">{label}</span>
      {hint && <kbd className="menu-kbd">{hint}</kbd>}
    </button>
  );
}
