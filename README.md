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

The site deploys to GitHub Pages via `.github/workflows/deploy.yml` on manual dispatch only —
there is no built-in schedule. Pushes to `main` do not deploy. Add `GEMINIKEYS`,
`FIRECRAWL_API_KEY`, and `NASA_API_KEY` as repository secrets. The workflow runs
`npm run generate:site` explicitly, then `npm run build` (which does not fetch), and deploys.

### Trigger via webhook (cron-job.org)

Because the workflow already declares `workflow_dispatch`, an external scheduler can queue a
run through GitHub's REST API — no workflow change needed. Create a fine-grained PAT for this
repository with `Actions: Read and write` + `Contents: Read` (Metadata is added automatically),
then create a cron job on [cron-job.org](https://cron-job.org):

| Field | Value |
| ----- | ----- |
| URL | `https://api.github.com/repos/rpfilomeno/phsim-astro/actions/workflows/deploy.yml/dispatches` |
| Request method | `POST` |
| Request body | `{"ref":"main"}` |
| Headers | `Accept: application/vnd.github+json`<br>`Content-Type: application/json`<br>`X-GitHub-Api-Version: 2022-11-28`<br>`Authorization: Bearer <PAT>` |

A `2xx` response means the run was queued; it appears in the Actions tab like a manual run.
Enable the job's failure e-mail alerts and rotate the PAT before it expires — an expired token
fails with `401` and the trigger silently stops firing.

Custom domain: `phsim.rogverse.fyi` (see `public/CNAME`). Point a DNS CNAME record at
`rpfilomeno.github.io`, then set the custom domain under Settings → Pages. The site is served
from the domain root, so no `BASE_PATH` is needed.

### Alternative: build+push via Dokploy (Docker)

`Dockerfile` + `docker-entrypoint.sh` provide a fully parallel path that leaves `.github`
untouched: the container regenerates data, builds `dist/`, and force-pushes it to another
GitHub repo's `main` branch, repeating every `PUSH_INTERVAL_HOURS` (default 24; `0` =
run once and exit).

Env vars (define in `.env` for local runs; mirror them into Dokploy's app environment —
`.env` is gitignored, so Dokploy cannot read it from the repo):

| Variable | Purpose |
| -------- | ------- |
| `DEPLOY_REPO` | Target repo, e.g. `owner/other-repo` (replaces its `main` branch with `dist/`) |
| `GITHUB_TOKEN` | Fine-grained PAT with `contents: write` on the target repo |
| `PUSH_INTERVAL_HOURS` | Hours between rebuild+push cycles (default 24, `0` = one-shot) |
| `GEMINIKEYS`, `FIRECRAWL_API_KEY`, `NASA_API_KEY` | Same as `.env.example` |

Local run (build once, no push if `DEPLOY_REPO`/`GITHUB_TOKEN` are absent):

```sh
docker build -t phsim-builder .
docker run --rm --env-file .env -e PUSH_INTERVAL_HOURS=0 phsim-builder
```

Dokploy: create an app from this repo, build method **Dockerfile**, paste the env vars above,
expose no port (it is a long-running task, not a server), and keep the container running —
the entrypoint's sleep loop is the schedule.

One-time on the target repo: create it, enable Pages with source = `main` branch (root).
Note the push force-replaces the whole `main` branch with `dist/`, so keep that repo empty
of anything else; commits carry `[skip ci]` so the PAT push won't trigger its workflows.

`scripts/phivolcs-ca.pem` is a public GlobalSign intermediate that completes PHIVOLCS's
incomplete certificate chain inside the container (via `NODE_EXTRA_CA_CERTS`).

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
live data). Categories and badge styles are derived from the generated patches. The patch
window's log filename is stamped from `siteData.generatedAt` as
`PH_PatchLog_Episode_7107_Archipelago_<YYYYMMDD-HHmm>.exe` (Asia/Manila), falling back to the
unstamped name when no timestamp exists.

Editable content cards:

- `src/content/kafra/kafra-message.md` — Kafra service desk staff: frontmatter sets name,
  booth, branch, avatar key, and greeting language; the markdown body is the greeting.
- `src/content/gmOnDuty/gm-on-duty.md` — GM on duty card: frontmatter sets name, role,
  location, status, and avatar key; the body is the GM message. The card doubles as the button
  that opens the Botpress webchat bubble.
- `src/config/gmAvatars.ts` — maps avatar keys to the images in `src/assets/avatars/`.
- `src/config/reboot.ts` — weekly reboot day, hour, window length, extension hours, and note.
- `src/layouts/Layout.astro` — the Botpress webchat embed (loader + bot config scripts) and
  its site-palette theming (navy/gold CSS variables injected into the widget's shadow root).

`npm run generate:site` rebuilds all generated data in one run:

- `src/content/news/*.md` — news wire: one markdown file per article, read from the Inquirer
  RSS feed (`https://newsinfo.inquirer.net/feed`) and rewritten in the Midgarts voice through
  the Google Gemini API (flash models, latest-to-oldest, keys from `GEMINIKEYS`). Rewrites run
  in parallel at `floor(keys / 2)` concurrent Gemini calls, each with up to 3 attempts; the key
  rolls on every attempt so all keys are used equally, models answering `429`/`404` are marked
  dead for the rest of the run, and articles that still fail are skipped (logged as `skipped`).
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
