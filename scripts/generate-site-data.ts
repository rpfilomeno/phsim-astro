import { writeFileSync, readFileSync } from 'node:fs';
import { stringify, parse } from 'yaml';

// Load .env if present (Node 20.12+). No-op if the file doesn't exist.
try { process.loadEnvFile(); } catch { /* no .env */ }
import {
  extractJson,
  parseDamLevel,
  parseFeedItems,
  parseHistoryBorn,
  parseQuakes,
  slugFromUrl,
  type DamLevel,
  type FeedItem,
  type NewsItem,
  type Quake,
} from '../src/lib/newsFeed.ts';
// patches module no longer imported — categories and tag classes are dynamic

const NEWSINFO_URL = 'https://newsinfo.inquirer.net/';
const FIRECRAWL_ENDPOINT = 'https://api.firecrawl.dev/v1/scrape';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
let geminiKeyCursor = 0;

function geminiKeys(): string[] {
  const raw = process.env.GEMINIKEYS ?? '';
  return raw.split(/[\s,]+/).map((k) => k.trim()).filter(Boolean);
}

let cachedFlashModels: string[] | null = null;

async function discoverFlashModels(key: string): Promise<string[]> {
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key),
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const found = (data?.models ?? [])
      .filter((m) => {
        const methods = m?.supportedGenerationMethods;
        if (Array.isArray(methods) && !methods.includes('generateContent')) return false;
        const name = String(m?.name ?? '');
        // Exclude TTS and other non-text models
        if (/tts|audio|vision|image/i.test(name)) return false;
        return true;
      })
      .map((m) => String(m?.name ?? '').replace(/^models\//, ''))
      .filter((n) => /gemini/i.test(n) && /flash/i.test(n));
    found.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
    return [...new Set(found)];
  } catch {
    return [];
  }
}

async function flashModels(): Promise<string[]> {
  if (cachedFlashModels && cachedFlashModels.length) return cachedFlashModels;
  for (const key of geminiKeys()) {
    const found = await discoverFlashModels(key);
    if (found.length) {
      cachedFlashModels = found;
      console.log('[site] discovered gemini flash models: ' + found.join(', '));
      return found;
    }
  }
  console.warn('[site] could not discover gemini models; falling back to built-in list');
  return GEMINI_MODELS;
}
const FX_ENDPOINT = 'https://api.frankfurter.dev/v1/latest?base=USD&quotes=PHP';
const PAGASA_ENDPOINT = 'https://pagasa.dost.gov.ph/flood';
const WEATHER_ENDPOINT = 'https://wttr.in/manila/?format=j1';
const HISTORY_ENDPOINT = 'https://kahimyang.com/api/today';
const QUAKE_ENDPOINT = 'https://earthquake.phivolcs.dost.gov.ph/';
const PHILIPPINE_STOCKS_URL = 'https://www.pse.com.ph/';
const LIMIT = 8;
const NEWS_OUTPUT_DIR = new URL('../src/content/news/', import.meta.url);
const SITE_OUTPUT = new URL('../src/content/siteData/site-data.md', import.meta.url);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const NEWS_SYSTEM = `You write for "Midgarts PH", a satirical Ragnarok Online-style portal that reframes real news as MMORPG server bulletins for the Philippine "Republic Server Ver 7107.25".
Given a news article, reply with ONE JSON object and nothing else:
{"tag": "2-3 UPPERCASE WORDS category, e.g. TRAFFIC DEBUFF, AGRI-ECONOMY, WORLD BOSS, HEAT INDEX, SERVER POLITICS", "title": "satirical RO-flavored headline, max 14 words", "summary": "1-2 sentences, max 280 characters"}
Rules: stay factually faithful — never invent names, figures or events. Philippine news reads as a local server event; world news as a cross-server event. Use RO vocabulary (debuff, nerf, MVP, guild, GM) where it fits. No markdown, no commentary, JSON only.`;

