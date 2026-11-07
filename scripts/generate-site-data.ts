import { writeFileSync, readFileSync } from 'node:fs';
import { stringify, parse } from 'yaml';

// Load .env if present (Node 20.12+). No-op if the file doesn't exist.
// .env is this project's local source of truth: drop inherited values for keys it
// defines before loading, because loadEnvFile never overrides — a stale OS-level
// FIRECRAWL_API_KEY otherwise shadowed the file after a rotation (401s).
const envFileKeys = new Set<string>();
try {
  const src = readFileSync('.env', 'utf8');
  for (const m of src.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
    envFileKeys.add(m[1]);
    delete process.env[m[1]];
  }
  process.loadEnvFile();
} catch { /* no .env — ambient env (CI, Dokploy) stays authoritative */ }
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

// --- logging -----------------------------------------------------------------
// Parallel calls interleave, so every line carries seconds-since-run-start.
// Safety: keys are only ever logged as their last 6 chars (CI logs are readable).
const T0 = Date.now();
const since = (t: number) => ((Date.now() - t) / 1000).toFixed(1);
const stamp = () => `[+${since(T0).padStart(5, '0')}s]`;
const log = (msg: string) => console.log(`${stamp()} ${msg}`);
const warn = (msg: string) => console.warn(`${stamp()} ${msg}`);
const fail = (msg: string) => console.error(`${stamp()} ${msg}`);

// --- run state (one process = one run) ---------------------------------------
/** label → seconds spent; paired with staleSections for the summary. */
const sectionTime = new Map<string, number>();
const staleSections = new Set<string>();
function markSection(label: string, t: number, stale: boolean) {
  sectionTime.set(label, (Date.now() - t) / 1000);
  if (stale) staleSections.add(label);
}
const sectionStat = (label: string) =>
  sectionTime.has(label)
    ? `${label} ${staleSections.has(label) ? 'STALE' : 'ok'} ${(sectionTime.get(label) ?? 0).toFixed(1)}s`
    : `${label} n/a`;
/** LLM usage counters — proves the rolling key rule and sizes the retry cost. */
const llmStats = { calls: 0, attempts: 0, keyUse: new Map<string, number>() };
const keySuffix = (key: string) => key.slice(-6);
/** Which secret is actually in effect, and from where — the 401 confusion was here. */
const effectiveKey = (name: string) => {
  const v = process.env[name];
  return v ? `...${keySuffix(v)} (${envFileKeys.has(name) ? '.env' : 'ambient'})` : 'unset';
};

const RSS_FEED_URL = 'https://newsinfo.inquirer.net/feed';
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
      log('[site] discovered gemini flash models: ' + found.join(', '));
      return found;
    }
  }
  warn('[site] could not discover gemini models; falling back to built-in list');
  cachedFlashModels = GEMINI_MODELS;
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

const MAX_LLM_ATTEMPTS = 3;

/** Run fn through at most n concurrent slots. */
function pLimit(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const runNext = () => {
    while (active < n && queue.length) {
      active++;
      queue.shift()!();
    }
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn().then(resolve, reject).finally(() => {
          active--;
          runNext();
        });
      });
      runNext();
    });
}

// One shared gate for every LLM call: floor(keys/2) concurrent requests.
let llmLimit: (<T>(fn: () => Promise<T>) => Promise<T>) | null = null;
function limitLlm<T>(fn: () => Promise<T>): Promise<T> {
  if (!llmLimit) llmLimit = pLimit(Math.max(1, Math.floor(geminiKeys().length / 2)));
  return llmLimit(fn);
}

async function llmJson<T>(system: string, user: string, maxTokens: number, schema?: object): Promise<T> {
  const keys = geminiKeys();
  if (keys.length === 0) throw new Error('GEMINIKEYS env var is empty or unset');
  return limitLlm(() => attemptLlm<T>(system, user, maxTokens, schema, keys));
}

