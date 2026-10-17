// Автоопределение соперника: смотрим на окно игры (как Discord при трансляции — в саму игру не лезем),
// вырезаем плашки с именами персонажей слева и справа и читаем буквы офлайн-читалкой текста.
import { createWorker, PSM, type Worker } from 'tesseract.js';
import type { CharacterInfo, VisionSource } from '../../shared/types';
import { api } from '../api';

export type Side = 'left' | 'right';
export type Detection = { left: string | null; right: string | null; leftRaw: string; rightRaw: string; meSide: Side | null; forced?: boolean };
export type VisionDebug = { crops: Record<string, string>; text: Record<string, string>; source: string; frame: string };

// Положение плашек в кадре 16:9 (доли ширины/высоты). Сняты с HUD Tekken 8.
const REGIONS = {
  leftName: { x0: 0.012, y0: 0.066, x1: 0.13, y1: 0.108 },
  rightName: { x0: 0.835, y0: 0.096, x1: 0.978, y1: 0.142 },
  leftNick: { x0: 0.03, y0: 0.104, x1: 0.17, y1: 0.136 },
  rightNick: { x0: 0.83, y0: 0.138, x1: 0.97, y1: 0.172 },
} as const;
type RegionKey = keyof typeof REGIONS;

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function levenshtein(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Текст с плашки → id персонажа (с допуском на ошибки чтения) */
export function matchCharacter(text: string, chars: CharacterInfo[]): string | null {
  const t = norm(text);
  if (t.length < 2) return null;
  const scored = chars
    .map((c) => {
      const n = norm(c.displayName);
      return { id: c.id, d: levenshtein(t, n), len: n.length };
    })
    .sort((a, b) => a.d - b.d);
  const best = scored[0];
  if (!best) return null;
  const limit = Math.max(1, Math.floor(best.len * 0.34));
  if (best.d > limit) return null;
  if (scored[1] && scored[1].d === best.d) return null; // неоднозначно
  return best.id;
}

/** Кадр из видео → прямоугольник игры 16:9 (на случай рамок/полос) */
function gameRect(w: number, h: number, bottomAlign = false) {
  const target = 16 / 9;
  if (w / h > target + 0.01) {
    const gw = h * target;
    return { x: (w - gw) / 2, y: 0, w: gw, h };
  }
  if (w / h < target - 0.01) {
    const gh = w / target;
    // у окна с рамкой лишнее — заголовок сверху, поэтому игру прижимаем к низу
    return { x: 0, y: bottomAlign ? h - gh : (h - gh) / 2, w, h: gh };
  }
  return { x: 0, y: 0, w, h };
}

/** Подготовка плашки: увеличить, выпрямить курсив, оставить только белые буквы, убрать рамки */
export function prepare(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, white = true): HTMLCanvasElement {
  const SCALE = 4;
  const SHEAR = 0.22;
  const w = Math.max(1, Math.round(sw * SCALE));
  const h = Math.max(1, Math.round(sh * SCALE));
  const extra = Math.round(SHEAR * h);
  const c = document.createElement('canvas');
  c.width = w + extra;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  // курсив наклонён вправо: сдвигаем низ строки вправо, чтобы буквы встали ровно
  g.setTransform(1, 0, SHEAR, 1, 0, 0);
  g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const px = img.data;
  const W = c.width;
  const H = c.height;
  const mask = new Uint8Array(W * H);
  // Порог яркости подстраиваем под картинку: при HDR, ночном режиме или тёмной гамме буквы бывают
  // не белыми, а серыми (~120–140), и жёсткий порог 150 их терял. Берём яркость самых светлых 2% точек.
  const hist = new Uint32Array(256);
  for (let i = 0; i < W * H; i++) hist[Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])]++;
  let acc = 0;
  let p98 = 255;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= W * H * 0.02) {
      p98 = v;
      break;
    }
  }
  const thr = Math.max(95, Math.min(150, Math.round(p98 * 0.72)));
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4];
    const gg = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    const mx = Math.max(r, gg, b);
    const mn = Math.min(r, gg, b);
    mask[i] = white ? (mn > thr && mx - mn < 80 ? 1 : 0) : mx > thr ? 1 : 0;
  }
  // связные области: оставляем «буквы» (высокие и не слишком длинные), выкидываем линии рамки
  const lab = new Int32Array(W * H);
  const boxes: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
  const stack = new Int32Array(W * H); // каждый пиксель кладём не больше одного раза
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || lab[i]) continue;
    const id = boxes.length + 1;
    const box = { x0: W, y0: H, x1: 0, y1: 0, n: 0 };
    lab[i] = id;
    let sp = 0;
    stack[sp++] = i;
    while (sp) {
      const k = stack[--sp];
      const x = k % W;
      const y = (k / W) | 0;
      box.n++;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
      if (x > 0 && mask[k - 1] && !lab[k - 1]) (lab[k - 1] = id), (stack[sp++] = k - 1);
      if (x < W - 1 && mask[k + 1] && !lab[k + 1]) (lab[k + 1] = id), (stack[sp++] = k + 1);
      if (y > 0 && mask[k - W] && !lab[k - W]) (lab[k - W] = id), (stack[sp++] = k - W);
      if (y < H - 1 && mask[k + W] && !lab[k + W]) (lab[k + W] = id), (stack[sp++] = k + W);
    }
    boxes.push(box);
  }
  // буквы стоят в одну строку: ищем самую большую группу областей с общим верхом и низом
  const cand = boxes
    .map((b, i) => ({ ...b, i, hh: b.y1 - b.y0 + 1, ww: b.x1 - b.x0 + 1 }))
    .filter((b) => b.hh >= 0.22 * H && b.n > 20 && b.ww < b.hh * 2.6 && b.y0 > 0 && b.y1 < H - 1);
  let bestGroup: typeof cand = [];
  for (const ref of cand) {
    const tol = ref.hh * 0.22;
    const grp = cand.filter((b) => Math.abs(b.y0 - ref.y0) <= tol && Math.abs(b.y1 - ref.y1) <= tol);
    if (grp.length > bestGroup.length || (grp.length === bestGroup.length && ref.hh > (bestGroup[0]?.hh ?? 0))) bestGroup = grp;
  }
  // в группе — только соседи по строке (без далёких одиночных пятен)
  bestGroup.sort((a, b) => a.x0 - b.x0);
  const keepSet = new Set<number>();
  if (bestGroup.length) {
    const hh = bestGroup.reduce((s, b) => s + b.hh, 0) / bestGroup.length;
    let run: typeof bestGroup = [bestGroup[0]];
    let bestRun = run;
    for (let k = 1; k < bestGroup.length; k++) {
      if (bestGroup[k].x0 - bestGroup[k - 1].x1 <= hh * 1.6) run.push(bestGroup[k]);
      else run = [bestGroup[k]];
      if (run.length > bestRun.length) bestRun = run;
    }
    for (const b of bestRun) keepSet.add(b.i);
  }
  const keep = boxes.map((_, i) => keepSet.has(i));
  const out = document.createElement('canvas');
  const PAD = 24;
  out.width = W + PAD * 2;
  out.height = H + PAD * 2;
  const og = out.getContext('2d')!;
  og.fillStyle = '#fff';
  og.fillRect(0, 0, out.width, out.height);
  const oi = og.getImageData(0, 0, out.width, out.height);
  for (let i = 0; i < W * H; i++) {
    const l = lab[i];
    if (!l || !keep[l - 1]) continue;
    const x = i % W;
    const y = (i / W) | 0;
    const o = ((y + PAD) * out.width + x + PAD) * 4;
    oi.data[o] = oi.data[o + 1] = oi.data[o + 2] = 0;
  }
  og.putImageData(oi, 0, 0);
  // сколько «букв» нашли — по этому решаем, стоит ли пробовать прочитать ещё раз со сдвигом
  (out as HTMLCanvasElement & { letters?: number }).letters = keepSet.size;
  return out;
}