const PATCH_SYSTEM = `You write patch notes for "Midgarts PH", a satirical Ragnarok Online-style portal that reframes Philippine news as MMORPG patch notes for "Republic Server Ver 7107.25".
You receive today's stories plus live data (FX rate, weather, earthquakes, history). Select up to 5 about everyday Philippine livelihood topics: traffic/transport, agriculture & food prices, extreme heat/weather, utilities (power/water), pop culture/events, or inspired by the live data (weather, quakes, macro). Ignore politics, crime, world news and celebrity gossip.
For each selected story output one object:
{"category": "short lowercase slug like transport, economy, heat, utilities, culture, or any relevant topic", "tag": "2-3 UPPERCASE WORDS label like WARP GATES, ECONOMY, WEATHER SETTINGS", "code": "short agency-style code like LTFRB-2025", "title": "satirical patch title, max 18 words", "body": "2-3 sentences as an official server change notice using RO terminology", "classes": ["2-4 affected RO job classes"], "stats": [{"label": "max 5 words", "value": "e.g. -15% Max Durability", "note": "optional, max 12 words", "tone": "error|primary|tertiary, optional"}], "notice": "optional GM notice sentence", "gmNote": "1-2 satirical sentences signed like - GM_Name (use realistic Filipino GM names: GM_Kuya, GM_Ate_Maria, GM_Tatang_Jose, GM_Lola_Rosa, GM_Tito_Pedro, GM_Kapitan_Rico, GM_Bayani, GM_Lakan, GM_Datu, GM_Juan, GM_Maria, GM_Carlo, GM_Ana, GM_Pedro, GM_Rosa)"}
Reply {"patches": [...]} with JSON only, or {"patches": []} if nothing fits. Invent game mechanics, never facts.`;

const NOTICE_SYSTEM = `You write emergency ticker notices for "Midgarts PH", a satirical Ragnarok Online-style portal about Philippine life as an MMORPG server.
Given today's stories, pick the single most urgent transport/weather/disaster/utility story. Reply ONE JSON object:
{"headline": "must start with '[EMERGENCY NOTICE] ', max 12 words", "body": "1-2 sentences, max 260 characters, translating it into commuter/gamer terms"}
If nothing is genuinely urgent, reply {"headline": null}. JSON only, no commentary.`;

const SANCTION_SYSTEM = `You write the GM ban log for "Midgarts PH", a satirical Ragnarok Online-style portal about Philippine life as an MMORPG server.
Given today's stories, write up to 3 sanction entries based ONLY on stories involving real infractions (crime, fixers, fraud, smuggling, public irregularities). Reply ONE JSON object:
{"sanctions": [{"player": "Player: [Snake_Case_Name]" or "Guild: [Name]", "penalty": "PERM BAN | BAN: N DAYS | PENALTY -N M Z", "infraction": "1 factual sentence, satirical framing"}]}
{"sanctions": []} if no story qualifies. Never invent crimes. JSON only.`;

const GVG_SYSTEM = `You write the War of Emperium bulletin for "Midgarts PH", a satirical Ragnarok Online-style portal about Philippine politics as guild warfare.
Given today's stories, pick the top politics/governance story. Reply ONE JSON object:
{"title": "siege/probe framing, max 10 words", "label": "2-5 UPPERCASE WORDS badge", "body": "2-3 sentences as a guild siege bulletin, faithful to the story"}
{"title": null} if no politics story fits. JSON only.`;

const REALM_SYSTEM = `You write the realm status bulletin for "Midgarts PH", a satirical Ragnarok Online-style portal: three Philippine island-group servers.
Given today's stories, assign each server a status reflecting its most relevant story (or a routine status). Reply ONE JSON object with exactly three entries:
{"statuses": [{"region": "Luzon", "status": "[UPPERCASE - PHRASE]"}, {"region": "Visayas", "status": "..."}, {"region": "Mindanao", "status": "..."}]}
Each status: bracketed, max 4 words inside the brackets. JSON only.`;

