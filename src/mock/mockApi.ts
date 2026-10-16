// Демо-данные для разработки интерфейса в обычном браузере (в собранном приложении не используются)
import type { CharacterData, JobState, Settings, TekkenApi } from '../../shared/types';

const mv = (command: string, hitLevel: string, startup: string, block: string, hit: string, counterHit: string, notes = '', tags: Record<string, string> = {}, name?: string) => ({
  id: 'Lili-' + command, command, name, hitLevel, damage: '20', startup, block, hit, counterHit, notes, notesRu: notes, tags,
});

const lili: CharacterData = {
  id: 'lili',
  frames: {
    fetchedAt: new Date().toISOString(),
    stances: ['H', 'ws', 'SS', 'FC', 'BT', 'DEW', 'RAB'],
    moves: [
      mv('df+3', 'm', 'i20~22', '+3c', '+8c', '+19a', 'Сажает в присед при блоке', {}, 'Submissive Heel'),
      mv('b+1', 'm', 'i17', '-8', '+2', '+8', 'Удерживать f — переход в DEW', {}, 'Rising Moon'),
      mv('d+1,2', 'L,h', 'i18~19', '-8', '+3', '+5', 'Натуральная связка', {}, 'Dew Glide'),
      mv('3,1', 'm,m', 'i15~16', '-13', '+14', '', 'Heat Engager\nHeat Dash +5', { he: '' }, 'Peacock Waltz'),
      mv('df+4,4', 'm,L', 'i13~14', '-13', '-2', '+8', '', {}, 'Dominating Heel'),
      mv('d+3', 'L', 'i19~20', '-12', '+1', '+5c', 'Уходит от хаев', { cs: '6~' }, 'Thorn Whip'),
      mv('f+4', 'm', 'i17', '-9', '+7', '+57a', '', {}, 'Rose Thorn'),
      mv('f,F+4', 'L', 'i22~23', '-12', '+4', '', '', {}, 'Root of Evil'),
      mv('BT.d+2', 'L', 'i16', '-12', '+5c', '+14d', 'Уходит от хаев', {}, 'Mistral'),
      mv('BT.1,2', 'h,h', 'i8', '-6', '+8', '', '', {}),
      mv('df+2', 'm', 'i15', '-13', '+33a', '', 'Лаунчер', {}, 'Cyclone'),
      mv('ws3', 'm', 'i15', '-13', '+28a', '', 'Торнадо-лаунчер', { trn: '' }),
      mv('qcf+3+4', 'h,h', 'i12~14', '+6', '+17g', '', '', {}, 'Cloisonne'),
      mv('2,4', 'h,h', 'i10', '-2~+2', '+24a', '', '', { bbr: '' }, 'Bed Time'),
      mv('d+3+4', 'm', 'i17~21', '-21', '+45a', '', 'Уходит от хаев', {}, 'Matterhorn'),
    ],
  },
  guide: {
    source: 'guide', url: 'https://tekkendocs.com/t8/lili/guide', hash: 'demo', model: 'demo', translatedAt: new Date().toISOString(), sourceLang: 'en', author: 'DewGlider',
    summary: 'Демо-текст. Лили — персонаж средней дистанции: дальние линейные миды вроде `df3+4` и `ss4`, сильные контр-хиты и давление спиной (`BT d+2`, `BT 3`).',
    stances: [
      { abbr: 'DEW', name: 'Dew Glide', ru: 'скольжение вперёд; из `b1` удерживая f' },
      { abbr: 'RAB', name: 'Feisty Rabbit', ru: 'прыжки-«кролик» после `b3` / `b4`, в Heat даёт 50/50' },
      { abbr: 'BT', name: 'Back Turned', ru: 'спиной к сопернику — быстрые лоу и миды' },
    ],
    sections: [
      { tab: 'overview', title: 'Сильные стороны', blocks: [{ type: 'bullets', items: ['Лучший сайдстеп в игре.', 'Мощные одиночные миды: `df3`, `f4`, `f3`.', 'Опасные подъёмы в Heat через Feisty Rabbit (`b3` / `b4`).'] }] },
      { tab: 'overview', title: 'Слабые стороны', blocks: [{ type: 'bullets', items: ['Плохой трекинг — ключевые приёмы легко обойти сайдстепом.', 'Многие приёмы около 20 кадров — её легко перебить быстрым контр-хитом.'] }] },
      { tab: 'moves', title: 'Топ приёмов', blocks: [
        { type: 'move', cmd: 'df3', label: 'Контр-хит лаунчер, мид', text: 'Плюсовой мид: после блока соперник в присяде. Дальше миксуй `df4` и лоу `d3`.' },
        { type: 'move', cmd: 'b1', label: 'Безопасное давление', text: 'Удерживай вперёд — уйдёшь в DEW и будешь всего −2. На CH гарантирует `qcf2,1`.' },
        { type: 'move', cmd: 'd1,2', label: 'Лоу-хай связка', text: 'Быстрый незаметный лоу, +3 при попадании.' },
        { type: 'move', cmd: 'DEW 3+4 (qcf+3+4)', label: 'Плюсовой хай', text: '+6 на блоке, уходит и от хаев, и от лоу в разные моменты.' },
      ] },
      { tab: 'combos', title: 'Комбо', blocks: [
        { type: 'combo', starters: ['uf3'], route: 'df2 → f2,3 → df3+4 → bt1,2 T! → u1+2 (Hold) → qcf1,4' },
        { type: 'combo', starters: ['df2'], route: 'f2,3 → ff3f3+4 → df3+4 → bt1,2 T! → u1+2 (Hold) → qcf3' },
        { type: 'combo', starters: ['ws3', 'db4', 'low parry'], route: 'qcf3 → df1 → b2,1f3+4 → WR1+2 → qcf1,4' },
        { type: 'combo', starters: ['CH f4', 'CH qcf1,(2)', 'CH 1,1 (3)'], route: 'qcf3 → qcf3 → 3,2f3+4 → WR1+2 → qcf1,4', note: 'После контр-хита' },
      ] },
      { tab: 'tactics', title: 'Наказания', blocks: [{ type: 'table', columns: ['Кадры', 'Приём', 'Зачем'], rows: [['10f', '`1,2`', 'Джеб-связка, оставляет +8'], ['12f', '`f2,3`', 'Дальний нокдаун / удар в стену'], ['13f', '`b2,1`', 'Миксап в DEW или спиной, +7'], ['15f', '`3,1`', 'Heat Engager на дистанции']] }] },
      { tab: 'counter', title: 'Как играть против Лили', blocks: [{ type: 'bullets', items: ['Блокируй в основном миды — её лоу неприятные, но не смертельные.', 'Дави быстрыми приёмами с трекингом: её ключевые атаки около 20 кадров.', '`d3+4` наказывай лаунчером — она в −21.'] }] },
    ],
  },
};

