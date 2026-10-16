import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, net, protocol, safeStorage, screen, session, shell } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { JobState, Settings, VisionSource, BaseUpdateResult } from '../shared/types';
import { MODELS } from '../shared/types';
import { UpdateJob } from './pipeline/job';
import { Store } from './pipeline/store';
import { checkAppRelease, updateBase } from './pipeline/baseUpdate';
import { Translator } from './pipeline/translate';

app.setName('TekkenRU');

// app:// — интерфейс (нужен вместо file://, чтобы работали fetch и распознавание текста),
// tkvideo:// — ролики приёмов с кэшем на диске
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'tkvideo', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Портативный режим: если рядом с exe лежит папка "data", храним всё там
const exeDir = process.env.PORTABLE_EXECUTABLE_DIR ?? path.dirname(app.getPath('exe'));
const portableData = path.join(exeDir, 'data');
const dataDir = app.isPackaged && existsSync(portableData) ? portableData : path.join(app.getPath('userData'), 'data');

// постоянная часть данных (гайды, фреймдата) — папка base рядом с программой
const baseDir = app.isPackaged ? path.join(exeDir, 'base') : path.join(app.getAppPath(), 'base');
const store = new Store(dataDir, baseDir);
let win: BrowserWindow | null = null;

type RawSettings = {
  apiKeyEnc?: string;
  apiKeyPlain?: string;
  model?: string;
  alwaysOnTop?: boolean;
  zoom?: number;
  concurrency?: number;
  bounds?: { x: number; y: number; width: number; height: number };
  framesVersion?: number;
  visionEnabled?: boolean;
  visionSource?: string;
  myMain?: string;
  myNick?: string;
  autoSwitch?: boolean;
  autoBaseUpdate?: boolean;
};

const FRAMES_VERSION = 2; // 2 — во фреймдате есть ссылки на видео
let raw: RawSettings = {};

/** Ключ из .env рядом с exe или в текущей папке (TRANSLATE_API_KEY=..., старое имя тоже понимаем) */
function envKey(): string | undefined {
  const fromEnv = process.env.TRANSLATE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (fromEnv) return fromEnv;
  for (const dir of [exeDir, process.cwd(), app.getAppPath()]) {
    const f = path.join(dir, '.env');
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(/^\s*(?:TRANSLATE|ANTHROPIC)_API_KEY\s*=\s*["']?([^"'\r\n]+)/m);
    if (m) return m[1].trim();
  }
  return undefined;
}

function storedKey(): string | undefined {
  if (raw.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(raw.apiKeyEnc, 'base64'));
    } catch {
      return undefined;
    }
  }
  return raw.apiKeyPlain;
}

const apiKey = () => storedKey() || envKey();

function settings(): Settings {
  const sk = storedKey();
  const ek = envKey();
  return {
    apiKeySet: Boolean(sk || ek),
    apiKeySource: sk ? 'settings' : ek ? 'env' : 'none',
    model: raw.model && MODELS.some((m) => m.id === raw.model) ? raw.model : MODELS[0].id,
    alwaysOnTop: raw.alwaysOnTop ?? false,
    zoom: raw.zoom ?? 1,
    concurrency: raw.concurrency ?? 4,
    visionEnabled: raw.visionEnabled ?? false,
    visionSource: raw.visionSource ?? 'auto',
    myMain: raw.myMain ?? '',
    myNick: raw.myNick ?? '',
    autoSwitch: raw.autoSwitch ?? true,
    autoBaseUpdate: raw.autoBaseUpdate ?? true,
  };
}

const persist = () => store.saveSettingsRaw(raw as Record<string, unknown>);

const job = new UpdateJob(
  store,
  () => {
    const k = apiKey();
    return k ? new Translator(k, settings().model) : null;
  },
  () => settings().concurrency,
  (s: JobState) => win?.webContents.send('job', s),
  (id: string) => win?.webContents.send('character-updated', id),
);

