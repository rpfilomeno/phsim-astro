export type FeedItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string;
};

export type NewsItem = {
  slug: string;
  tag: string;
  title: string;
  summary: string;
  headline: string;
  url: string;
  publishedAt: string;
};

/** What the LLM must return for one article. */
export type WireDraft = {
  tag: string;
  title: string;
  summary: string;
};

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');

/** Pull <item> entries out of an RSS 2.0 document. */
export function parseFeedItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const block of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const inner = block[1];
    const pick = (tag: string) => {
      const m = inner.match(
        new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`),
      );
      return m ? decodeEntities(m[1].trim()) : '';
    };
    const title = pick('title');
    const link = pick('link');
    if (title && link) {
      items.push({ title, link, pubDate: pick('pubDate'), description: pick('description') });
    }
  }
  return items;
}

/** Last path segment of an article URL, minus the query string. */
export function slugFromUrl(url: string): string {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'item';
}

/** Parse the LLM reply: plain JSON, ```json fences, or JSON buried in prose. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error(`no JSON object in LLM reply: ${text.slice(0, 120)}`);
  }
  candidate = candidate.slice(start, end + 1);
  // Fix common LLM JSON issues: unquoted property names
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Try quoting unquoted keys: word followed by colon
    const fixed = candidate.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    return JSON.parse(fixed) as T;
  }
}

export type DamLevel = {
  level: number;
  nhwl: number;
  ruleCurve: number;
  observedAt: string;
};

export type HistoryBorn = { title: string; body: string; url: string };

/** First "born on this day" entry from kahimyang.com/api/today/<YYYY-MM-DD>, HTML stripped. */
export function parseHistoryBorn(data: unknown): HistoryBorn | null {
  const first = Array.isArray(data) ? data[0] : null;
  if (!first || typeof first !== 'object') return null;
  const r = first as Record<string, unknown>;
  const title = typeof r.news_title === 'string' ? r.news_title.trim() : '';
  const body =
    typeof r.news_first === 'string'
      ? r.news_first
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/\s+([,.;:!?])/g, '$1')
          .trim()
      : '';
  const path = typeof r.news_url === 'string' ? r.news_url : '';
  if (!title || !body) return null;
  return { title, body, url: path ? `https://kahimyang.com${path}` : '' };
}

export type Quake = {
  time: string;
  lat: string;
  lon: string;
  depth: string;
  mag: string;
  location: string;
  url: string;
};

const PHIVOLCS_BASE = 'https://earthquake.phivolcs.dost.gov.ph/';
const cellText = (td: string) => td.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Data rows of the PHIVOLCS "latest earthquake information" table, newest first. */
export function parseQuakes(html: string): Quake[] {
  const out: Quake[] = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const link = row.match(/<a href="(20\d\d_Earthquake_Information[^"]+)"/);
    if (!link) continue;
    const cells = [...row.matchAll(/<td[\s\S]*?<\/td>/gi)].map((m) => cellText(m[0]));
    if (cells.length < 6 || !/^\d+(\.\d+)?$/.test(cells[4])) continue;
    out.push({
      time: cells[0],
      lat: cells[1],
      lon: cells[2],
      depth: cells[3],
      mag: cells[4],
      location: cells[5],
      url: new URL(link[1].replace(/\\/g, '/'), PHIVOLCS_BASE).href,
    });
  }
  return out;
}

/**
 * Extract today's Angat row from PAGASA's dam table (pagasa.dost.gov.ph/flood).
 * Cells after the dam name, in header order: time, RWL, dev-hrs, dev-amt,
 * NHWL, dev-NHWL, rule-curve, dev-rule — so among numeric cells: RWL is [0],
 * NHWL [3], rule curve [5].
 */
export function parseDamLevel(html: string): DamLevel | null {
  const at = html.indexOf('data-id="Angat"');
  if (at === -1) return null;
  const rowStart = html.lastIndexOf('<tr', at);
  const rowEnd = html.indexOf('</tr>', at);
  if (rowStart === -1 || rowEnd === -1) return null;
  const cells = html
    .slice(rowStart, rowEnd)
    .split(/<td[^>]*>/)
    .slice(1)
    .map((c) => c.replace(/<[^>]+>/g, '').trim());
  const nums = cells.filter((c) => /^-?\d+(\.\d+)?$/.test(c)).map(Number);
  const observedAt = html.match(/<h5 class="pull-right">([^<]+)<\/h5>/)?.[1]?.trim() ?? '';
  const [level, nhwl, ruleCurve] = [nums[0], nums[3], nums[5]];
  if (!level || !nhwl || !ruleCurve || level < 50 || nhwl < 50) return null;
  return { level, nhwl, ruleCurve, observedAt };
}
