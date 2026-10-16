import { Fragment, memo, useContext, type ReactNode } from 'react';
import { type Dir, type TagKind, type Token, tokenize } from './tokenize';
import { CharContext, stanceTitle } from '../context';
import { ComboCopyContext } from '../combo/copyContext';

const ANGLE: Record<Exclude<Dir, 'n'>, number> = { f: 0, df: 45, d: 90, db: 135, b: 180, ub: 225, u: 270, uf: 315 };

const DIR_RU: Record<Dir, string> = {
  f: 'вперёд', b: 'назад', u: 'вверх', d: 'вниз',
  df: 'вниз-вперёд', db: 'вниз-назад', uf: 'вверх-вперёд', ub: 'вверх-назад', n: 'нейтраль',
};

// Стиль как в онлайн-конструкторах нотации: толстые стрелки с обводкой (белая — нажать,
// тёмная — зажать) и кнопки ромбиком из 4 кружков, как в самой игре (1 слева, 2 сверху, 3 снизу, 4 справа)
export function DirIcon({ d, hold, size = 22 }: { d: Dir; hold?: boolean; size?: number }) {
  const title = (hold ? 'Зажать ' : '') + DIR_RU[d];
  return (
    <svg className={`ico k-dir${hold ? ' hold' : ''}`} viewBox="0 0 40 40" width={size} height={size} role="img" aria-label={title}>
      <title>{title}</title>
      {d === 'n' ? (
        <path
          d="M20 4l4.6 10.2 11 1.2-8.3 7.4 2.4 10.9L20 28.1l-9.7 5.6 2.4-10.9-8.3-7.4 11-1.2z"
          className="arr"
          strokeWidth="3.4"
          strokeLinejoin="round"
        />
      ) : (
        // стрелка вписана в круг, поэтому диагональные того же размера, что и прямые
        <g transform={`translate(20 20) rotate(${ANGLE[d]})`}>
          <path d="M-14.5 -4.6 H0.5 V-12 L15.5 0 L0.5 12 V4.6 H-14.5 Z" className="arr" strokeWidth={hold ? 4.6 : 4} strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

// ромбик: 1 — слева, 2 — сверху, 3 — снизу, 4 — справа (как □ △ ✕ ○ на геймпаде)
const BTN_POS: Record<number, [number, number]> = { 1: [10, 20], 2: [20, 10], 3: [20, 30], 4: [30, 20] };
const BTN_RU: Record<number, string> = { 1: 'левая рука', 2: 'правая рука', 3: 'левая нога', 4: 'правая нога' };

export function BtnIcon({ b, hold, size = 22, digits }: { b: number[]; hold?: boolean; size?: number; digits?: boolean }) {
  const title = (hold ? 'Зажать ' : '') + b.join('+') + ' (' + b.map((x) => BTN_RU[x]).join(' + ') + ')';
  if (digits) {
    return (
      <span className={`kdig${hold ? ' hold' : ''}`} title={title} style={{ height: size, fontSize: Math.round(size * 0.62) }}>
        {b.map((n, i) => (
          <span key={n}>
            {i > 0 && <i>+</i>}
            <b>{n}</b>
          </span>
        ))}
      </span>
    );
  }
  return (
    <svg className={`ico k-btn${hold ? ' hold' : ''}`} viewBox="0 0 40 40" width={size} height={size} role="img" aria-label={title}>
      <title>{title}</title>
      {hold && <circle cx="20" cy="20" r="18.4" className="btn-hold" />}
      {[1, 2, 3, 4].map((n) => {
        const [cx, cy] = BTN_POS[n];
        const on = b.includes(n);
        return (
          <g key={n}>
            <circle cx={cx} cy={cy} r="7.6" className={on ? 'dot on' : 'dot off'} />
            {on && <circle cx={cx - 2.2} cy={cy - 2.4} r="2.1" className="dot-shine" />}
          </g>
        );
      })}
    </svg>
  );
}

const MOTION_RU: Record<string, string> = {
  qcf: 'четверть круга вперёд (вниз → вниз-вперёд → вперёд)',
  qcb: 'четверть круга назад (вниз → вниз-назад → назад)',
  hcf: 'полукруг вперёд',
  hcb: 'полукруг назад',
};

const TAG_VIEW: Record<TagKind, { label: string; title: string }> = {
  CH: { label: 'CH', title: 'Контр-хит: срабатывает, если попал во время атаки соперника' },
  TORNADO: { label: 'T!', title: 'Торнадо (тейлспин): продлевает комбо' },
  WALL: { label: 'W!', title: 'Удар в стену / пробитие стены' },
  BALCONY: { label: 'BB!', title: 'Пробитие балкона' },
  FLOOR: { label: 'FB!', title: 'Пробитие пола' },
  HOLD: { label: 'удерж.', title: 'Удерживать кнопку/направление' },
  RAGEART: { label: 'RA', title: 'Rage Art' },
  HEATBURST: { label: 'HB', title: 'Heat Burst' },
  POWERCRUSH: { label: 'PC', title: 'Power Crush (броня)' },
  HEATENGAGER: { label: 'HE', title: 'Heat Engager — включает Heat' },
};

function TokenView({ tk, size }: { tk: Token; size: number }) {
  const ctx = useContext(CharContext);
  switch (tk.t) {
    case 'dir':
      return <DirIcon d={tk.d} hold={tk.hold} size={size} />;
    case 'btn':
      return <BtnIcon b={tk.b} hold={tk.hold} size={size} digits={ctx.btnDigits} />;
    case 'motion':
      return (
        <span className="motion" title={MOTION_RU[tk.name] ?? tk.name}>
          {tk.dirs.map((d, i) => (
            <DirIcon key={i} d={d} size={size} />
          ))}
        </span>
      );
    case 'stance': {
      return (
        <span className="stance" title={stanceTitle(tk.abbr, ctx)}>
          {tk.abbr.toUpperCase()}
        </span>
      );
    }
    case 'tag': {
      const v = TAG_VIEW[tk.kind];
      return (
        <span className={`tag tag-${tk.kind.toLowerCase()}`} title={v.title}>
          {v.label}
        </span>
      );
    }
    case 'sep':
      if (tk.s === ',') return <span className="sep comma">,</span>;
      if (tk.s === '~') return <span className="sep" title="сразу же, без паузы">~</span>;
      if (tk.s === ':') return <span className="sep jf" title="джаст-фрейм: точный тайминг">⁝</span>;
      if (tk.s === 'or') return <span className="sep or">или</span>;
      return <span className="sep">+</span>;
    case 'paren':
      return <span className="paren">{tk.v}</span>;
    case 'text':
      return <span className="ntext">{tk.v}</span>;
    case 'step':
      return <StepArrow />;
  }
}

export function StepArrow() {
  return (
    <svg className="step-arrow" viewBox="0 0 16 24" width="11" height="16" aria-hidden>
      <path d="M4.5 4.5l7.5 7.5-7.5 7.5" fill="none" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SIZE = { sm: 24, combo: 28, md: 32, lg: 38 } as const;

type NotationProps = {
  cmd: string;
  size?: keyof typeof SIZE;
  /** не подсвечивать фреймы при наведении */
  plain?: boolean;
};

/** Рисует одну команду ("df3+4", "BT d+2") иконками */
export const Notation = memo(function Notation({ cmd, size = 'md', plain }: NotationProps) {
  const ctx = useContext(CharContext);
  const tokens = tokenize(cmd, ctx.stances);
  const move = plain ? undefined : ctx.findMove(cmd);
  return (
    <span
      className={`cmd cmd-${size}${move ? ' has-move' : ''}`}
      data-cmd={cmd}
      onMouseEnter={move ? (e) => ctx.showFrames(move, e.currentTarget.getBoundingClientRect()) : undefined}
      onMouseLeave={move ? () => ctx.showFrames(null) : undefined}
    >
      {tokens.map((tk, i) => (
        <TokenView key={i} tk={tk} size={SIZE[size]} />
      ))}
    </span>
  );
});

/** Маршрут комбо: строка «старт» и строка «дальше», каждый шаг — в своей плашке */
export function ComboRoute({ starters, route, note, noCopy }: { starters: string[]; route: string; note?: ReactNode; noCopy?: boolean }) {
  const copy = useContext(ComboCopyContext);
  const steps = route
    .split(/\s*(?:→|->|=>|>)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  return (
    <div className="combo">
      {copy && !noCopy && (
        <button className="combo-copy" title="Взять за основу в конструкторе" onClick={() => copy(starters, route)}>
          ✎ за основу
        </button>
      )}
      {starters.length > 0 && (
        <div className="combo-row">
          <span className="combo-label">старт</span>
          <div className="combo-flow">
            {starters.map((s, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="combo-or">или</span>}
                <span className="combo-pill starter">
                  <Notation cmd={s} size="combo" />
                </span>
              </Fragment>
            ))}
          </div>
        </div>
      )}
      <div className="combo-row">
        <span className="combo-label">{starters.length ? 'дальше' : 'комбо'}</span>
        <div className="combo-flow">
          {steps.map((st, i) => (
            // стрелка «дальше» приклеена к своей плашке, чтобы при переносе не висела в конце строки
            <span key={i} className="combo-seg">
              {i > 0 && <StepArrow />}
              <span className="combo-pill">
                <Notation cmd={st} size="combo" />
              </span>
            </span>
          ))}
        </div>
      </div>
      {note && <div className="combo-note">{note}</div>}
    </div>
  );
}