type Rect = { sx: number; sy: number; sw: number; sh: number };
type Part = { y: number; w: number; h: number };

/**
 * Снимает нужные кусочки кадра. Кадр рисуем на видеокарте (без копирования всего кадра в память),
 * а в обычную память переносим только маленькую полоску с плашками.
 */
function makeGrabber() {
  const g = document.createElement('canvas');
  const gc = g.getContext('2d', { alpha: false })!;
  const c = document.createElement('canvas');
  const cc = c.getContext('2d', { alpha: false, willReadFrequently: true })!;
  return (src: CanvasImageSource, rects: Rect[]) => {
    const parts = rects.map((r) => ({ ...r, w: Math.max(1, Math.round(r.sw)), h: Math.max(1, Math.round(r.sh)) }));
    const W = Math.max(...parts.map((p) => p.w));
    const H = parts.reduce((sum, p) => sum + p.h, 0);
    if (g.width !== W || g.height !== H) {
      g.width = c.width = W;
      g.height = c.height = H;
    }
    const out: Part[] = [];
    let y = 0;
    for (const p of parts) {
      gc.drawImage(src, p.sx, p.sy, p.sw, p.sh, 0, y, p.w, p.h);
      out.push({ y, w: p.w, h: p.h });
      y += p.h;
    }
    cc.drawImage(g, 0, 0);
    return { canvas: c, ctx: cc, parts: out, W, H };
  };
}