const EXAMPLE_PATCH = {
  category: 'economy',
  code: 'DA-ONION',
  title: 'Red Onion & Rice Market Price Floor Exploit Fixed; Divisoria Vending Caps Imposed',
  body: 'Smuggled Red Onion items from foreign servers discovered stored inside Cold Storage dungeons in Subic & Manila Harbor. Department of Agriculture GMs impose strict price caps on Sinangag & Sisig culinary consumables across all Divisoria street vendors.',
  classes: ['Merchant', 'Alchemist', 'Blacksmith'],
  stats: [
    { label: 'Market Cost (Divisoria NPC)', value: '800 Zeny each', note: '+300% inflation vs. base vendor price', tone: 'error' },
    { label: 'Farm Harvest Drop Rate', value: '0.02% base', note: 'Nueva Ecija map', tone: 'error' },
  ],
  notice: "Unregistered 'Colorum' carts caught ferrying Novices will be impounded.",
  gmNote: 'We are nerfing the cartel, not the farmers. - GM_Tatang_Jose',
};

type WireDraft = { tag?: string; title?: string; summary?: string };
type RawPatch = {
  category?: string; code?: string; title?: string; body?: string;
  classes?: string[]; stats?: { label?: string; value?: string; note?: string; tone?: string }[];
  notice?: string; gmNote?: string;
};
type Stat = { label: string; value: string; note?: string; tone?: 'error' | 'primary' | 'tertiary' };
type GeneratedPatch = {
  category: string; tag: string; tagClass: string; code: string; title: string;
  body: string; classes: string[]; stats: Stat[]; notice?: string; gmNote: string;
};
type Notice = { headline: string; body: string };
type Sanction = { player: string; penalty: string; infraction: string };
type Gvg = { title: string; label: string; body: string };
type RealmStatus = { region: string; status: string };
type Macro = { usdRate: number; usdDate: string; angat: DamLevel | null };
type Weather = { temp: number; feels: number; humidity: number; desc: string; observedAt: string };
type HistoryBorn = { title: string; body: string; url: string };
type StockMover = { ticker: string; change: string };
type Stocks = { gainer: StockMover | null; loser: StockMover | null };

/** Shape of the previous run's siteData.ts — used as the stale-data cache. */
type Previous = {
  generatedAt: string;
  asteroid: { name: string; diameter: number; missDistance: number; velocity: number; hazardous: boolean; approachDate: string; url: string } | null;
  notice: Notice | null;
  sanctions: Sanction[];
  gvg: Gvg | null;
  realmStatuses: RealmStatus[] | null;
  macro: Macro | null;
  weather: Weather | null;
  history: HistoryBorn | null;
  quakes: Quake[] | null;
  stocks: Stocks | null;
};

async function llmJson<T>(system: string, user: string, maxTokens: number): Promise<T> {
  const keys = geminiKeys();
  if (keys.length === 0) throw new Error('GEMINIKEYS env var is empty or unset');

  let lastErr = '';
  const models = await flashModels();
  for (const model of models) {
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const key = keys[(geminiKeyCursor + attempt) % keys.length];
      try {
        const res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
              generationConfig: {
                maxOutputTokens: maxTokens,
                responseMimeType: 'application/json',
                temperature: 0.7,
              },
            }),
            signal: AbortSignal.timeout(120_000),
          },
        );

        if (res.status === 429) {
          lastErr = 'gemini ' + model + ' rate-limited (key ...' + key.slice(-6) + ')';
          continue;
        }
        if (res.status === 503 || res.status === 500 || res.status === 404) {
          lastErr = 'gemini ' + model + ' HTTP ' + res.status;
          break;
        }
        if (!res.ok) {
          const body = (await res.text()).slice(0, 300);
          throw new Error('gemini ' + model + ' HTTP ' + res.status + ': ' + body);
        }

        const data = await res.json();
        const text =
          data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
        if (!text) {
          const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? 'no content';
          throw new Error('gemini ' + model + ' returned no content (' + reason + ')');
        }
        geminiKeyCursor = (geminiKeyCursor + attempt) % keys.length;
        return extractJson<T>(text);
      } catch (err) {
        const msg = (err && err.message) ? err.message : String(err);
        if (msg.includes('HTTP 429')) {
          lastErr = msg;
          continue;
        }
        if (msg.includes('HTTP 503') || msg.includes('HTTP 500') || msg.includes('HTTP 404')) {
          lastErr = msg;
          break;
        }
        throw err;
      }
    }
  }
  throw new Error(lastErr || 'all gemini models exhausted');
}

