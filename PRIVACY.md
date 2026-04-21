# Privacy

This extension does not collect, transmit, or share any personal data.

## What is stored

When you click **Sync now** on `github.com/settings/applications` or
`myaccount.google.com/connections`, the extension reads the authorized-apps
list already rendered on that page and stores the following locally via the
browser's `storage.local` API:

- The app name.
- The app's declared homepage URL / hostname (where available).
- A timestamp of when the sync happened.
- A per-provider "overlay dismissed" flag.

That's it. No account identifiers, tokens, cookies, or request bodies are
read or stored.

## Where the data goes

Nowhere. The storage is local to your browser profile on your device. The
extension makes no outbound network requests other than to GitHub's same
`/settings/applications` and `/settings/connections/applications/<id>`
pages (during sync, to read each app's homepage URL). It does not talk to
any third-party server.

## Permissions explained

- `storage` — to remember the list you imported.
- `tabs` and `activeTab` — to match the current tab's hostname against the
  stored list and set a toolbar badge.
- Host permissions for `github.com/settings/applications*` and
  `myaccount.google.com/connections*` — the only two pages where syncing
  happens.

## Removing data

Open the toolbar popup and click **Clear all stored data**, or remove the
extension from Firefox. Both actions delete everything.
