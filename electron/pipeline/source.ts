// Скачивание данных с tekkendocs.com и превращение HTML-страниц в чистый markdown для перевода
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import type { CharacterInfo, FrameData, Move, SourceKind } from '../../shared/types';

export const SITE = process.env.TEKKENDOCS_URL || 'https://tekkendocs.com';

const FALLBACK_IDS = [
  'alisa', 'anna', 'armor-king', 'asuka', 'azucena', 'bob', 'bryan', 'claudio', 'clive', 'devil-jin',
  'dragunov', 'eddy', 'fahkumram', 'feng', 'hwoarang', 'heihachi', 'jack-8', 'jin', 'jun', 'kazuya',
  'king', 'kuma', 'kunimitsu', 'lars', 'law', 'lee', 'leo', 'leroy', 'lidia', 'lili', 'miary-zo',
  'nina', 'panda', 'paul', 'raven', 'reina', 'shaheen', 'steve', 'victor', 'xiaoyu', 'yoshimitsu', 'zafina',
];

const titleCase = (id: string) =>
  id.split('-').map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} — ${url}`);
  }
}

export async function http(url: string, signal?: AbortSignal): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        signal,
        headers: {
          'User-Agent': 'TekkenRU/1.0 (personal offline reader; credits: tekkendocs.com)',
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        },
      });
      if (res.status === 404) throw new HttpError(404, url);
      if (!res.ok) throw new HttpError(res.status, url);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status === 404) throw e;
      if (signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function fetchCharacters(signal?: AbortSignal): Promise<CharacterInfo[]> {
  try {
    const json = JSON.parse(await http(`${SITE}/api/t8/characters`, signal));
    const list = (json.characters ?? []) as { id: string; displayName: string; images?: { largePng?: string; officialLargePng?: string } }[];
    if (list.length) {
      return list.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        avatar: c.images?.officialLargePng ?? `${SITE}/t8/avatars/${c.id}-512.png`,
      }));
    }
  } catch {
    /* используем запасной список */
  }
  return FALLBACK_IDS.map((id) => ({ id, displayName: titleCase(id), avatar: `${SITE}/t8/avatars/${id}-512.png` }));
}

export async function fetchFrameData(id: string, signal?: AbortSignal): Promise<FrameData> {
  const json = JSON.parse(await http(`${SITE}/api/t8/${id}/framedata`, signal));
  const raw = (json.framesNormal ?? []) as Record<string, unknown>[];
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  const moves: Move[] = raw.map((m, i) => ({
    id: str(m.id) || `${id}-${i}`,
    command: str(m.command),
    name: m.name ? str(m.name) : undefined,
    hitLevel: str(m.hitLevel),
    damage: str(m.damage),
    startup: str(m.startup),
    block: str(m.block),
    hit: str(m.hit),
    counterHit: str(m.counterHit),
    notes: str(m.notes),
    tags: (m.tags as Record<string, string>) ?? undefined,
    transitions: (m.transitions as string[]) ?? undefined,
    recovery: m.recovery ? str(m.recovery) : undefined,
    recoveryState: m.recoveryState ? str(m.recoveryState) : undefined,
    video: videoName(id, m),
  }));
  return { moves, stances: (json.stances ?? []) as string[], fetchedAt: new Date().toISOString() };
}

/** Имя ролика: "File:t8-p2-lili-df+3.mp4" → "t8-p2-lili-df+3"; у Мэри Дзо имена строятся из названия приёма */
function videoName(charId: string, m: Record<string, unknown>): string | undefined {
  const v = typeof m.video === 'string' ? m.video : '';
  if (v) return v.replace(/^File:/, '').replace(/^\//, '').replace(/\.mp4$/i, '') || undefined;
  if (charId === 'miary-zo' && typeof m.id === 'string') {
    const part = m.id.split('-').pop() ?? '';
    const name = part.toLowerCase().replace(/ /g, '-').replace(/[()]/g, '').replace(/\*/g, 'x').replace(/[:#]/g, 'j');
    return name ? `t8-p2-${charId}-${name}` : undefined;
  }
  return undefined;
}

export function pageUrl(id: string, kind: SourceKind, lang?: 'ru') {
  const path = kind === 'guide' ? 'guide' : kind;
  return `${SITE}/t8/${id}/${path}${lang ? `?lang=${lang}` : ''}`;
}

const cyrillicShare = (s: string) => {
  const letters = s.match(/[a-zA-Zа-яА-ЯёЁ]/g) ?? [];
  if (!letters.length) return 0;
  return letters.filter((c) => /[а-яА-ЯёЁ]/.test(c)).length / letters.length;
};

export type PageSource = { url: string; markdown: string; lang: 'en' | 'ru'; author?: string };

/** Скачивает страницу раздела. Для гайда сначала пробует официальный русский перевод. */
export async function fetchPage(id: string, kind: SourceKind, signal?: AbortSignal): Promise<PageSource | null> {
  const tryUrls = kind === 'guide' ? [pageUrl(id, kind, 'ru'), pageUrl(id, kind)] : [pageUrl(id, kind)];
  for (const url of tryUrls) {
    let html: string;
    try {
      html = await http(url, signal);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) continue;
      throw e;
    }
    const { markdown, author } = htmlToMarkdown(html, id);
    if (markdown.length < 200) continue;
    const lang = cyrillicShare(markdown) > 0.3 ? 'ru' : 'en';
    if (url.includes('lang=ru') && lang !== 'ru') continue; // перевода нет — сайт отдал английский, возьмём обычный URL
    return { url, markdown, lang, author };
  }
  return null;
}

const turndown = () => {
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
  td.addRule('moveLinks', {
    filter: (node) => node.nodeName === 'A' && Boolean(node.getAttribute('href')),
    replacement: (content, node) => {
      const href = (node as unknown as { getAttribute(n: string): string }).getAttribute('href') ?? '';
      const text = content.replace(/\s+/g, ' ').trim();
      if (!text) return '';
      // ссылка на страницу приёма → это команда, помечаем обратными кавычками
      if (/^(https?:\/\/tekkendocs\.com)?\/t8\/[a-z0-9-]+\/[^/?#]+$/i.test(href) && !/\/(guide|meta|antistrat|flashcard)$/i.test(href)) {
        return '`' + text.replace(/`/g, '').replace(/^\*\*|\*\*$/g, '') + '`';
      }
      if (/^https?:\/\//.test(href)) return `[${text}](${href})`;
      return text;
    },
  });
  td.addRule('tableCellsAsPipes', {
    filter: ['td', 'th'],
    replacement: (content) => ` ${content.replace(/\n+/g, ' ').trim()} |`,
  });
  td.addRule('tableRows', {
    filter: 'tr',
    replacement: (content, node) => {
      const isHead = (node as unknown as { querySelector(s: string): unknown }).querySelector('th') !== null;
      const cells = (content.match(/\|/g) ?? []).length;
      return `\n|${content}` + (isHead ? `\n|${' --- |'.repeat(cells)}` : '');
    },
  });
  td.addRule('tableWrap', {
    filter: ['table', 'thead', 'tbody', 'tfoot'],
    replacement: (content) => `\n${content}\n`,
  });
  return td;
};

export function htmlToMarkdown(html: string, charId: string): { markdown: string; author?: string } {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, img, picture, video, iframe, nav, header, footer, button, form, link, meta').remove();

  // автор гайда: элемент, в собственном тексте которого есть "Written by"/"Автор", и первая ссылка рядом
  let author: string | undefined;
  $('body *').each((_, el) => {
    if (author) return false;
    const own = $(el)
      .contents()
      .filter((__, n) => n.type === 'text')
      .text();
    if (!/Written by|Автор|Написал/i.test(own)) return;
    const a = $(el).find('a').first().text().trim() || $(el).nextAll().find('a').first().text().trim() || $(el).next('a').text().trim();
    if (a && a.length < 40) author = a;
  });

  const root = $('main').length ? $('main').first() : $('body');
  let md = turndown().turndown(root.html() ?? '');

  // начинаем с заголовка H1, обрезаем подвал
  const h1 = md.search(/^# /m);
  if (h1 > 0) md = md.slice(h1);
  for (const stop of ['Tekkendocs is an independent website', '- [Discord](https://discord.gg/wnZM6zWswH', '[Feature Request]']) {
    const at = md.indexOf(stop);
    if (at > 0) md = md.slice(0, at);
  }
  md = md
    .replace(/^\s*(Show video|Показать видео|Hide video)\s*$/gim, '')
    .replace(/\[\]\([^)]*\)/g, '')
    .replace(/^\s*\[?Edit\]?(\([^)]*\))?\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  void charId;
  return { markdown: md, author };
}
