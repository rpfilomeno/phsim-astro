## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Project facts

- `npm run build` never fetches; `npm run generate:site` is the only network step (Gemini,
  Inquirer RSS, PHIVOLCS, Firecrawl, NASA, wttr.in). It needs `.env`, runs with
  `--use-system-ca`, spends API quota, and takes minutes — run it only when data must be
  regenerated, never as a build side-effect.
- Generation runs Gemini calls in parallel at `floor(keys / 2)`, up to 3 attempts each; the
  key rolls on every attempt (equal key usage) and models returning `429`/`404` are marked
  dead for the rest of the run. Transient `503`/timeout failures fall back to the previous
  run's data (`keeping previous value`).
- Never hand-edit generated content: `src/content/news/*.md`,
  `src/content/siteData/site-data.md`, `src/content/patches/gen-*.md`. Re-run
  `generate:site`; components fall back to built-in defaults when a section is missing.
- Deploys never trigger on push: only the daily schedule (08:00 PHT), manual dispatch, or the
  cron-job.org webhook (a `workflow_dispatch` REST call — see README). Leave `.github/`
  untouched unless explicitly asked.
- PowerShell here: `;` instead of `&&`, no `head`/`tail`, and npm output often ends with
  `Exited with code 1` even on success — check for `npm verbose exit 0` or an explicit marker.

## Git

Do not auto-push. Commit only when asked; leave pushing to the user unless explicitly requested.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