/** Грубый отпечаток плашки (24×6 клеток, 8 уровней яркости): если не изменился — заново не читаем */
function fpFrom(d: Uint8ClampedArray, W: number, p: Part) {
  const GX = 24;
  const GY = 6;
  const sum = new Float32Array(GX * GY);
  const cnt = new Uint16Array(GX * GY);
  for (let y = 0; y < p.h; y++) {
    const cy = Math.min(GY - 1, ((y * GY) / p.h) | 0);
    const row = (p.y + y) * W * 4;
    for (let x = 0; x < p.w; x++) {
      const cell = cy * GX + Math.min(GX - 1, ((x * GX) / p.w) | 0);
      const i = row + x * 4;
      sum[cell] += d[i] + d[i + 1] + d[i + 2];
      cnt[cell]++;
    }
  }
  let s = '';
  for (let i = 0; i < GX * GY; i++) s += ((sum[i] / Math.max(1, cnt[i]) / 96) | 0).toString();
  return s;
}

/** Отпечаток всего кадра: уменьшаем его на видеокарте до 32×18 и забираем только эти точки.
 *  Заодно отдаём среднюю яркость — чтобы заметить «чёрный» захват. */
function makeTinyFp() {
  const g = document.createElement('canvas');
  g.width = 32;
  g.height = 18;
  const gc = g.getContext('2d', { alpha: false })!;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 18;
  const cc = c.getContext('2d', { alpha: false, willReadFrequently: true })!;
  return (src: CanvasImageSource) => {
    gc.drawImage(src, 0, 0, 32, 18);
    cc.drawImage(g, 0, 0);
    const d = cc.getImageData(0, 0, 32, 18).data;
    let s = '';
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      s += ((d[i] + d[i + 1] + d[i + 2]) / 48) | 0;
      sum += d[i] + d[i + 1] + d[i + 2];
    }
    return { fp: s, mean: sum / (d.length / 4) / 3 };
  };
}

const idle = () => new Promise((r) => setTimeout(r, 0));

let workerPromise: Promise<Worker> | null = null;
function ocrWorker() {
  if (!workerPromise) {
    const base = new URL('ocr/', location.href).href;
    workerPromise = (async () => {
      const w = await createWorker('eng', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        langPath: base.replace(/\/$/, ''),
        gzip: true,
        cacheMethod: 'none',
        workerBlobURL: false,
      });
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
      return w;
    })();
  }
  return workerPromise;
}

async function readText(canvas: HTMLCanvasElement, whitelist: string) {
  const w = await ocrWorker();
  await w.setParameters({ tessedit_char_whitelist: whitelist });
  const r = await w.recognize(canvas);
  return r.data.text.trim();
}

const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-8 ';
const NICK_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-. ';

