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
| `npm test`        | Run the reboot-countdown unit tests        |

## Structure

```text
src/
  components/   Header, ticker, patch window, side rail, footer
  data/         Patch note content and filter categories
  layouts/      HTML shell, fonts, meta
  lib/          Weekly reboot window + countdown formatting (tested)
  pages/        index.astro
  styles/       Tailwind theme tokens from the design spec
```

Patch content lives in `src/data/patches.ts`; edit it there rather than in markup.

## Disclaimer

Midgarts PH is an artistic parody. It is not affiliated with Gravity Co., Ltd., Level Up! Games,
or any Philippine government agency.