function createWindow() {
  const s = settings();
  win = new BrowserWindow({
    width: raw.bounds?.width ?? 1280,
    height: raw.bounds?.height ?? 900,
    x: raw.bounds?.x,
    y: raw.bounds?.y,
    minWidth: 520,
    minHeight: 400,
    backgroundColor: '#0d0f14',
    title: 'TekkenRU — справочник Tekken 8',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'dist', 'icon.png'),
    alwaysOnTop: s.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadURL('app://ui/index.html');
  win.webContents.on('did-finish-load', () => win?.webContents.setZoomFactor(settings().zoom));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  const saveBounds = () => {
    if (!win || win.isMinimized() || win.isMaximized()) return;
    raw.bounds = win.getBounds();
    persist();
  };
  win.on('resized', saveBounds);
  win.on('moved', saveBounds);
  win.on('closed', () => (win = null));
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.ico': 'image/x-icon',
};

const DIST = path.join(__dirname, '..', 'dist');
const VIDEO_CDN = 'https://tekkendocs.b-cdn.net/t8/videos';
const VIDEO_POSTFIX: Record<string, string> = { asuka: '-640', jun: '', reina: '' };

function registerProtocols() {
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response('forbidden', { status: 403 });
    try {
      const body = await readFile(file);
      return new Response(body, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });

  // tkvideo://v/<персонаж>/<имя ролика без .mp4> — берём из кэша или скачиваем один раз
  protocol.handle('tkvideo', async (req) => {
    const u = new URL(req.url);
    const [, char, name] = decodeURIComponent(u.pathname).split('/');
    if (!char || !name || !/^[a-z0-9-]+$/.test(char) || name.includes('..') || /[\\/]/.test(name)) return new Response('bad', { status: 400 });
    const dir = path.join(dataDir, 'videos', char);
    const safeName = name.replace(/[^a-zA-Z0-9+,._~-]/g, '_') + '.mp4';
    const file = path.join(dir, safeName);
    try {
      const body = await readFile(file);
      return new Response(body, { headers: { 'content-type': 'video/mp4' } });
    } catch {
      /* нет в кэше */
    }
    const remote = `${VIDEO_CDN}/${char}/${encodeURIComponent(name + (VIDEO_POSTFIX[char] ?? '-426'))}.mp4`;
    try {
      const res = await net.fetch(remote);
      if (!res.ok) return new Response('not found', { status: 404 });
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir(dir, { recursive: true });
      await writeFile(file, buf);
      return new Response(buf, { headers: { 'content-type': 'video/mp4' } });
    } catch {
      return new Response('offline', { status: 502 });
    }
  });
}

/** Откуда брать картинку игры: окно TEKKEN 8 или целый монитор */
async function visionSources(kinds: VisionSource['kind'][] = ['window', 'screen']): Promise<VisionSource[]> {
  // картинки-превью не нужны (размер 0) — так перебор окон почти ничего не стоит
  const list = await desktopCapturer.getSources({ types: kinds, thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
  const displays = screen.getAllDisplays();
  const out: VisionSource[] = [];
  for (const s of list) {
    if (s.id.startsWith('window:')) {
      // окно игры, но не наше собственное («TekkenRU — справочник Tekken 8»)
      if (/tekken/i.test(s.name) && !/tekkenru|справочник/i.test(s.name)) out.push({ id: s.id, kind: 'window', name: s.name });
    } else {
      const d = displays.find((x) => String(x.id) === s.display_id);
      const idx = displays.findIndex((x) => String(x.id) === s.display_id);
      out.push({
        id: s.id,
        kind: 'screen',
        name: `Монитор ${idx + 1}${d ? ` (${d.size.width}×${d.size.height})` : ''}${d && d.id === screen.getPrimaryDisplay().id ? ', основной' : ''}`,
        displayId: s.display_id,
        appHere: Boolean(win && d && screen.getDisplayMatching(win.getBounds()).id === d.id),
      });
    }
  }
  return out;
}

let lastBaseUpdate: BaseUpdateResult | null = null;
let baseUpdateRunning: Promise<BaseUpdateResult> | null = null;
/** Сверить базу с GitHub и докачать изменённое; открытым экранам сказать, что данные обновились */
function runBaseUpdate(): Promise<BaseUpdateResult> {
  if (baseUpdateRunning) return baseUpdateRunning;
  baseUpdateRunning = updateBase((u) => net.fetch(u, { headers: { 'User-Agent': 'TekkenRU' } }), baseDir, store.updDir)
    .then((r) => {
      lastBaseUpdate = r;
      if (r.updated.length) {
        for (const f of r.updated) {
          const m = f.match(/^(?:characters|flows)\/([a-z0-9-]+)\.json$/);
          if (m) win?.webContents.send('character-updated', m[1]);
        }
        win?.webContents.send('base-updated', r);
      }
      return r;
    })
    .finally(() => (baseUpdateRunning = null));
  return baseUpdateRunning;
}

app.whenReady().then(async () => {
  await store.init();
  raw = (await store.getSettingsRaw()) as RawSettings;
  registerProtocols();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  ipcMain.handle('getCharacters', async () => (await store.getCharacters()) ?? []);
  ipcMain.handle('getCharacter', (_e, id: string) => store.getCharacter(id));
  ipcMain.handle('getSettings', () => settings());
  ipcMain.handle('saveSettings', async (_e, patch: Partial<Settings> & { apiKey?: string }) => {
    if (patch.apiKey !== undefined) {
      const key = patch.apiKey.trim();
      delete raw.apiKeyEnc;
      delete raw.apiKeyPlain;
      if (key) {
        if (safeStorage.isEncryptionAvailable()) raw.apiKeyEnc = safeStorage.encryptString(key).toString('base64');
        else raw.apiKeyPlain = key;
      }
    }
    if (patch.model) raw.model = patch.model;
    if (patch.alwaysOnTop !== undefined) {
      raw.alwaysOnTop = patch.alwaysOnTop;
      win?.setAlwaysOnTop(patch.alwaysOnTop, 'floating');
    }
    if (patch.zoom !== undefined) {
      raw.zoom = Math.min(2, Math.max(0.6, patch.zoom));
      win?.webContents.setZoomFactor(raw.zoom);
    }
    if (patch.concurrency !== undefined) raw.concurrency = Math.min(8, Math.max(1, Math.round(patch.concurrency)));
    if (patch.visionEnabled !== undefined) raw.visionEnabled = patch.visionEnabled;
    if (patch.visionSource !== undefined) raw.visionSource = patch.visionSource;
    if (patch.myMain !== undefined) raw.myMain = patch.myMain;
    if (patch.myNick !== undefined) raw.myNick = patch.myNick.trim();
    if (patch.autoSwitch !== undefined) raw.autoSwitch = patch.autoSwitch;
    if (patch.autoBaseUpdate !== undefined) raw.autoBaseUpdate = patch.autoBaseUpdate;
    await persist();
    return settings();
  });
  ipcMain.handle('startUpdate', (_e, opts) => {
    void job.run(opts ?? {});
  });
  ipcMain.handle('cancelUpdate', () => job.cancel());
  ipcMain.handle('getJob', () => job.state);
  ipcMain.handle('openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url);
  });
  ipcMain.handle('openDataFolder', () => shell.openPath(dataDir));
  ipcMain.handle('visionSources', (_e, kinds?: VisionSource['kind'][]) =>
    visionSources(Array.isArray(kinds) && kinds.every((k) => k === 'window' || k === 'screen') && kinds.length ? kinds : undefined),
  );
  ipcMain.handle('getMeta', () => store.getMeta());
  // ---- обновление базы и проверка новой версии программы (GitHub) ----
  ipcMain.handle('checkBaseUpdate', () => runBaseUpdate());
  ipcMain.handle('lastBaseUpdate', () => lastBaseUpdate);
  ipcMain.handle('checkAppRelease', () => checkAppRelease((u) => net.fetch(u, { headers: { 'User-Agent': 'TekkenRU' } }), app.getVersion()));
  ipcMain.handle('getMatchup', (_e, id: string) => store.getMatchup(String(id)));
  ipcMain.handle('saveMatchup', (_e, id: string, m: unknown) =>
    store.saveMatchup(String(id), m && typeof m === 'object' && Array.isArray((m as { items?: unknown }).items) ? (m as never) : null),
  );
  ipcMain.handle('getUserCombos', (_e, id: string) => store.getUserCombos(String(id)));
  ipcMain.handle('saveUserCombos', (_e, id: string, list: unknown) => store.saveUserCombos(String(id), Array.isArray(list) ? list : []));
  ipcMain.handle('saveMeta', (_e, patch) => store.saveMeta(patch));
  // Переносная копия: кладём базу (гайды, фреймдату, видео) рядом с программой —
  // тогда папку с программой можно скопировать на другой компьютер целиком
  ipcMain.handle('makePortable', async () => {
    const target = path.join(exeDir, 'data');
    if (path.resolve(target) !== path.resolve(dataDir)) {
      await cp(dataDir, target, { recursive: true, force: true, filter: (src) => !/[\\/](debug)([\\/]|$)/.test(src) });
    }
    await shell.openPath(exeDir);
    return { folder: exeDir, sameAsBefore: path.resolve(target) === path.resolve(dataDir) };
  });

  createWindow();

  // база с GitHub: тихо проверяем через несколько секунд после запуска
  if (raw.autoBaseUpdate ?? true) {
    win?.webContents.once('did-finish-load', () => setTimeout(() => void runBaseUpdate(), 4000));
  }

  // Num − работает из любого окна (в том числе из игры): «проверь соперника заново»
  try {
    if (!globalShortcut.register('numsub', () => win?.webContents.send('vision-force'))) console.warn('Num − занята другой программой');
  } catch (e) {
    console.warn('globalShortcut', e);
  }

  // Один раз дотянуть фреймдату со ссылками на видео (ключ не нужен)
  const sample = await store.getCharacter('lili');
  const hasVideo = Boolean(sample?.frames?.moves?.some((m) => m.video));
  if (!hasVideo && (raw.framesVersion ?? 1) < FRAMES_VERSION && (await store.getCharacters())?.length) {
    win?.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        await job.run({ framesOnly: true });
        raw.framesVersion = FRAMES_VERSION;
        await persist();
      }, 1500);
    });
  } else if (!raw.framesVersion) {
    raw.framesVersion = FRAMES_VERSION;
    void persist();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());
