# CLAUDE.md

Project-local notes for working on this Firefox extension.

## What this is

MV3 Firefox extension. On the provider pages
(`github.com/settings/applications`, `github.com/settings/apps/authorizations`,
and `myaccount.google.com/connections`) a shadow-DOM overlay invites the user
to **Sync now**. The content script scrapes the authorized-apps list already
rendered on that page, resolves each app's homepage URL, and stores everything
in `browser.storage.local`. While browsing, `background.js` matches the current
tab's hostname against that stored list and updates the toolbar badge.

Everything runs locally. No network traffic beyond the provider's own pages.

## Layout

- `manifest.json` — MV3, Firefox-specific (`browser_specific_settings.gecko`).
  `strict_min_version: "142.0"` is required for `data_collection_permissions`.
- `background.js` — non-persistent `background.scripts` (MV3-Firefox form).
  Handles badge, `hostMatches`, and the messages:
  `scraped-authorizations`, `query-current`, `get-all`, `clear`.
- `scrapers/ui.js` — **shared** shadow-DOM overlay + corner pill. Exposes
  `window.__siwwUi.mount(provider, {onSync})`. Loaded before each provider's
  scraper (order matters — see `content_scripts` in `manifest.json`).
- `scrapers/github.js` — scrapes `div[id^='oauth-authorization-']` from both
  GitHub pages (`/settings/applications` and `/settings/apps/authorizations`),
  follows pagination via `.pagination em.current[data-total-pages]`, then
  fetches each app's detail page to read `a.Link--inTextBlock[href^='http']`.
- `scrapers/google.js` — parses the inline `AF_initDataCallback({key:'ds:0',…})`
  JSON blob. Walks recursively for tuples matching
  `[id, [name, null, icon, [priv], [tos], homepage], …]` where id matches
  `/^AVBx9[A-Za-z0-9_-]{20,}/`. No `Function()` eval — strictly
  `JSON.parse` on a regex-extracted array (AMO-safe).
- `popup.html` / `popup.js` / `popup.css` — onboarding + status popup.
- `pages/` — saved authenticated HTML from the provider pages used for
  offline scraper development. **Never committed** (`.gitignore`) because
  the dumps contain personal account data.

## Dev loop

Install temporarily:

1. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…**
2. Pick `manifest.json`.

After code changes, hit the **Reload** button on the same page. The extension
stays loaded until Firefox restarts.

Run-and-reload in one shot (spins up a Firefox instance with the extension
pre-loaded, auto-reloads on file changes):

```sh
bunx web-ext run --firefox=firefox
```

## Scraping work

Authenticated pages can't be fetched headlessly, so we cannot iterate with a
standalone Node script — the scraper has to run as a content script. For
offline iteration:

1. Save the full provider page via **File → Save Page As → Web Page, Complete**
   into `pages/` (the dir is gitignored).
2. Write a small harness or parse the saved HTML in a scratch file to exercise
   the scraping functions in isolation. `scrapers/github.js` and
   `scrapers/google.js` both export nothing; to test offline, temporarily
   inline a small runner or copy the relevant function into a Bun script.

When verifying a live sync, open the provider page, click **Sync now** on the
overlay, then open the popup and press **show** under Debug to see the exact
apps+hosts captured.

Clearing state during development: popup → **Clear all stored data**. This also
resets the `overlay-dismissed:*` flags so the onboarding overlay reappears.

## Common pitfalls

- **Ordering of content scripts.** `ui.js` MUST come before the provider
  scraper in `manifest.json > content_scripts[*].js`, because the scraper
  calls `window.__siwwUi.mount(...)`.
- **Shadow DOM styling.** Inside `scrapers/ui.js` the CSS string uses
  `var(--accent)` as placeholders; `mount()` substitutes them via
  `String.prototype.replace` before attaching the `<style>` (we don't set
  CSS custom properties on the host). If you add theme variables, follow
  the same substitution pattern.
- **Google's JSON is brittle.** `AF_initDataCallback` can ship with a
  trailing `, sideChannel: …` or similar; the extractor uses a non-greedy
  regex that stops at `, sideChannel`. If Google changes layout, update
  `extractInitData` regex and the `findAppTuples` shape predicate.
- **GitHub pagination.** Missing `em.current[data-total-pages]` means
  single-page; `getTotalPages` should return `1` in that case, not `NaN`.
- **GitHub has two lists.** Keep both `/settings/applications` and
  `/settings/apps/authorizations` wired in `manifest.json` and
  `scrapers/github.js`, otherwise the sync only imports part of the account's
  authorizations.
- **Hostname matching.** `background.js > hostMatches` uses equality or
  `endsWith "." + other`. Adding a third mode (e.g. suffix list) means
  touching both that function and the popup's "matches" rendering.

## AMO publishing

Checked in for submission:

- Extension ID `@signed-in-with`
- `LICENSE` (MIT) and `PRIVACY.md`
- `data_collection_permissions.required: ["none"]` in the manifest
- Screenshot under `screenshots/popup-match.png` (referenced from README)

Lint (must be zero warnings before building):

```sh
bunx web-ext lint --ignore-files 'pages/**' 'screenshots/**'
```

Build the submission zip:

```sh
bunx web-ext build \
  --ignore-files 'pages/**' 'screenshots/**' \
    'PRIVACY.md' 'LICENSE' 'README.md' \
    '.git/**' '.gitignore' 'web-ext-artifacts/**' \
  --overwrite-dest
```

Output lands in `web-ext-artifacts/signed_in_with_what_-<version>.zip`. Upload
that to `addons.mozilla.org/developers/`. Bump `manifest.json > version`
before every new submission — AMO rejects duplicate versions.

Release checklist:

- [ ] `version` bumped in `manifest.json`
- [ ] `web-ext lint` → 0 warnings
- [ ] `web-ext build` → zip produced
- [ ] Temporary-install the zip (or `web-ext run`) and confirm both sync flows
- [ ] Commit + tag `vX.Y.Z`, push
- [ ] Upload zip to AMO

## Conventions

- Prefer Bun (`bunx`) over npm / npx for one-off tool invocations.
- No build step. Ship source verbatim. Keep dependencies at zero.
- No inline `<script>` in HTML — AMO flags it. Keep `popup.js` as an
  external file linked from `popup.html`.
- No `Function()` / `eval` / `new Function(...)`. If you need to parse
  embedded JSON, extract with a regex and `JSON.parse`.
- DOM construction via small `el()` / `h()` helpers rather than
  `innerHTML = …` — the latter trips AMO's `UNSAFE_VAR_ASSIGNMENT`.
- Don't commit anything under `pages/` — those dumps contain PII.