async function attempt<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[site] ${label} failed (${message(err)}); keeping previous value`);
    return fallback;
  }
}

/** Previous run's output — the stale-data cache the page renders from when a source is down. */
async function loadPrevious(): Promise<Previous | null> {
  try {
    const raw = readFileSync(new URL('../src/content/siteData/site-data.md', import.meta.url), 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!match) throw new Error('no frontmatter');
    const data = parse(match[1]) as Previous;
    console.log('[site] loaded previous output as stale-data cache');
    return data;
  } catch (err) {
    console.warn(`[site] no previous output (${message(err)})`);
    return null;
  }
}

const phtDay = (d: Date | string) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' });

async function fetchMacro(prev: Previous | null): Promise<Macro | null> {
  try {
    const fx = await fetch(FX_ENDPOINT, { signal: AbortSignal.timeout(15_000) });
    if (!fx.ok) throw new Error(`frankfurter HTTP ${fx.status}`);
    const fxData = await fx.json();
    const usdRate = fxData?.rates?.PHP;
    if (typeof usdRate !== 'number') throw new Error('no PHP rate in reply');
    let angat: DamLevel | null = null;
    try {
      const res = await fetch(PAGASA_ENDPOINT, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`pagasa HTTP ${res.status}`);
      angat = parseDamLevel(await res.text());
      if (!angat) throw new Error('no Angat row');
    } catch (err) {
      console.warn(`[site] angat failed (${message(err)}); keeping previous value`);
      angat = prev?.macro?.angat ?? null;
    }
    return { usdRate, usdDate: fxData.date ?? '', angat };
  } catch (err) {
    console.warn(`[site] macro failed (${message(err)}); keeping previous value`);
    return prev?.macro ?? null;
  }
}

async function fetchWeather(prev: Previous | null): Promise<Weather | null> {
  try {
    const res = await fetch(WEATHER_ENDPOINT, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`wttr HTTP ${res.status}`);
    const data = await res.json();
    const cc = data?.current_condition?.[0];
    const temp = Number(cc?.temp_C);
    const feels = Number(cc?.FeelsLikeC);
    const humidity = Number(cc?.humidity);
    const desc = cc?.weatherDesc?.[0]?.value;
    if (!Number.isFinite(temp) || !Number.isFinite(feels) || !Number.isFinite(humidity) || !desc) {
      throw new Error('incomplete current_condition');
    }
    return { temp, feels, humidity, desc, observedAt: cc?.observation_time ?? '' };
  } catch (err) {
    console.warn(`[site] weather failed (${message(err)}); keeping previous value`);
    return prev?.weather ?? null;
  }
}

async function fetchHistory(prev: Previous | null): Promise<HistoryBorn | null> {
  try {
    const res = await fetch(`${HISTORY_ENDPOINT}/${phtDay(new Date())}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`kahimyang HTTP ${res.status}`);
    const entry = parseHistoryBorn(await res.json());
    if (!entry) throw new Error('no birth entry for today');
    return entry;
  } catch (err) {
    console.warn(`[site] history failed (${message(err)}); keeping previous value`);
    // A stale entry is only shown while it is still today's entry — otherwise
    // the card would claim yesterday's person was born today.
    return prev && phtDay(prev.generatedAt) === phtDay(new Date()) ? prev.history : null;
  }
}

async function fetchQuakes(prev: Previous | null): Promise<Quake[] | null> {
  try {
    const res = await fetch(QUAKE_ENDPOINT, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`phivolcs HTTP ${res.status}`);
    const quakes = parseQuakes(await res.text());
    if (quakes.length === 0) throw new Error('no quake rows');
    // The page lists ~5 days of events; the newest rows come first.
    return quakes.slice(0, 10);
  } catch (err) {
    console.warn(`[site] quakes failed (${message(err)}); keeping previous value`);
    return prev?.quakes ?? null;
  }
}

