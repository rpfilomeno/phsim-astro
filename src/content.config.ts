import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const gmOnDuty = defineCollection({
  loader: glob({ base: './src/content/gmOnDuty', pattern: '**/*.md' }),
  schema: z.object({
    name: z.string(),
    role: z.string().default('GM on Duty'),
    location: z.string().default(''),
    status: z.string().default('On Duty'),
    lang: z.string().default('tl'),
  }),
});

const kafra = defineCollection({
  loader: glob({ base: './src/content/kafra', pattern: '**/*.md' }),
  schema: z.object({
    name: z.string(),
    booth: z.string(),
    branch: z.string(),
    lang: z.string().default('tl'),
  }),
});

const patches = defineCollection({
  loader: glob({ base: './src/content/patches', pattern: '**/*.md' }),
  schema: z.object({
    category: z.string(),
    tag: z.string(),
    tagClass: z.string(),
    code: z.string(),
    title: z.string(),
    body: z.string(),
    classes: z.array(z.string()),
    stats: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
        note: z.string().optional(),
        tone: z.enum(['error', 'primary', 'tertiary']).optional(),
      }),
    ),
    notice: z.string().optional(),
    gmNote: z.string(),
  }),
});

const news = defineCollection({
  loader: glob({ base: './src/content/news', pattern: '**/*.md' }),
  schema: z.object({
    slug: z.string(),
    tag: z.string(),
    title: z.string(),
    summary: z.string(),
    headline: z.string(),
    url: z.string(),
    publishedAt: z.coerce.string(),
    generatedAt: z.coerce.string().default(''),
  }),
});

const siteData = defineCollection({
  loader: glob({ base: './src/content/siteData', pattern: '**/*.md' }),
  schema: z.object({
    generatedAt: z.coerce.string().default(''),
    notice: z.object({ headline: z.string(), body: z.string() }).nullable().default(null),
    sanctions: z.array(z.object({ player: z.string(), penalty: z.string(), infraction: z.string() })).default([]),
    gvg: z.object({ title: z.string(), label: z.string(), body: z.string() }).nullable().default(null),
    realmStatuses: z.array(z.object({ region: z.string(), status: z.string() })).nullable().default(null),
    macro: z.object({
      usdRate: z.number(),
      usdDate: z.coerce.string(),
      angat: z.object({ level: z.number(), nhwl: z.number(), ruleCurve: z.number(), observedAt: z.string() }).nullable(),
    }).nullable().default(null),
    weather: z.object({ temp: z.number(), feels: z.number(), humidity: z.number(), desc: z.string(), observedAt: z.coerce.string() }).nullable().default(null),
    history: z.object({ title: z.string(), body: z.string(), url: z.string() }).nullable().default(null),
    quakes: z.array(z.object({ time: z.string(), lat: z.string(), lon: z.string(), depth: z.string(), mag: z.string(), location: z.string(), url: z.string() })).nullable().default(null),
    stocks: z.object({ gainer: z.object({ ticker: z.string(), change: z.string() }).nullable(), loser: z.object({ ticker: z.string(), change: z.string() }).nullable() }).nullable().default(null),
  }),
});

export const collections = { kafra, patches, siteData, news, gmOnDuty };