// Models that failed persistently for this run only — skipped without spending
// retry budget; the value is why it died (shown in the run summary).
// shortcut: not persisted across runs; if a model recovers (or a new one appears
// in discovery) it is retried on the next generate:site.
const deadModels = new Map<string, string>();
// A 429 may be model quota OR this key's quota: 2 strikes kill the key, 429s
// from 2 distinct keys kill the model — one exhausted key must not mass-kill
// models, and one bad model must not mass-kill keys.
// shortcut: attribution assumes >=2 keys; a single-key setup kills the model on first 429.
const deadKeys = new Set<string>();
const key429Strikes = new Map<string, number>();
const model429Keys = new Map<string, Set<string>>();
// Parallel calls must not pile onto the same model: a hung one would stall every
// call at once. Held while in flight; the pick scan prefers a free model.
const inFlightModels = new Set<string>();
let geminiModelCursor = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function attemptLlm<T>(
  system: string,
  user: string,
  maxTokens: number,
  schema: object | undefined,
  keys: string[],
): Promise<T> {
  const models = await flashModels();
  let lastErr = '';
  let tries = 0;
  const skip = new Set<string>(); // this call only: high demand / unattributed 429
  let waitNext = false; // a burned failure just happened -> micro-backoff first
  let refundHung = false; // only the first hang in a call is free
  llmStats.calls++;
  // Bound the loop: each iteration is one full scan over the model list, so it
  // terminates once every model is dead or skipped (or the tries run out).
  for (let i = 0; i < models.length * (MAX_LLM_ATTEMPTS + 1) && tries < MAX_LLM_ATTEMPTS; i++) {
    if (waitNext) {
      waitNext = false;
      await sleep(Math.min(500 * 2 ** (tries - 1), 2000)); // 0.5s, 1s, then 2s cap
    }
    // Round-robin pick: first model that is not dead, not skipped by this call,
    // and not held by a parallel call; share one only if all live models are held.
    let model = '';
    let held = '';
    for (let k = 0; k < models.length; k++) {
      const cand = models[geminiModelCursor % models.length];
      geminiModelCursor = (geminiModelCursor + 1) % models.length;
      if (deadModels.has(cand) || skip.has(cand)) continue;
      if (inFlightModels.has(cand)) {
        if (!held) held = cand;
        continue;
      }
      model = cand;
      break;
    }
    if (!model) {
      if (!held) continue; // all dead/skipped -> burn an i -> honest exit below
      model = held; // contention (rare: 3 concurrent vs ~10 models): sharing beats stalling
      warn(`[llm] every live model is in flight; sharing ${model}`);
    }
    // Roll the shared key cursor on every attempt so parallel calls and retries
    // spread evenly across keys; dead keys rotate out for the run.
    let key = '';
    for (let k = 0; k < keys.length; k++) {
      const cand = keys[geminiKeyCursor % keys.length];
      geminiKeyCursor = (geminiKeyCursor + 1) % keys.length;
      if (deadKeys.has(cand)) continue;
      key = cand;
      break;
    }
    if (!key) throw new Error('gemini: every key reached 2 strikes; keys exhausted for this run');
    tries++;
    llmStats.attempts++;
    const sfx = keySuffix(key);
    llmStats.keyUse.set(sfx, (llmStats.keyUse.get(sfx) ?? 0) + 1);
    const who = `try ${tries}/${MAX_LLM_ATTEMPTS} ${model} key ...${sfx}`;
    const note = tries < MAX_LLM_ATTEMPTS ? ', retry' : '';
    const t = Date.now();
    inFlightModels.add(model);
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
              ...(schema ? { responseSchema: schema } : {}),
              temperature: 0.7,
            },
          }),
          signal: AbortSignal.timeout(60_000), // healthy calls top out ~37s; hangs never returned by 120s
        },
      );
      if (!res.ok) {
        const detail = res.status === 429 ? 'rate-limited' : (await res.text()).slice(0, 200);
        lastErr = `gemini ${model} HTTP ${res.status} (${detail}) key ...${sfx}`;
        if (res.status === 404) {
          deadModels.set(model, 'HTTP 404');
          warn(`[llm] ${who} → HTTP 404; model marked dead for this run`);
          tries--;
        } else if (res.status === 429) {
          // Attribute before banning (never burns a try): strike the key, count
          // distinct keys seen on the model; kill each only once evidence is there.
          tries--;
          key429Strikes.set(key, (key429Strikes.get(key) ?? 0) + 1);
          let keys429 = model429Keys.get(model);
          if (!keys429) {
            keys429 = new Set();
            model429Keys.set(model, keys429);
          }
          keys429.add(key);
          skip.add(model);
          const strikes = key429Strikes.get(key) ?? 0;
          if (strikes >= 2) {
            deadKeys.add(key);
            warn(`[llm] ${who} → HTTP 429; key marked dead for this run (${strikes} strikes)`);
          }
          if (keys429.size >= 2 || keys.length === 1) {
            deadModels.set(model, 'HTTP 429');
            warn(`[llm] ${who} → HTTP 429 from ${keys429.size} keys; model marked dead for this run`);
          } else {
            warn(`[llm] ${who} → HTTP 429; model skipped for this call (attribution ${keys429.size}/2 keys, key strike ${strikes}/2)`);
          }
        } else if (/high demand|overloaded/i.test(detail)) {
          // Capacity spike ("spikes are usually temporary"): switch now, keep the try.
          tries--;
          skip.add(model);
          warn(`[llm] ${who} → model in high demand; switching model (no try burned)`);
        } else {
          warn(`[llm] ${who} → HTTP ${res.status} (${detail})${note}`);
          waitNext = true;
        }
        continue;
      }
      const data = await res.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) {
        const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? 'no content';
        lastErr = `gemini ${model} returned no content (${reason})`;
        warn(`[llm] ${who} → no content (${reason})${note}`);
        waitNext = true;
        continue;
      }
      const out = extractJson<T>(text);
      log(`[llm] ok (${since(t)}s) ${model} key ...${sfx}`);
      return out;
    } catch (err) {
      lastErr = `gemini ${model}: ${message(err)}`;
      if (err instanceof Error && err.name === 'TimeoutError') {
        // A hang burns the whole timeout with zero output — never afford a second
        // on this model. Only the first hang per call is refunded, so one
        // pathological call can't chain hangs through the whole model list.
        deadModels.set(model, 'timeout');
        let refunded = '';
        if (!refundHung) {
          refundHung = true;
          tries--;
          refunded = ' (no try burned)';
        }
        warn(`[llm] ${who} → ${message(err)}; model marked unresponsive for this run${refunded}`);
      } else {
        warn(`[llm] ${who} → ${message(err)}${note}`);
        waitNext = true;
      }
    } finally {
      inFlightModels.delete(model);
    }
  }
  if (!lastErr) {
    const why = [...deadModels].map(([m, r]) => `${m} (${r})`).join(', ');
    throw new Error(`gemini: every discovered model is dead for this run (${why || 'none'})`);
  }
  throw new Error(`gemini failed after ${tries} attempts: ${lastErr}`);
}

