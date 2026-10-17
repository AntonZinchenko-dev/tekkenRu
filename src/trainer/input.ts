// Ввод для тренажёра: клавиатура + геймпад → события «направление сменилось» и «нажата кнопка»
import type { Dir } from '../notation/tokenize';

export type InputEvent =
  | { type: 'dir'; dir: Dir; t: number }
  | { type: 'btn'; button: number; t: number }
  | { type: 'restart'; t: number };

export type Bindings = {
  keys: { up: string[]; down: string[]; left: string[]; right: string[]; b1: string[]; b2: string[]; b3: string[]; b4: string[]; restart: string[] };
  pad: { b1: number[]; b2: number[]; b3: number[]; b4: number[] };
  /** игрок справа (P2): вперёд = влево */
  mirrored: boolean;
};

// Tekken по умолчанию: X/□ = 1, Y/△ = 2, A/✕ = 3, B/○ = 4 (индексы стандартной раскладки Gamepad API)
export const DEFAULT_BINDINGS: Bindings = {
  keys: {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    b1: ['KeyU', 'Digit1', 'Numpad4'],
    b2: ['KeyI', 'Digit2', 'Numpad5'],
    b3: ['KeyJ', 'Digit3', 'Numpad1'],
    b4: ['KeyK', 'Digit4', 'Numpad2'],
    restart: ['Space', 'Enter'],
  },
  pad: { b1: [2], b2: [3], b3: [0], b4: [1] },
  mirrored: false,
};

const LS_KEY = 'trainerBindings';

export function loadBindings(): Bindings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const b = JSON.parse(raw) as Partial<Bindings>;
      return {
        keys: { ...DEFAULT_BINDINGS.keys, ...(b.keys ?? {}) },
        pad: { ...DEFAULT_BINDINGS.pad, ...(b.pad ?? {}) },
        mirrored: b.mirrored ?? false,
      };
    }
  } catch {
    /* ignore */
  }
  return structuredClone(DEFAULT_BINDINGS);
}

export function saveBindings(b: Bindings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

export function dirFrom(up: boolean, down: boolean, left: boolean, right: boolean, mirrored: boolean): Dir {
  const fwd = mirrored ? left : right;
  const back = mirrored ? right : left;
  const v = up && !down ? 'u' : down && !up ? 'd' : '';
  const h = fwd && !back ? 'f' : back && !fwd ? 'b' : '';
  return ((v + h) || 'n') as Dir;
}

/** Источник ввода. Пока запущен — опрашивает геймпад и слушает клавиатуру. */
export class InputSource {
  private held = new Set<string>();
  private padPrev: boolean[] = [];
  private padDir = { up: false, down: false, left: false, right: false };
  private dir: Dir = 'n';
  private timer = 0;
  pressed = new Set<number>();
  padName = '';

  constructor(
    private bindings: Bindings,
    private emit: (e: InputEvent) => void,
  ) {}

  setBindings(b: Bindings) {
    this.bindings = b;
  }

  get currentDir() {
    return this.dir;
  }

  start() {
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', this.onBlur);
    this.timer = window.setInterval(this.pollPad, 4);
  }

  stop() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('blur', this.onBlur);
    clearInterval(this.timer);
  }

  private keyRole(code: string): string | null {
    for (const [role, codes] of Object.entries(this.bindings.keys)) if (codes.includes(code)) return role;
    return null;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const role = this.keyRole(e.code);
    if (!role) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || this.held.has(e.code)) return;
    this.held.add(e.code);
    const t = performance.now();
    if (role === 'restart') return this.emit({ type: 'restart', t });
    if (role.startsWith('b')) {
      const n = Number(role[1]);
      this.pressed.add(n);
      this.emit({ type: 'btn', button: n, t });
    } else this.updateDir(t);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (!this.held.has(e.code)) return;
    this.held.delete(e.code);
    const role = this.keyRole(e.code);
    if (role?.startsWith('b')) this.pressed.delete(Number(role[1]));
    else this.updateDir(performance.now());
  };

  private onBlur = () => {
    this.held.clear();
    this.pressed.clear();
    this.updateDir(performance.now());
  };

  private keyHeld(role: keyof Bindings['keys']) {
    return this.bindings.keys[role].some((c) => this.held.has(c));
  }

  private updateDir(t: number) {
    const d = dirFrom(
      this.keyHeld('up') || this.padDir.up,
      this.keyHeld('down') || this.padDir.down,
      this.keyHeld('left') || this.padDir.left,
      this.keyHeld('right') || this.padDir.right,
      this.bindings.mirrored,
    );
    if (d !== this.dir) {
      this.dir = d;
      this.emit({ type: 'dir', dir: d, t });
    }
  }

  private pollPad = () => {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((p) => p && p.connected);
    if (!pad) {
      this.padName = '';
      return;
    }
    this.padName = pad.id;
    const t = performance.now();
    const btn = (i: number) => Boolean(pad.buttons[i]?.pressed);
    const ax = pad.axes;
    const dz = 0.5;
    const nd = {
      up: btn(12) || (ax[1] ?? 0) < -dz,
      down: btn(13) || (ax[1] ?? 0) > dz,
      left: btn(14) || (ax[0] ?? 0) < -dz,
      right: btn(15) || (ax[0] ?? 0) > dz,
    };
    if (nd.up !== this.padDir.up || nd.down !== this.padDir.down || nd.left !== this.padDir.left || nd.right !== this.padDir.right) {
      this.padDir = nd;
      this.updateDir(t);
    }
    pad.buttons.forEach((b, i) => {
      const was = this.padPrev[i] ?? false;
      if (b.pressed === was) return;
      this.padPrev[i] = b.pressed;
      for (const n of [1, 2, 3, 4]) {
        if (!this.bindings.pad[`b${n}` as 'b1'].includes(i)) continue;
        if (b.pressed) {
          this.pressed.add(n);
          this.emit({ type: 'btn', button: n, t });
        } else this.pressed.delete(n);
      }
      if (b.pressed && i === 9) this.emit({ type: 'restart', t }); // Start/Options — заново
    });
  };
}