export async function pickSource(pref: string, noWindow = false): Promise<VisionSource | null> {
  const list = await api.visionSources(noWindow ? ['screen'] : ['window', 'screen']);
  if (pref && pref !== 'auto' && !noWindow) {
    const exact = list.find((s) => s.id === pref);
    if (exact) return exact;
    // Номер окна меняется при каждом запуске игры (window:<номер>:0), поэтому сохранённый выбор
    // «Окно TEKKEN 8» после перезапуска игры уже не находился — и программа сдавалась совсем.
    // Теперь берём то же по смыслу: окно игры (у нас в списке только окна Tekken) или тот же монитор.
    const kind = pref.startsWith('window:') ? 'window' : 'screen';
    const same = list.find((s) => s.kind === kind && (kind === 'window' || s.id.split(':')[1] === pref.split(':')[1]));
    if (same) return same;
  }
  return list.find((s) => s.kind === 'window') ?? list.find((s) => s.kind === 'screen' && !s.appHere) ?? list.find((s) => s.kind === 'screen') ?? null;
}

type Opts = {
  sourcePref: string;
  chars: () => CharacterInfo[];
  myMain: () => string;
  myNick: () => string;
  onDetect: (d: Detection) => void;
  onStatus: (text: string, ok: boolean) => void;
  onDebug?: (d: VisionDebug) => void;
  /** нужны ли картинки для отладки (только когда открыты настройки) */
  wantDebug?: () => boolean;
};

export type VisionHandle = { stop: () => void; force: () => void | Promise<void> };

// Частоты (подобраны так, чтобы программа почти не грузила компьютер во время игры)
const TICK_MS = 1200; // как часто смотрим на плашки (это дёшево: маленькая полоска пикселей)
const FREEZE_CHECK_MS = 5000; // как часто проверяем, не «замёрзла» ли картинка
const FREEZE_LIMIT_MS = 45000; // сколько картинка должна стоять, чтобы переподключиться
const WINDOW_CHECK_MS = 30000; // как часто ищем окно игры, если смотрим на монитор
const CONFIRM_TRIES = 3; // сколько раз перечитать неподтверждённое имя, если плашка не меняется
const BLACK_LIMIT_MS = 6000; // окно игры отдаёт чёрный кадр столько времени — смотрим монитор целиком
// Запасные попытки, если имя не прочиталось: плашку чуть выше/ниже (другое разрешение, рамка окна, масштаб HUD)
// и «любые светлые буквы» вместо «только белых» (цветной HUD, HDR). Принимаем, только если имя нашлось в списке.
const RETRIES: { dy: number; white: boolean }[] = [
  { dy: 0, white: false },
  { dy: -0.3, white: true },
  { dy: 0.3, white: true },
];