async function attempt<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  const t = Date.now();
  try {
    const out = await fn();
    markSection(label, t, false);
    log(`[build] ${label} ok (${since(t)}s)`);
    return out;
  } catch (err) {
    markSection(label, t, true);
    warn(`[build] ${label} failed (${message(err)}); keeping previous value`);
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
    log('[site] loaded previous output as stale-data cache');
    return data;
  } catch (err) {
    warn(`[site] no previous output (${message(err)})`);
    return null;
  }
}

const phtDay = (d: Date | string) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' });

async function fetchMacro(prev: Previous | null): Promise<Macro | null> {
  const t = Date.now();
  try {
    const fx = await fetch(FX_ENDPOINT, { signal: AbortSignal.timeout(15_000) });
    if (!fx.ok) throw new Error(`frankfurter HTTP ${fx.status}`);
    const fxData = await fx.json();
    const usdRate = fxData?.rates?.PHP;
    if (typeof usdRate !== 'number') throw new Error('no PHP rate in reply');
    let angat: DamLevel | null = null;
    const angatT = Date.now();
    try {
      const res = await fetch(PAGASA_ENDPOINT, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`pagasa HTTP ${res.status}`);
      angat = parseDamLevel(await res.text());
      if (!angat) throw new Error('no Angat row');
      markSection('angat', angatT, false);
      log(`[fetch] angat ok (${since(angatT)}s, ${angat.level}m)`);
    } catch (err) {
      markSection('angat', angatT, true);
      warn(`[fetch] angat failed (${message(err)}); keeping previous value`);
      angat = prev?.macro?.angat ?? null;
    }
    markSection('macro', t, false);
    log(`[fetch] macro ok (${since(t)}s, ${usdRate} PHP/USD)`);
    return { usdRate, usdDate: fxData.date ?? '', angat };
  } catch (err) {
    markSection('macro', t, true);
    warn(`[fetch] macro failed (${message(err)}); keeping previous value`);
    return prev?.macro ?? null;
  }
}

