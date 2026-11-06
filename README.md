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

Copy `.env.example` to `.env` and fill in:

- `GEMINIKEYS` — comma-separated Gemini API keys
- `FIRECRAWL_API_KEY` — used for the PSE stocks ticker
- `NASA_API_KEY` — free key from [api.nasa.gov](https://api.nasa.gov) for the asteroid watch

Then run `npm run generate:site`.

## Deploy

The site deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`, on
manual dispatch, and daily at `00:00 UTC` (08:00 Asia/Manila). Add `GEMINIKEYS`,
`FIRECRAWL_API_KEY`, and `NASA_API_KEY` as repository secrets. The workflow runs
`npm run generate:site` explicitly, then `npm run build` (which does not fetch), and deploys.

Custom domain: `phsim.rogverse.fyi` (see `public/CNAME`). Point a DNS CNAME record at
`rpfilomeno.github.io`, then set the custom domain under Settings → Pages. The site is served
from the domain root, so no `BASE_PATH` is needed.

## Structure

```text
src/
  assets/avatars/  GM avatar images (imported and optimised by Astro)
  components/      Header, ticker, patch window, news wire, side rail, footer
  config/          GM avatar map + weekly reboot schedule constants
  content/         Markdown content: kafra card, GM on duty, patches, news, siteData
  layouts/         HTML shell, fonts, meta
  lib/             Reboot window + RSS/LLM/PAGASA/PHIVOLCS helpers (tested)
  pages/           index.astro
  styles/          Tailwind theme tokens from the design spec
scripts/
  generate-site-data.ts   RSS/LLM → markdown (news + siteData)
```

All patches are generated dynamically by `npm run generate:site` (up to 5 from today's news +
live data). Categories and badge styles are derived from the generated patches.

Editable content cards:

- `src/content/kafra/kafra-message.md` — Kafra service desk staff: frontmatter sets name,
  booth, branch, avatar key, and greeting language; the markdown body is the greeting.
- `src/content/gmOnDuty/gm-on-duty.md` — GM on duty card: frontmatter sets name, role,
  location, status, and avatar key; the body is the GM message.
- `src/config/gmAvatars.ts` — maps avatar keys to the images in `src/assets/avatars/`.
- `src/config/reboot.ts` — weekly reboot day, hour, window length, extension hours, and note.

`npm run generate:site` rebuilds all generated data in one run:

- `src/content/news/*.md` — news wire: one markdown file per article, read from the Inquirer
  RSS feed (`https://newsinfo.inquirer.net/feed`) and rewritten in the Midgarts voice through
  the Google Gemini API (flash models, latest-to-oldest, keys from `GEMINIKEYS`).
- `src/content/siteData/site-data.md` — generated patches, emergency ticker notice, GM
  sanctions, GvG bulletin, realm server statuses (all LLM), plus live data: USD→Zeny from the
  Frankfurter API, the Angat Dam level from PAGASA's flood page, Manila weather from wttr.in,
  the "born on this day" entry from kahimyang.com's history API, recent earthquakes from
  PHIVOLCS, the PSE top gainer/loser via Firecrawl, and today's closest potentially
  hazardous near-Earth object from NASA's NeoWs feed. Runs with `--use-system-ca` because
  PHIVOLCS serves an incomplete certificate chain.

Never edit generated files by hand; components fall back to their built-in defaults when a
section is missing. If a remote source is down, the previous run's values are kept so pages
still render with stale data (the log prints `keeping previous value`).

## Disclaimer

Midgarts PH is an artistic parody. It is not affiliated with Gravity Co., Ltd., Level Up! Games,
or any Philippine government agency.