async function fetchAsteroid(prev: Previous | null): Promise<Previous['asteroid']> {
  const key = process.env.NASA_API_KEY;
  if (!key) {
    console.warn('[site] NASA_API_KEY missing; skipping asteroid feed');
    return prev?.asteroid ?? null;
  }
  try {
    const today = phtDay(new Date());
    const url =
      'https://api.nasa.gov/neo/rest/v1/feed?start_date=' +
      today +
      '&end_date=' +
      today +
      '&api_key=' +
      encodeURIComponent(key);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`nasa neo HTTP ${res.status}`);
    const data = await res.json();
    const list = (data?.near_earth_objects?.[today] ?? []) as any[];
    if (list.length === 0) throw new Error('no neo entries');
    // Prefer hazardous, then closest approach.
    const hazardous = list.filter((n) => n?.is_potentially_hazardous_asteroid);
    const pool = hazardous.length ? hazardous : list;
    let best: any = null;
    let bestDist = Infinity;
    for (const n of pool) {
      const ca = n?.close_approach_data?.[0];
      const dist = Number(ca?.miss_distance?.kilometers);
      if (Number.isFinite(dist) && dist < bestDist) {
        bestDist = dist;
        best = n;
      }
    }
    if (!best) throw new Error('no approach data');
    const ca = best.close_approach_data[0];
    const diam = best.estimated_diameter?.kilometers;
    const diameter = Number(diam?.estimated_diameter_max ?? diam?.estimated_diameter_min ?? 0);
    return {
      name: String(best.name ?? '').replace(/[()]/g, '').trim(),
      diameter: Number.isFinite(diameter) ? diameter : 0,
      missDistance: Number(ca.miss_distance.kilometers),
      velocity: Number(ca.relative_velocity.kilometers_per_second),
      hazardous: !!best.is_potentially_hazardous_asteroid,
      approachDate: String(ca.close_approach_date_full ?? ca.close_approach_date ?? today),
      url: String(best.nasa_jpl_url ?? ''),
    };
  } catch (err) {
    console.warn(`[site] asteroid feed failed (${message(err)}); keeping previous value`);
    return prev?.asteroid ?? null;
  }
}
  try {
    const md = await firecrawlScrape(PHILIPPINE_STOCKS_URL);
    const headerRe = /\| Stock \| Value \| Price \| Change \| %Change \|/g;
    const headers: number[] = [];
    let m;
    while ((m = headerRe.exec(md)) !== null) headers.push(m.index);
    const rowRe = /\|\s*\[([A-Z]+)\]\([^)]*\)\s*\|\s*[\d,]+\.\d+\s*\|\s*[\d.]+\s*\|\s*[-\d.]+\s*\|\s*([-\d.]+%)\s*\|/;
    let gainer: StockMover | null = null;
    let loser: StockMover | null = null;
    if (headers.length >= 2) {
      const section = md.slice(headers[1], headers[2] ?? md.length);
      const match = section.match(rowRe);
      if (match) gainer = { ticker: match[1], change: match[2] };
    }
    if (headers.length >= 3) {
      const section = md.slice(headers[2]);
      const match = section.match(rowRe);
      if (match) loser = { ticker: match[1], change: match[2] };
    }
    if (!gainer && !loser) throw new Error('no stock data found');
    return { gainer, loser };
  } catch (err) {
    console.warn(`[site] stocks failed (${message(err)}); keeping previous value`);
    return prev?.stocks ?? null;
  }
}