const settings: Settings = { apiKeySet: false, apiKeySource: 'none', model: 'claude-haiku-5-5', alwaysOnTop: false, zoom: 1, concurrency: 3, visionEnabled: false, visionSource: 'auto', myMain: 'lili', myNick: '', autoSwitch: true };
const job: JobState = { running: true, total: 168, done: 47, current: ['Lili: гайд', 'Jin: шпаргалка'], log: [{ time: '15:40:02', level: 'info', text: 'Персонажей: 42' }], usage: { input: 410000, output: 120000, costUsd: 0.1 } };

export const mockApi: TekkenApi = {
  getCharacters: async () =>
    ['alisa', 'anna', 'armor-king', 'asuka', 'jin', 'kazuya', 'lili', 'paul', 'xiaoyu'].map((id) => ({ id, displayName: id[0].toUpperCase() + id.slice(1), avatar: '' })),
  // в режиме разработки берём настоящую базу из папки base, если она есть
  getCharacter: async (id) => {
    try {
      const r = await fetch(`/base/characters/${id}.json`);
      if (r.ok) {
        const d = await r.json();
        const f = await fetch(`/base/flows/${id}.json`).catch(() => null);
        if (f?.ok) d.flows = await f.json().catch(() => undefined);
        return d;
      }
    } catch {
      /* нет базы — показываем пример */
    }
    return id === 'lili' ? lili : { id };
  },
  getSettings: async () => settings,
  saveSettings: async (p) => Object.assign(settings, p),
  startUpdate: async () => {},
  cancelUpdate: async () => {},
  getJob: async () => job,
  onJob: () => () => {},
  onCharacterUpdated: () => () => {},
  openExternal: async () => {},
  openDataFolder: async () => {},
  visionSources: async () => [],
  makePortable: async () => ({ folder: '', sameAsBefore: false }),
  getMatchup: async (id) => JSON.parse(localStorage.getItem('mock-mu-' + id) || 'null'),
  saveMatchup: async (id, m) => (m && m.items.length ? localStorage.setItem('mock-mu-' + id, JSON.stringify(m)) : localStorage.removeItem('mock-mu-' + id), m),
  getUserCombos: async (id) => JSON.parse(localStorage.getItem('mock-combos-' + id) || '[]'),
  saveUserCombos: async (id, list) => (localStorage.setItem('mock-combos-' + id, JSON.stringify(list)), list),
  getMeta: async () => ({ gameVersion: 'Ver. 3.02.01', dataUpdated: '2026-10-10' }),
  saveMeta: async (p) => ({ gameVersion: 'Ver. 3.02.01', dataUpdated: '2026-10-10', ...p }),
};
