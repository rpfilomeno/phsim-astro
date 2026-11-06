# Midgarts PH: The Pearl Archipelago

Satirical Ragnarok Online-style patch registry for "Republic Server Ver 7107.25" — Philippine
traffic, agri-inflation, heat index, utilities, and pop culture written as MMORPG patch notes.

Built with Astro 7 and Tailwind CSS 4. Single static page, no client framework.

## Commands

| Command           | Action                                     |
| ----------------- | ------------------------------------------ |
| `npm install`     | Install dependencies                       |
| `npm run dev`     | Start dev server at `localhost:4321`       |
| `npm run build`   | Build the static site to `dist/`           |
| `npm run preview` | Preview the production build locally       |
| `npm test`        | Run the reboot + news feed unit tests      |
| `npm run generate:site` | Rebuild all generated data (news wire, patches, notices, macro index) |

## Setup

Copy `.env.example` to `.env` and fill in `GEMINIKEYS` (comma-separated Gemini API keys) and
`FIRECRAWL_API_KEY`. Then run `npm run generate:site`.

## Deploy

The site deploys to GitHub Pages via `.github/workflows/deploy.yml`. Add `GEMINIKEYS` and
`FIRECRAWL_API_KEY` as repository secrets. The workflow runs the generator (prebuild) then
builds and deploys. Set `BASE_PATH` env var if deploying to a subpath.

## Structure

```text
src/
  components/   Header, ticker, patch window, news wire, side rail, footer
  content/      Kafra staff card + patches as markdown (frontmatter = data)
  data/         (removed - all data is now markdown in content/)
  layouts/      HTML shell, fonts, meta
  lib/          Reboot window + RSS/LLM/PAGASA/PHIVOLCS helpers (tested)
  pages/        index.astro
  styles/       Tailwind theme tokens from the design spec
scripts/
  generate-site-data.ts   Firecrawl scrape → LLM rewrite → markdown (news + siteData)
```

All patches are generated dynamically by `npm run generate:site` (up to 5 from today's news + live data).
Categories and badge styles are derived from the generated patches. The Kafra staff card loads from `src/content/kafra/*.md`:
frontmatter sets the staff name, booth, branch and greeting language; the markdown body is the
greeting text.

`npm run generate:site` rebuilds all generated data in one run:

- `src/content/news/*.md` — news wire: one markdown file per article, scraped via Firecrawl
  (API key from `FIRECRAWL_API_KEY` env var), rewritten in the Midgarts voice through the
  Google Gemini API (flash models, latest-to-oldest, keys from `GEMINIKEYS` env var).
- `src/content/siteData/site-data.md` - generated patches, emergency ticker notice, GM sanctions, GvG
  history, macro), emergency ticker notice, GM sanctions, GvG bulletin, realm server
  statuses (all LLM), plus live data: USD→Zeny from the Frankfurter API, the Angat Dam
  level from PAGASA's flood page, Manila weather from wttr.in, the "born on this day"
  entry from kahimyang.com's history API, and recent earthquakes from PHIVOLCS. Runs
  with `--use-system-ca` because PHIVOLCS serves an incomplete certificate chain.

Never edit generated files by hand; components fall back to their built-in defaults when a
section is missing. If a remote source is down, the previous run's values are kept so pages
still render with stale data (the log prints `keeping previous value`).

## Disclaimer

Midgarts PH is an artistic parody. It is not affiliated with Gravity Co., Ltd., Level Up! Games,
or any Philippine government agency.