async function firecrawlScrape(url: string): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error('FIRECRAWL_API_KEY env var is empty or unset');
  const res = await fetch(FIRECRAWL_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formats: ['markdown'] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`firecrawl HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (!data?.success) throw new Error('firecrawl scrape failed: ' + JSON.stringify(data).slice(0, 200));
  return data?.data?.markdown ?? '';
}

function extractArticleUrls(md: string): string[] {
  const urls = new Set<string>();
  const re = /https?:\/\/newsinfo\.inquirer\.net\/\d+\/[^\s)"']+/g;
  for (const m of md.matchAll(re)) {
    urls.add(m[0].replace(/[.,;:!?)]+$/, ''));
  }
  return [...urls];
}

const storyList = (news: NewsItem[]) =>
  news.map((n, i) => `${i + 1}. ${n.headline}\n   ${n.summary}`).join('\n');

async function buildPatches(
  news: NewsItem[],
  contents: Map<string, string>,
  extras: { macro: Macro | null; weather: Weather | null; history: HistoryBorn | null; quakes: Quake[] | null },
): Promise<GeneratedPatch[]> {
  const withText = news
    .map(
      (n, i) =>
        `--- STORY ${i + 1}\nHeadline: ${n.headline}\nWire summary: ${n.summary}\nArticle:\n${(contents.get(n.url) ?? '').slice(0, 2000)}`,
    )
    .join('\n');
  const extraText = [
    extras.macro ? `USD→PHP rate: ${extras.macro.usdRate} (${extras.macro.usdDate})${extras.macro.angat ? `, Angat Dam: ${extras.macro.angat.level}m (NHWL ${extras.macro.angat.nhwl}m)` : ''}` : '',
    extras.weather ? `Manila weather: ${extras.weather.temp}°C ${extras.weather.desc}, feels ${extras.weather.feels}°C, humidity ${extras.weather.humidity}%` : '',
    extras.history ? `Born on this day: ${extras.history.title}` : '',
    extras.quakes && extras.quakes.length ? `Recent earthquakes: ${extras.quakes.slice(0, 3).map((q) => `M${q.mag} ${q.location} (${q.time})`).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const user = `${withText}\n\nLive data:\n${extraText}\n\nExample of the expected patch format:\n${JSON.stringify(EXAMPLE_PATCH)}\n\nSelect up to 5 fitting stories (and optionally create patches inspired by the live data above) and reply {"patches": [...]}.`;
  const raw = await llmJson<{ patches?: RawPatch[] }>(PATCH_SYSTEM, user, 4000);
  const out: GeneratedPatch[] = [];
  for (const p of raw.patches ?? []) {
    const category = p.category ?? '';
  const tag = p.tag ?? category.toUpperCase().replace(/-/g, ' ');
  const BADGE_PALETTE = ['bg-secondary text-on-secondary', 'bg-primary text-on-primary', 'bg-secondary-container text-on-secondary-container', 'bg-tertiary text-on-tertiary', 'bg-surface-tint text-on-primary', 'bg-surface-container text-on-surface'];
  const categoryHash = category.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const tagClass = BADGE_PALETTE[categoryHash % BADGE_PALETTE.length];
    if (!category || !p.code || !p.title || !p.body || !p.gmNote) continue;
    if (!Array.isArray(p.classes) || p.classes.length === 0) continue;
    const stats = (Array.isArray(p.stats) ? p.stats : [])
      .filter((s) => s?.label && s?.value)
      .map<Stat>((s) => ({
        label: s.label as string,
        value: s.value as string,
        ...(s.note ? { note: s.note } : {}),
        ...(s.tone === 'error' || s.tone === 'primary' || s.tone === 'tertiary'
          ? { tone: s.tone }
          : {}),
      }));
    if (stats.length === 0) continue;
    out.push({
      category,
      tag,
      tagClass,
      code: p.code,
      title: p.title,
      body: p.body,
      classes: p.classes,
      stats,
      ...(p.notice ? { notice: p.notice } : {}),
      gmNote: p.gmNote,
    });
    if (out.length === 5) break;
  }
  return out;
}

async function buildNotice(news: NewsItem[]): Promise<Notice | null> {
  const raw = await llmJson<{ headline?: string | null; body?: string }>(
    NOTICE_SYSTEM,
    `Today's stories:\n${storyList(news)}`,
    400,
  );
  if (!raw.headline || !raw.body) return null;
  return { headline: raw.headline, body: raw.body };
}

async function buildSanctions(news: NewsItem[]): Promise<Sanction[]> {
  const raw = await llmJson<{ sanctions?: Sanction[] }>(
    SANCTION_SYSTEM,
    `Today's stories:\n${storyList(news)}`,
    700,
  );
  return (raw.sanctions ?? [])
    .filter((s) => s?.player && s?.penalty && s?.infraction)
    .slice(0, 3);
}

async function buildGvg(news: NewsItem[]): Promise<Gvg | null> {
  const raw = await llmJson<{ title?: string | null; label?: string; body?: string }>(
    GVG_SYSTEM,
    `Today's stories:\n${storyList(news)}`,
    400,
  );
  if (!raw.title || !raw.label || !raw.body) return null;
  return { title: raw.title, label: raw.label, body: raw.body };
}

const REGIONS = ['Luzon', 'Visayas', 'Mindanao'];

async function buildRealm(news: NewsItem[]): Promise<RealmStatus[] | null> {
  const raw = await llmJson<{ statuses?: RealmStatus[] }>(
    REALM_SYSTEM,
    `Today's stories:\n${storyList(news)}`,
    400,
  );
  const byRegion = new Map(
    (raw.statuses ?? [])
      .filter((s) => REGIONS.includes(s?.region) && typeof s?.status === 'string' && s.status.trim())
      .map((s) => [s.region, s.status.trim()]),
  );
  if (byRegion.size !== 3) return null;
  return REGIONS.map((region) => ({ region, status: byRegion.get(region) as string }));
}

async function main() {
  if (!process.env.GEMINIKEYS) {
    console.warn('[site] GEMINIKEYS missing; skipping generation, keeping existing data files');
    return;
  }
  if (!process.env.FIRECRAWL_API_KEY || process.env.FIRECRAWL_API_KEY === 'fc-your-firecrawl-key') {
    console.warn('[site] FIRECRAWL_API_KEY missing or placeholder; skipping news scraping, keeping existing news.ts');
  }
  const prev = await loadPrevious();
  let mainMd = '';
  try {
    console.log(`[news] scraping ${NEWSINFO_URL} via firecrawl…`);
    mainMd = await firecrawlScrape(NEWSINFO_URL);
  } catch (err) {
    console.warn(`[news] firecrawl failed (${message(err)}); keeping previous news.ts`);
    mainMd = '';
  }
  if (!mainMd) {
    console.warn('[site] firecrawl unavailable; keeping all existing data files');
    return;
  }
  const articleUrls = extractArticleUrls(mainMd).slice(0, LIMIT);
  if (articleUrls.length === 0) throw new Error('no article URLs found on newsinfo.inquirer.net');
  console.log(`[news] found ${articleUrls.length} article URLs`);

  const items: FeedItem[] = [];
  const crawled = new Map<string, string>();
  for (const url of articleUrls) {
    try {
      console.log(`[news] scraping ${url}…`);
      const md = await firecrawlScrape(url);
      const titleMatch = md.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : url.split('/').pop()?.replace(/-/g, ' ') ?? '';
      crawled.set(url, md);
      items.push({ title, link: url, pubDate: new Date().toISOString(), description: md.slice(0, 500) });
    } catch (err) {
      console.warn(`[news] failed to scrape ${url}: ${message(err)}`);
    }
  }
  if (items.length === 0) {
    console.warn('[news] no articles scraped; keeping previous news.ts');
  } else {
    console.log(`[news] scraped ${items.length} articles`);
  }

  const news: NewsItem[] = [];
  const contents = new Map<string, string>();
  for (const item of items) {
    const content = crawled.get(item.link) ?? item.description.replace(/<[^>]+>/g, ' ');
    contents.set(item.link, content);
    try {
      console.log(`[news] rewriting: ${item.title.slice(0, 60)}…`);
      const draft = await llmJson<WireDraft>(
        NEWS_SYSTEM,
        `Headline: ${item.title}\nPublished: ${item.pubDate}\nSource: ${item.link}\n\nArticle:\n${(content || item.title).slice(0, 4000)}`,
        600,
      );
      if (!draft.tag || !draft.title || !draft.summary) throw new Error('llm reply missing fields');
      const published = new Date(item.pubDate);
      news.push({
        slug: slugFromUrl(item.link),
        tag: draft.tag,
        title: draft.title,
        summary: draft.summary,
        headline: item.title,
        url: item.link,
        publishedAt: Number.isNaN(published.getTime()) ? item.pubDate : published.toISOString(),
      });
    } catch (err) {
      console.warn(`[site] skipped (${message(err)}): ${item.title}`);
    }
  }
  if (news.length === 0) {
    console.warn('[news] no news items rewritten; keeping previous news.ts');
  } else {
    const generatedAt = new Date().toISOString();
    // Keep only the 100 most recent news markdown files
    const { readdirSync, unlinkSync, statSync } = await import('node:fs');
    try {
      const existing = readdirSync(NEWS_OUTPUT_DIR)
        .filter((f) => f.endsWith('.md'))
        .map((f) => ({ name: f, mtime: statSync(new URL(f, NEWS_OUTPUT_DIR)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      // Delete oldest beyond 100 (after accounting for new files)
      const toDelete = existing.slice(Math.max(0, 100 - news.length));
      for (const f of toDelete) unlinkSync(new URL(f.name, NEWS_OUTPUT_DIR));
    } catch { /* dir may not exist */ }
    for (const item of news) {
      const slug = item.slug || slugFromUrl(item.url);
      const frontmatter = stringify({ ...item, generatedAt });
      writeFileSync(new URL(`${slug}.md`, NEWS_OUTPUT_DIR), `---\n${frontmatter}---\n\n${item.summary}\n`);
    }
    console.log(`[site] wrote ${news.length} news markdown files`);
  }
  const macro = await fetchMacro(prev);
  const weather = await fetchWeather(prev);
  const history = await fetchHistory(prev);
  const quakes = await fetchQuakes(prev);
  const stocks = await fetchStocks(prev);
  const asteroid = await fetchAsteroid(prev);
  const patches = await attempt(
    'patches',
    () => buildPatches(news, contents, { macro, weather, history, quakes }),
    [],
  );
  const notice = await attempt('notice', () => buildNotice(news), prev?.notice ?? null);
  const sanctions = await attempt('sanctions', () => buildSanctions(news), prev?.sanctions ?? []);
  const gvg = await attempt('gvg', () => buildGvg(news), prev?.gvg ?? null);
  const realm = await attempt('realm', () => buildRealm(news), prev?.realmStatuses ?? null);
  console.log(
    `[site] patches: ${patches.length}, notice: ${notice ? 'ok' : 'none'}, sanctions: ${sanctions.length}, gvg: ${gvg ? 'ok' : 'none'}, realm: ${realm ? 'ok' : 'none'}, macro: ${macro ? `${macro.usdRate}${macro.angat ? ` / Angat ${macro.angat.level}m` : ''}` : 'none'}, weather: ${weather ? `${weather.temp}°C ${weather.desc}` : 'none'}, history: ${history ? 'ok' : 'none'}, quakes: ${quakes ? `${quakes.length} (M${quakes[0].mag})` : 'none'}`,
  );

  // Write generated patches as individual markdown files (clear old ones first)
  const patchesDir = new URL('../src/content/patches/', import.meta.url);
  try {
    const { readdirSync, unlinkSync } = await import('node:fs');
    if (patches.length > 0) {
      for (const f of readdirSync(patchesDir)) {
        if (f.startsWith('gen-') && f.endsWith('.md')) unlinkSync(new URL(f, patchesDir));
      }
    }
  } catch { /* dir may not exist */ }
  const yamlMod = await import('yaml');
  for (const p of patches) {
    const frontmatter = yamlMod.stringify(p);
    const slug = (p.code || p.category || 'patch').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    writeFileSync(new URL(`gen-${slug}.md`, patchesDir), `---\n${frontmatter}---\n\n${p.body}\n`);
  }
  if (patches.length) console.log(`[site] wrote ${patches.length} generated patch markdown files`);

  const generatedAt = new Date().toISOString();
  const siteData = {
    generatedAt,
    notice,
    sanctions,
    gvg,
    realmStatuses: realm,
    macro,
    weather,
    history,
    quakes,
    stocks,
    asteroid,
  };
  const frontmatter = stringify(siteData);
  writeFileSync(SITE_OUTPUT, `---\n${frontmatter}---\n\nGenerated site data.\n`);
  console.log(`[site] wrote src/content/news/news.md (${news.length} items) and src/content/siteData/site-data.md`);
}

main().catch((err) => {
  console.error(`[site] ${err instanceof Error ? (err.stack ?? err.message) : err}`);
  process.exitCode = 1;
});


