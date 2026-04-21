const PROVIDERS = {
  github: { label: "GitHub", color: "#24292f" },
  google: { label: "Google", color: "#1a73e8" },
};

function normalizeHost(host) {
  return host.replace(/^www\./, "").toLowerCase();
}

function hostMatches(pageHost, entryHost) {
  const a = normalizeHost(pageHost);
  const b = normalizeHost(entryHost);
  return a === b || a.endsWith("." + b) || b.endsWith("." + a);
}

async function getAuthorizations() {
  const { authorizations = {} } = await browser.storage.local.get("authorizations");
  return authorizations;
}

async function findMatchesForUrl(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return [];
  }
  const all = await getAuthorizations();
  const matches = [];
  for (const [provider, entries] of Object.entries(all)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (entry.host && hostMatches(host, entry.host)) {
        matches.push({ provider, ...entry });
      } else if (entry.url) {
        try {
          const entryHost = new URL(entry.url).hostname;
          if (hostMatches(host, entryHost)) {
            matches.push({ provider, ...entry, host: entryHost });
          }
        } catch {
          /* ignore malformed */
        }
      }
    }
  }
  return matches;
}

async function updateBadgeForTab(tabId, url) {
  if (!url || !/^https?:/.test(url)) {
    await browser.action.setBadgeText({ tabId, text: "" });
    await browser.action.setTitle({ tabId, title: "Signed in with What?" });
    return;
  }
  const matches = await findMatchesForUrl(url);
  if (matches.length === 0) {
    await browser.action.setBadgeText({ tabId, text: "" });
    await browser.action.setTitle({ tabId, title: "No known Sign-in authorization for this site" });
    return;
  }
  const providers = [...new Set(matches.map((m) => m.provider))];
  const symbol = providers.length === 1 ? providerSymbol(providers[0]) : String(providers.length);
  await browser.action.setBadgeText({ tabId, text: symbol });
  await browser.action.setBadgeBackgroundColor({
    tabId,
    color: providers.length === 1 ? PROVIDERS[providers[0]].color : "#555",
  });
  const title = providers.map((p) => `Signed in with ${PROVIDERS[p].label}`).join(", ");
  await browser.action.setTitle({ tabId, title });
}

function providerSymbol(provider) {
  if (provider === "github") return "GH";
  if (provider === "google") return "G";
  return "?";
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    updateBadgeForTab(tabId, tab.url);
  }
});

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await browser.tabs.get(tabId);
  updateBadgeForTab(tabId, tab.url);
});

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg?.type === "scraped-authorizations") {
    const { provider, entries } = msg;
    const all = await getAuthorizations();
    all[provider] = entries;
    all[`${provider}:updatedAt`] = Date.now();
    await browser.storage.local.set({ authorizations: all });
    const tabs = await browser.tabs.query({});
    for (const t of tabs) {
      if (t.id != null && t.url) updateBadgeForTab(t.id, t.url);
    }
    return { ok: true, count: entries.length };
  }
  if (msg?.type === "query-current") {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.url) return { url: null, matches: [] };
    const matches = await findMatchesForUrl(tab.url);
    return { url: tab.url, matches };
  }
  if (msg?.type === "get-all") {
    const all = await getAuthorizations();
    return all;
  }
  if (msg?.type === "clear") {
    await browser.storage.local.remove([
      "authorizations",
      "overlay-dismissed:github",
      "overlay-dismissed:google",
    ]);
    const tabs = await browser.tabs.query({});
    for (const t of tabs) if (t.id != null && t.url) updateBadgeForTab(t.id, t.url);
    return { ok: true };
  }
});
