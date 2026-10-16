// Общие типы для главного процесса Electron и интерфейса

export type TabId = 'overview' | 'combos' | 'moves' | 'tactics' | 'counter' | 'cheatsheet';

export const TAB_TITLES: Record<TabId | 'frames', string> = {
  overview: 'Обзор',
  combos: 'Комбо',
  moves: 'Приёмы',
  tactics: 'Тактика',
  counter: 'Против него',
  cheatsheet: 'Шпаргалка',
  frames: 'Фреймдата',
};

/** Кусок контента. Внутри строк команды обёрнуты в `обратные кавычки`. */
export type Block =
  | { type: 'text'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'move'; cmd: string; label?: string; text: string }
  | { type: 'combo'; starters: string[]; route: string; note?: string }
  | { type: 'table'; columns: string[]; rows: string[][] };

export type Section = { tab: TabId; title: string; blocks: Block[] };

export type StanceInfo = { abbr: string; name: string; ru: string };

export type SourceKind = 'guide' | 'meta' | 'antistrat';

export type TranslatedPage = {
  source: SourceKind;
  url: string;
  /** хэш исходного текста — если не поменялся, повторно не переводим */
  hash: string;
  model: string;
  translatedAt: string;
  /** язык исходника: 'ru' если взяли официальный русский перевод */
  sourceLang: 'en' | 'ru';
  author?: string;
  summary?: string;
  stances?: StanceInfo[];
  sections: Section[];
};

export type Move = {
  id: string;
  command: string;
  name?: string;
  hitLevel: string;
  damage: string;
  startup: string;
  block: string;
  hit: string;
  counterHit: string;
  notes: string;
  notesRu?: string;
  tags?: Record<string, string>;
  transitions?: string[];
  recovery?: string;
  recoveryState?: string;
  /** имя ролика на сервере tekkendocs, например t8-p2-lili-df+3 */
  video?: string;
};

export type FrameData = { moves: Move[]; stances: string[]; fetchedAt: string };

export type CharacterInfo = { id: string; displayName: string; avatar: string; hasGuide?: boolean };

/** ---------- Наступательные цепочки (схемы «если — то») ---------- */
/** Что делаешь ты. Команды в тексте — в `обратных кавычках`. */
export type FlowNode = {
  /** команда в нотации tekkendocs: df3, b1,4, ss4, BT d2 */
  cmd?: string;
  /** короткий заголовок: «Плюсовой мид», «Бросок» */
  label?: string;
  /** пояснение простыми словами */
  text?: string;
  /** итог: good — выгодно, risk — рискованно, info — просто справка */
  outcome?: 'good' | 'risk' | 'info';
  /** что дальше — в зависимости от реакции соперника */
  next?: FlowBranch[];
};
/** Ветка: «если он …» → что делаешь ты */
export type FlowBranch = { if: string; then: FlowNode };
export type Flow = {
  title: string;
  /** когда применять: «вплотную после твоего df3 на блоке» */
  when: string;
  root: FlowNode;
  note?: string;
};
export type FlowSet = {
  charId: string;
  updatedAt: string;
  sources: { title: string; url: string }[];
  flows: Flow[];
};

/** Своё комбо из конструктора (хранится в данных пользователя, не затирается обновлениями) */
export type UserCombo = {
  id: string;
  title?: string;
  starters: string[];
  /** шаги через « → », как в комбо гайда */
  route: string;
  note?: string;
  /** метки ситуации: «У стены», «После контр-хита»… */
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};

/** Свой список «Опасное у соперника» на экране «против» (порядок = важность) */
export type MatchupItem = {
  cmd: string;
  /** короткая подпись: «Плюсовой мид», «Главный лоу» */
  label?: string;
  /** своё описание; если пусто — берётся текст из гайда */
  text?: string;
};
export type MatchupCustom = { items: MatchupItem[]; updatedAt: string };

export type CharacterData = {
  id: string;
  flows?: FlowSet;
  frames?: FrameData;
  guide?: TranslatedPage;
  meta?: TranslatedPage;
  antistrat?: TranslatedPage;
  errors?: Partial<Record<SourceKind | 'frames', string>>;
};

export type Settings = {
  apiKeySet: boolean;
  apiKeySource: 'settings' | 'env' | 'none';
  model: string;
  alwaysOnTop: boolean;
  zoom: number;
  concurrency: number;
  /** автоопределение соперника по экрану */
  visionEnabled: boolean;
  /** 'auto' или id источника захвата */
  visionSource: string;
  /** мой основной персонаж */
  myMain: string;
  /** мой ник в игре (чтобы понять, на какой я стороне) */
  myNick: string;
  /** переключаться на экран «я против него» автоматически */
  autoSwitch: boolean;
};

/** Сведения о базовых данных: для какой версии игры они актуальны */
export type AppMeta = { gameVersion: string; dataUpdated: string; note?: string };

export type VisionSource = { id: string; kind: 'window' | 'screen'; name: string; displayId?: string; appHere?: boolean };

export type JobState = {
  running: boolean;
  total: number;
  done: number;
  current: string[];
  log: { time: string; level: 'info' | 'warn' | 'error'; text: string }[];
  usage: { input: number; output: number; costUsd: number };
};

/** Автор программы — для копирайта */
export const APP_AUTHOR = 'Зинченко Антон Васильевич';
export const APP_YEAR = 2026;

export const MODELS: { id: string; label: string; inPrice: number; outPrice: number }[] = [
  { id: 'claude-haiku-5-5', label: 'Быстрая модель — дешевле', inPrice: 0.1, outPrice: 0.5 },
  { id: 'claude-sonnet-5-5', label: 'Точная модель — качественнее, дороже', inPrice: 2, outPrice: 10 },
];

export interface TekkenApi {
  getCharacters(): Promise<CharacterInfo[]>;
  getCharacter(id: string): Promise<CharacterData | null>;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings> & { apiKey?: string }): Promise<Settings>;
  startUpdate(opts: { ids?: string[]; force?: boolean; framesOnly?: boolean }): Promise<void>;
  cancelUpdate(): Promise<void>;
  getJob(): Promise<JobState>;
  onJob(cb: (s: JobState) => void): () => void;
  onCharacterUpdated(cb: (id: string) => void): () => void;
  /** глобальная клавиша Num − : проверить соперника заново */
  onVisionForce?(cb: () => void): () => void;
  openExternal(url: string): Promise<void>;
  openDataFolder(): Promise<void>;
  visionSources(kinds?: VisionSource['kind'][]): Promise<VisionSource[]>;
  makePortable(): Promise<{ folder: string; sameAsBefore: boolean }>;
  getMatchup(oppId: string): Promise<MatchupCustom | null>;
  /** null — вернуть автоматический список */
  saveMatchup(oppId: string, m: MatchupCustom | null): Promise<MatchupCustom | null>;
  getUserCombos(charId: string): Promise<UserCombo[]>;
  saveUserCombos(charId: string, list: UserCombo[]): Promise<UserCombo[]>;
  getMeta(): Promise<AppMeta>;
  saveMeta(patch: Partial<AppMeta>): Promise<AppMeta>;
}