async function fetchWeather(prev: Previous | null): Promise<Weather | null> {
  const t = Date.now();
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
    markSection('weather', t, false);
    log(`[fetch] weather ok (${since(t)}s, ${temp}°C ${desc})`);
    return { temp, feels, humidity, desc, observedAt: cc?.observation_time ?? '' };
  } catch (err) {
    markSection('weather', t, true);
    warn(`[fetch] weather failed (${message(err)}); keeping previous value`);
    return prev?.weather ?? null;
  }
}

async function fetchHistory(prev: Previous | null): Promise<HistoryBorn | null> {
  const t = Date.now();
  try {
    const res = await fetch(`${HISTORY_ENDPOINT}/${phtDay(new Date())}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`kahimyang HTTP ${res.status}`);
    const entry = parseHistoryBorn(await res.json());
    if (!entry) throw new Error('no birth entry for today');
    markSection('history', t, false);
    log(`[fetch] history ok (${since(t)}s)`);
    return entry;
  } catch (err) {
    markSection('history', t, true);
    warn(`[fetch] history failed (${message(err)}); keeping previous value`);
    // A stale entry is only shown while it is still today's entry — otherwise
    // the card would claim yesterday's person was born today.
    return prev && phtDay(prev.generatedAt) === phtDay(new Date()) ? prev.history : null;
  }
}

async function fetchQuakes(prev: Previous | null): Promise<Quake[] | null> {
  const t = Date.now();
  try {
    const res = await fetch(QUAKE_ENDPOINT, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`phivolcs HTTP ${res.status}`);
    const quakes = parseQuakes(await res.text());
    if (quakes.length === 0) throw new Error('no quake rows');
    markSection('quakes', t, false);
    log(`[fetch] quakes ok (${since(t)}s, ${quakes.length} rows)`);
    // The page lists ~5 days of events; the newest rows come first.
    return quakes.slice(0, 10);
  } catch (err) {
    markSection('quakes', t, true);
    warn(`[fetch] quakes failed (${message(err)}); keeping previous value`);
    return prev?.quakes ?? null;
  }
}

async function fetchAsteroid(prev: Previous | null): Promise<Previous['asteroid']> {
  const t = Date.now();
  const key = process.env.NASA_API_KEY;
  if (!key) {
    markSection('asteroid', t, true);
    warn('[site] NASA_API_KEY missing; skipping asteroid feed');
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
    const neo = {
      name: String(best.name ?? '').replace(/[()]/g, '').trim(),
      diameter: Number.isFinite(diameter) ? diameter : 0,
      missDistance: Number(ca.miss_distance.kilometers),
      velocity: Number(ca.relative_velocity.kilometers_per_second),
      hazardous: !!best.is_potentially_hazardous_asteroid,
      approachDate: String(ca.close_approach_date_full ?? ca.close_approach_date ?? today),
      url: String(best.nasa_jpl_url ?? ''),
    };
    markSection('asteroid', t, false);
    log(`[fetch] asteroid ok (${since(t)}s, ${neo.name})`);
    return neo;
  } catch (err) {
    markSection('asteroid', t, true);
    warn(`[fetch] asteroid failed (${message(err)}); keeping previous value`);
    return prev?.asteroid ?? null;
  }
}

async function fetchStocks(prev: Previous | null): Promise<Stocks | null> {
  const t = Date.now();
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
    markSection('stocks', t, false);
    log(`[fetch] stocks ok (${since(t)}s, ${gainer?.ticker ?? 'n/a'} / ${loser?.ticker ?? 'n/a'})`);
    return { gainer, loser };
  } catch (err) {
    markSection('stocks', t, true);
    warn(`[fetch] stocks failed (${message(err)}); keeping previous value`);
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
  const raw = await llmJson<{ patches?: RawPatch[] }>(PATCH_SYSTEM, user, 4000, {
    type: 'object',
    properties: {
      patches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            tag: { type: 'string' },
            code: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
            classes: { type: 'array', items: { type: 'string' } },
            stats: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  value: { type: 'string' },
                  note: { type: 'string' },
                  tone: { type: 'string', enum: ['error', 'primary', 'tertiary'] },
                },
                required: ['label', 'value'],
              },
            },
            notice: { type: 'string' },
            gmNote: { type: 'string' },
          },
          required: ['category', 'code', 'title', 'body', 'classes', 'stats', 'gmNote'],
        },
      },
    },
    required: ['patches'],
  });
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
    {
      type: 'object',
      properties: {
        headline: { type: 'string', nullable: true },
        body: { type: 'string' },
      },
      required: ['headline', 'body'],
    },
  );
  if (!raw.headline || !raw.body) return null;
  return { headline: raw.headline, body: raw.body };
}

async function buildSanctions(news: NewsItem[]): Promise<Sanction[]> {
  const raw = await llmJson<{ sanctions?: Sanction[] }>(
    SANCTION_SYSTEM,
    `Today's stories:\n${storyList(news)}`,
    700,
    {
      type: 'object',
      properties: {
        sanctions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              player: { type: 'string' },
              penalty: { type: 'string' },
              infraction: { type: 'string' },
            },
            required: ['player', 'penalty', 'infraction'],
          },
        },
      },
      required: ['sanctions'],
    },
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
    {
      type: 'object',
      properties: {
        title: { type: 'string', nullable: true },
        label: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['title', 'label', 'body'],
    },
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
    {
      type: 'object',
      properties: {
        statuses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              region: { type: 'string' },
              status: { type: 'string' },
            },
            required: ['region', 'status'],
          },
        },
      },
      required: ['statuses'],
    },
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
    warn('[site] GEMINIKEYS missing; skipping generation, keeping existing data files');
    return;
  }
  if (!process.env.FIRECRAWL_API_KEY || process.env.FIRECRAWL_API_KEY === 'fc-your-firecrawl-key') {
    warn('[site] FIRECRAWL_API_KEY missing or placeholder; stocks feed will use previous value');
  }
  log(
    `[site] secrets: GEMINIKEYS ${geminiKeys().length} keys (${envFileKeys.has('GEMINIKEYS') ? '.env' : 'ambient'})` +
      ` · FIRECRAWL_API_KEY ${effectiveKey('FIRECRAWL_API_KEY')} · NASA_API_KEY ${effectiveKey('NASA_API_KEY')}`,
  );
  await flashModels(); // discover once up-front so parallel calls don't race model discovery
  const prev = await loadPrevious();
  let items: FeedItem[] = [];
  try {
    log(`[news] fetching RSS ${RSS_FEED_URL}…`);
    const res = await fetch(RSS_FEED_URL, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`rss HTTP ${res.status}`);
    items = parseFeedItems(await res.text()).slice(0, LIMIT);
    log(`[news] found ${items.length} RSS items`);
  } catch (err) {
    warn(`[news] RSS failed (${message(err)}); keeping previous news.ts`);
    items = [];
  }
  if (items.length === 0) {
    warn('[news] no articles; keeping previous news.ts');
  } else {
    log(`[news] using ${items.length} RSS descriptions`);
  }

  const contents = new Map<string, string>();
  const newsT = Date.now();
  const drafts = await Promise.all(
    items.map(async (item) => {
      const content = item.description.replace(/<[^>]+>/g, ' ');
      contents.set(item.link, content);
      const itemT = Date.now();
      try {
        log(`[news] rewriting: ${item.title.slice(0, 60)}…`);
        const draft = await llmJson<WireDraft>(
          NEWS_SYSTEM,
          `Headline: ${item.title}\nPublished: ${item.pubDate}\nSource: ${item.link}\n\nArticle:\n${(content || item.title).slice(0, 4000)}`,
          600,
          {
            type: 'object',
            properties: {
              tag: { type: 'string' },
              title: { type: 'string' },
              summary: { type: 'string' },
            },
            required: ['tag', 'title', 'summary'],
          },
        );
        if (!draft.tag || !draft.title || !draft.summary) throw new Error('llm reply missing fields');
        log(`[news] ok (${since(itemT)}s): ${draft.title.slice(0, 60)}`);
        const published = new Date(item.pubDate);
        return {
          slug: slugFromUrl(item.link),
          tag: draft.tag,
          title: draft.title,
          summary: draft.summary,
          headline: item.title,
          url: item.link,
          publishedAt: Number.isNaN(published.getTime()) ? item.pubDate : published.toISOString(),
        };
      } catch (err) {
        warn(`[news] skipped (${message(err)}): ${item.title}`);
        return null;
      }
    }),
  );
  // filter keeps feed order (newest first) regardless of completion order
  const news: NewsItem[] = drafts.filter((n): n is NewsItem => n !== null);
  markSection('news', newsT, news.length === 0);
  if (news.length === 0) {
    if (drafts.length > 0) warn(`[news] all ${drafts.length} rewrites failed; keeping previous news.ts`);
  } else {
    const skipped = drafts.length - news.length;
    log(`[news] rewrote ${news.length}/${drafts.length} in ${since(newsT)}s${skipped ? ` (${skipped} skipped)` : ''}`);
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
    log(`[site] wrote ${news.length} news markdown files`);
  }
  const macro = await fetchMacro(prev);
  const weather = await fetchWeather(prev);
  const history = await fetchHistory(prev);
  const quakes = await fetchQuakes(prev);
  const stocks = await fetchStocks(prev);
  const asteroid = await fetchAsteroid(prev);
  const [patches, notice, sanctions, gvg, realm] = await Promise.all([
    attempt('patches', () => buildPatches(news, contents, { macro, weather, history, quakes }), []),
    attempt('notice', () => buildNotice(news), prev?.notice ?? null),
    attempt('sanctions', () => buildSanctions(news), prev?.sanctions ?? []),
    attempt('gvg', () => buildGvg(news), prev?.gvg ?? null),
    attempt('realm', () => buildRealm(news), prev?.realmStatuses ?? null),
  ]);
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
  if (patches.length) log(`[site] wrote ${patches.length} generated patch markdown files`);

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
  log(`[site] wrote src/content/news/news.md (${news.length} items) and src/content/siteData/site-data.md`);

  // One block to read (or grep) after any run: timing, freshness, key usage.
  const keysNow = geminiKeys();
  const newsStat =
    news.length === 0
      ? `kept previous (${drafts.length ? `all ${drafts.length} rewrites failed` : 'no RSS items'})`
      : `${news.length}/${drafts.length} rewritten${drafts.length - news.length ? ` (${drafts.length - news.length} skipped)` : ''} · ${(
          sectionTime.get('news') ?? 0
        ).toFixed(1)}s`;
  log(
    [
      `[site] ── run summary ── ${since(T0)}s total`,
      `[site]   news     ${newsStat}`,
      `[site]   builds   ${['patches', 'notice', 'sanctions', 'gvg', 'realm'].map(sectionStat).join(' · ')}`,
      `[site]   fetches  ${['macro', 'angat', 'weather', 'history', 'quakes', 'stocks', 'asteroid'].map(sectionStat).join(' · ')}`,
      `[site]   llm      ${llmStats.calls} calls / ${llmStats.attempts} attempts · keys ${
        keysNow.length ? keysNow.map((k) => `...${keySuffix(k)}:${llmStats.keyUse.get(keySuffix(k)) ?? 0}`).join(' ') : 'none'
      } · dead ${deadModels.size ? [...deadModels].map(([m, r]) => `${m} (${r})`).join(', ') : 'none'}${
        deadKeys.size ? ` · dead keys ${deadKeys.size}` : ''
      }`,
      `[site]   stale    ${staleSections.size ? [...staleSections].join(', ') : 'none'}`,
      `[site]   output   ${news.length} news · ${patches.length} patches · macro ${macro?.usdRate ?? '—'}${
        macro?.angat ? ` / Angat ${macro.angat.level}m` : ''
      } · weather ${weather ? `${weather.temp}°C ${weather.desc}` : '—'} · quakes ${quakes?.length ?? 0} · generatedAt ${generatedAt}`,
    ].join('\n'),
  );
}

main().catch((err) => {
  fail(`[site] ${err instanceof Error ? (err.stack ?? err.message) : err}`);
  process.exitCode = 1;
});


