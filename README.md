# Signed in with What?

Firefox extension that tells you whether you've previously authorized the current
site via "Sign in with GitHub" or "Sign in with Google".

## How it works

Those provider pages require authentication and can't be scraped headlessly. The
extension uses a manual-sync model:

1. Open `https://github.com/settings/applications` — click the green **Sync to
   'Signed in with What?'** button that appears in the bottom-right.
2. Open `https://myaccount.google.com/connections` — click the blue sync button.

The content scripts read the list of authorized apps from the DOM, extract each
app's homepage hostname, and store the list in `browser.storage.local`.

Whenever you browse, the background script matches the current tab's hostname
against the stored list and sets a toolbar badge (`GH`, `G`, or a count). Click
the toolbar icon to see which provider(s) and which app entries matched.

## Install (temporary, for development)

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` in this directory.

The extension stays loaded until Firefox restarts.

## Files

- `manifest.json` — MV3 manifest
- `background.js` — badge + matching logic, storage, messaging
- `scrapers/github.js` — content script for GitHub authorized apps
- `scrapers/google.js` — content script for Google connections
- `popup.html` / `popup.js` / `popup.css` — toolbar popup
- `icons/` — toolbar icons

## Limitations

- Google's account UI is heavily obfuscated; the scraper looks for external
  anchor links and hostname-like strings near headings. If Google changes the
  layout the scraper may need to be updated.
- Matching is hostname-based. Apps whose homepage differs from the site you
  actually log in to won't match. You can extend stored entries in
  `browser.storage.local` manually if needed.
- Only GitHub and Google providers are supported initially.