/** Запускает наблюдение. Возвращает управление: остановить / проверить заново прямо сейчас. */
export function startVision(o: Opts): VisionHandle {
  let stopped = false;
  let stream: MediaStream | null = null;
  let timer = 0;
  let running = false;
  const video = document.createElement('video');
  video.muted = true;
  const grabNames = makeGrabber();
  const grabNicks = makeGrabber();
  const frameFp = makeTinyFp();
  let lastFp = '';
  let lastPair = '';
  let stable = 0;
  let confirmTries = 0;
  let lastSide: Side | null = null;
  let sourceName = '';
  let pending: Detection | null = null;
  let firedPair = '';
  let srcKind: VisionSource['kind'] | null = null;
  let srcId = '';
  let noFightSince = 0; // с какого момента боя не видно (меню/загрузка между боями)
  let lastFrameFp = '';
  let stillSince = Date.now();
  let lastFreezeCheck = 0;
  let lastSourceCheck = Date.now();
  let forceUntil = 0; // принудительная проверка: верим первому же чтению
  let lastStatus = '';
  let blackSince = 0; // с какого момента окно игры отдаёт чёрную картинку
  let noWindow = false; // окно игры не годится (полноэкранный режим) — смотрим монитор
  let debugShown = false; // открыли настройки — один раз перечитаем, чтобы показать картинки
  const status = (text: string, ok: boolean) => {
    // одинаковый статус не отправляем повторно — лишние перерисовки окна ни к чему
    const key = `${ok}|${text}`;
    if (key === lastStatus) return;
    lastStatus = key;
    o.onStatus(text, ok);
  };
  const fire = (d: Detection) => {
    const key = `${d.left}|${d.right}|${d.meSide}`;
    if (key === firedPair && !d.forced) return; // тот же бой — не дёргаем экран заново
    firedPair = key;
    o.onDetect(d);
  };
  const resetReads = () => {
    lastFp = '';
    lastPair = '';
    stable = 0;
    confirmTries = 0;
    pending = null;
  };
  const dropStream = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    if (!stopped && stream) timer = window.setTimeout(tick, ms);
  };

  const acquire = async () => {
    if (stopped) return;
    try {
      const src = await pickSource(o.sourcePref, noWindow);
      if (!src) {
        const soon = Date.now() < forceUntil;
        status(`Не нашёл ни окна игры, ни монитора для захвата. Проверю ещё раз через ${soon ? 'пару секунд' : '10 секунд'}…`, false);
        timer = window.setTimeout(acquire, soon ? 1500 : 10000);
        return;
      }
      sourceName = src.name;
      srcKind = src.kind;
      srcId = src.id;
      stillSince = Date.now();
      lastSourceCheck = Date.now();
      lastFrameFp = '';
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // Full HD хватает, чтобы прочитать имена; 1 кадр в секунду — нам больше не нужно.
          // @ts-expect-error: старый формат ограничений Chromium для захвата экрана
          mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.id, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 1 },
        },
      });
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stream = null;
        if (!stopped) {
          status('Окно игры пропало — ищу заново…', false);
          timer = window.setTimeout(acquire, 3000);
        }
      });
      video.srcObject = stream;
      await video.play();
      if (Date.now() >= forceUntil) status(`Смотрю: ${src.name}. Жду начала боя…`, false);
      void tick();
    } catch (e) {
      status(`Не удалось начать захват (${(e as Error).message}). Повтор через 10 секунд…`, false);
      timer = window.setTimeout(acquire, 10000);
    }
  };

  const crop = (key: RegionKey, dy = 0): Rect => {
    const g = gameRect(video.videoWidth, video.videoHeight, srcKind === 'window');
    const r = REGIONS[key];
    const sh = (r.y1 - r.y0) * g.h;
    return { sx: g.x + r.x0 * g.w, sy: g.y + r.y0 * g.h + dy * sh, sw: (r.x1 - r.x0) * g.w, sh };
  };
  const grabRetry = makeGrabber();
  /** Имя не прочиталось — пробуем запасные варианты, пока одно не совпадёт с персонажем из списка */
  const retrySide = async (key: 'leftName' | 'rightName', chars: CharacterInfo[]) => {
    for (const r of RETRIES) {
      await idle();
      const shot = grabRetry(video, [crop(key, r.dy)]);
      const p = shot.parts[0];
      const c = prepare(shot.canvas, 0, p.y, p.w, p.h, r.white);
      const raw = await readText(c, NAME_CHARS);
      const id = matchCharacter(raw, chars);
      if (id) return { id, raw, canvas: c };
    }
    return null;
  };

  const reacquire = (why: string) => {
    clearTimeout(timer);
    dropStream();
    resetReads();
    if (why) status(why, false);
    void acquire();
  };

  const tick = async () => {
    if (stopped || !stream || running) return;
    running = true;
    try {
      if (video.videoWidth > 0) {
        const now = Date.now();
        // захват «замёрз» (бывает после Alt+Tab или смены режима окна) — подключаемся заново
        if (now - lastFreezeCheck >= FREEZE_CHECK_MS) {
          lastFreezeCheck = now;
          const { fp: tiny, mean } = frameFp(video);
          // окно игры в полноэкранном режиме часто отдаёт только чёрный кадр — тогда смотрим монитор
          if (srcKind === 'window' && mean < 3) {
            if (!blackSince) blackSince = now;
            else if (now - blackSince > BLACK_LIMIT_MS) {
              noWindow = true;
              blackSince = 0;
              reacquire('Окно игры отдаёт чёрную картинку (так бывает в полноэкранном режиме) — смотрю монитор целиком. Надёжнее поставить в игре «Оконный без рамки».');
              return;
            }
          } else blackSince = 0;
          if (tiny !== lastFrameFp) {
            lastFrameFp = tiny;
            stillSince = now;
          } else if (now - stillSince > FREEZE_LIMIT_MS) {
            reacquire('Картинка игры не меняется — переподключаюсь к захвату…');
            return;
          }
        }
        // смотрели на монитор, а игра запустилась позже — переключаемся на окно игры (ищем только окна — это дёшево)
        if (srcKind === 'screen' && !noWindow && (!o.sourcePref || o.sourcePref === 'auto') && now - lastSourceCheck > WINDOW_CHECK_MS) {
          lastSourceCheck = now;
          const list = await api.visionSources(['window']);
          if (list.some((s) => s.kind === 'window')) {
            reacquire('Нашёл окно игры — переключаюсь на него…');
            return;
          }
        }
        await analyse();
      }
    } catch (e) {
      console.warn('vision', e);
    } finally {
      running = false;
    }
    schedule(Date.now() < forceUntil ? 400 : TICK_MS);
  };

  const analyse = async () => {
    const shot = grabNames(video, [crop('leftName'), crop('rightName')]);
    const data = shot.ctx.getImageData(0, 0, shot.W, shot.H).data;
    const [pl, pr] = shot.parts;
    const fp = fpFrom(data, shot.W, pl) + '|' + fpFrom(data, shot.W, pr);
    const forcing = Date.now() < forceUntil;
    // плашки не менялись: читаем заново только если прошлое чтение ещё не подтвердилось (и не больше пары раз)
    const unsure = pending !== null && stable < 2 && confirmTries < CONFIRM_TRIES;
    const debugOn = o.wantDebug?.() ?? false;
    if (!debugOn) debugShown = false;
    if (fp === lastFp && !forcing && !unsure && !(debugOn && !debugShown)) return;
    confirmTries = fp === lastFp ? confirmTries + 1 : 0;
    lastFp = fp;

    // читаем по очереди и между ними отдаём управление окну — чтобы не было подвисаний
    const lc = prepare(shot.canvas, 0, pl.y, pl.w, pl.h);
    const leftRaw = await readText(lc, NAME_CHARS);
    await idle();
    const rc = prepare(shot.canvas, 0, pr.y, pr.w, pr.h);
    const rightRaw = await readText(rc, NAME_CHARS);
    const chars = o.chars();
    let left = matchCharacter(leftRaw, chars);
    let right = matchCharacter(rightRaw, chars);
    // одна сторона прочиталась, другая нет, или на плашке видны буквы, но имя не узнали — пробуем ещё раз
    const lettersL = (lc as HTMLCanvasElement & { letters?: number }).letters ?? 0;
    const lettersR = (rc as HTMLCanvasElement & { letters?: number }).letters ?? 0;
    let lcShow = lc;
    let rcShow = rc;
    if (!left && (right || lettersL >= 2)) {
      const r = await retrySide('leftName', chars);
      if (r) (left = r.id), (lcShow = r.canvas);
    }
    if (!right && (left || lettersR >= 2)) {
      const r = await retrySide('rightName', chars);
      if (r) (right = r.id), (rcShow = r.canvas);
    }
    let debug: VisionDebug | null = null;
    if (debugOn) {
      const thumb = document.createElement('canvas');
      thumb.width = 480;
      thumb.height = Math.round((480 * video.videoHeight) / video.videoWidth);
      thumb.getContext('2d')!.drawImage(video, 0, 0, thumb.width, thumb.height);
      debug = {
        crops: { 'Имя слева': lcShow.toDataURL(), 'Имя справа': rcShow.toDataURL() },
        text: { 'Имя слева': leftRaw, 'Имя справа': rightRaw },
        source: `${sourceName} · ${video.videoWidth}×${video.videoHeight}`,
        frame: thumb.toDataURL('image/jpeg', 0.7),
      };
    }

    if (!left || !right) {
      stable = 0;
      lastPair = '';
      pending = null;
      if (!noFightSince) noFightSince = Date.now();
      if (!forcing && forceUntil) {
        forceUntil = 0;
        status(`Не нашёл бой на экране (${sourceName}). Нажми Num − во время боя, когда видны имена у полосок здоровья.`, false);
      } else
        status(
          forcing
            ? `Проверяю заново… Плашки с именами пока не вижу (${sourceName}).`
            : `Смотрю: ${sourceName}. Боя не вижу (меню, загрузка или плашки скрыты).`,
          false,
        );
      if (debug) (debugShown = true), o.onDebug?.(debug);
      return;
    }
    // между боями (меню, загрузка) больше 8 секунд не было плашек — это новый бой, даже реванш с тем же персонажем
    if (noFightSince && Date.now() - noFightSince > 8000) firedPair = '';
    noFightSince = 0;
    // на какой я стороне: по нику, потом по мейну, потом как в прошлый раз
    let meSide: Side | null = null;
    const nick = norm(o.myNick());
    if (nick.length >= 3) {
      const ns = grabNicks(video, [crop('leftNick'), crop('rightNick')]);
      const [nl, nr] = ns.parts;
      await idle();
      const lnc = prepare(ns.canvas, 0, nl.y, nl.w, nl.h, true);
      const lt = norm(await readText(lnc, NICK_CHARS));
      await idle();
      const rnc = prepare(ns.canvas, 0, nr.y, nr.w, nr.h, true);
      const rt = norm(await readText(rnc, NICK_CHARS));
      if (debug) {
        debug.crops['Ник слева'] = lnc.toDataURL();
        debug.crops['Ник справа'] = rnc.toDataURL();
        debug.text['Ник слева'] = lt;
        debug.text['Ник справа'] = rt;
      }
      const dl = lt ? levenshtein(lt, nick) : 99;
      const dr = rt ? levenshtein(rt, nick) : 99;
      const lim = Math.max(2, Math.floor(nick.length * 0.4));
      if (dl <= lim && dl < dr) meSide = 'left';
      else if (dr <= lim && dr < dl) meSide = 'right';
    }
    const main = o.myMain();
    if (!meSide && main) {
      if (left === main && right !== main) meSide = 'left';
      else if (right === main && left !== main) meSide = 'right';
    }
    if (!meSide) meSide = lastSide;
    if (debug) (debugShown = true), o.onDebug?.(debug);

    const pair = `${left}|${right}|${meSide}`;
    if (pair === lastPair) stable++;
    else {
      lastPair = pair;
      stable = 1;
    }
    pending = { left, right, leftRaw, rightRaw, meSide };
    if (forcing) {
      // принудительная проверка: сразу показываем, что увидели
      forceUntil = 0;
      stable = 2;
      lastSide = meSide;
      fire({ ...pending, forced: true });
    } else if (stable === 2) {
      // два одинаковых чтения подряд — уверены
      lastSide = meSide;
      fire(pending);
    }
    const name = (id: string) => chars.find((c) => c.id === id)?.displayName ?? id;
    status(`Вижу бой: ${name(left)} (слева) против ${name(right)} (справа)${meSide ? ` · ты ${meSide === 'left' ? 'слева' : 'справа'}` : ' · не знаю, где ты — укажи мейна или ник в ⚙'}`, true);
  };

  void acquire();
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      dropStream();
    },
    // Num − : забыть всё и сразу прочитать плашки; если захват «умер» — найти окно игры заново
    force: async () => {
      if (stopped) return;
      forceUntil = Date.now() + 8000;
      firedPair = '';
      noWindow = false; // вдруг игру переключили в оконный режим — попробуем окно снова
      noFightSince = 0;
      status('Проверяю заново (Num −)…', false);
      const best = await pickSource(o.sourcePref, noWindow).catch(() => null);
      if (stream && best && best.id === srcId && Date.now() - stillSince < FREEZE_LIMIT_MS) {
        resetReads();
        if (!running) void tick();
      } else reacquire('');
    },
  };
}

/** Проверка на картинке (для отладки в настройках) */
export async function analyseImage(img: HTMLImageElement | HTMLCanvasElement, chars: CharacterInfo[]) {
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const g = gameRect(w, h);
  const res: Record<string, { text: string; id: string | null; crop: string }> = {};
  for (const key of ['leftName', 'rightName'] as const) {
    const r = REGIONS[key];
    const c = prepare(img, g.x + r.x0 * g.w, g.y + r.y0 * g.h, (r.x1 - r.x0) * g.w, (r.y1 - r.y0) * g.h);
    const text = await readText(c, NAME_CHARS);
    res[key] = { text, id: matchCharacter(text, chars), crop: c.toDataURL() };
  }
  return res;
}
