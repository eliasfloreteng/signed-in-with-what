(function () {
  function cleanHost(u) {
    try {
      return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return null;
    }
  }

  function isGithubHost(h) {
    return h === "github.com" || h.endsWith(".github.com") || h === "githubusercontent.com" || h.endsWith(".githubusercontent.com");
  }

  // Scrape the list of apps from a single /settings/applications page
  function scrapeListFromDoc(doc) {
    const items = doc.querySelectorAll("div[id^='oauth-authorization-']");
    const apps = [];
    items.forEach((el) => {
      const nameEl = el.querySelector("a.developer-app-name, .developer-app-name");
      const name = nameEl?.textContent?.trim();
      if (!name) return;
      const detailLink =
        el.querySelector("a.developer-app-name")?.getAttribute("href") ||
        el.querySelector("a.CircleBadge")?.getAttribute("href");
      const id = el.getAttribute("data-id") || el.id.replace("oauth-authorization-", "");
      apps.push({
        id,
        name,
        detailUrl: detailLink ? new URL(detailLink, location.origin).href : null,
      });
    });
    return apps;
  }

  function getTotalPages(doc) {
    const cur = doc.querySelector(".pagination em.current[data-total-pages]");
    const n = cur ? parseInt(cur.getAttribute("data-total-pages"), 10) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  async function fetchDoc(url) {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    const html = await r.text();
    return new DOMParser().parseFromString(html, "text/html");
  }

  async function collectAllApps(onProgress) {
    const first = scrapeListFromDoc(document);
    const totalPages = getTotalPages(document);
    if (totalPages <= 1) return first;
    onProgress?.(`Reading ${totalPages} pages…`);
    const base = location.origin + location.pathname;
    const urls = [];
    for (let p = 2; p <= totalPages; p++) urls.push(`${base}?page=${p}`);
    const results = await Promise.all(
      urls.map(async (u) => {
        try {
          return scrapeListFromDoc(await fetchDoc(u));
        } catch {
          return [];
        }
      })
    );
    const all = [first, ...results].flat();
    const seen = new Set();
    const out = [];
    for (const a of all) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    return out;
  }

  async function fetchHomepageFor(app) {
    if (!app.detailUrl) return null;
    try {
      const r = await fetch(app.detailUrl, { credentials: "include" });
      if (!r.ok) return null;
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const linkText = Array.from(doc.querySelectorAll("a.Link--inTextBlock[href^='http']"))
        .map((a) => ({ href: a.getAttribute("href"), text: a.textContent?.trim() || "" }))
        .filter(({ href, text }) => {
          const h = cleanHost(href);
          return h && !isGithubHost(h) && /^https?:\/\//i.test(text);
        });
      if (linkText.length) {
        return { host: cleanHost(linkText[0].href), url: linkText[0].href };
      }
      const anchors = Array.from(doc.querySelectorAll("a[href^='http']"));
      const external = anchors
        .map((a) => ({ href: a.getAttribute("href"), text: a.textContent?.trim() || "" }))
        .filter(({ href }) => {
          const h = cleanHost(href);
          return h && !isGithubHost(h);
        });
      const urlLike = external.find((a) => /^https?:\/\//i.test(a.text));
      const pick = urlLike || external[0];
      if (!pick) return null;
      return { host: cleanHost(pick.href), url: pick.href };
    } catch {
      return null;
    }
  }

  async function runSync(setStatus) {
    setStatus("Scanning apps list…");
    const apps = await collectAllApps(setStatus);
    if (!apps.length) {
      return { error: "No authorized apps found on this page." };
    }
    setStatus(`Fetching homepages for ${apps.length} apps…`);

    const entries = [];
    const CONCURRENCY = 5;
    let i = 0;
    async function worker() {
      while (i < apps.length) {
        const idx = i++;
        const app = apps[idx];
        const home = await fetchHomepageFor(app);
        entries.push({
          id: app.id,
          name: app.name,
          host: home?.host || null,
          url: home?.url || null,
          detailUrl: app.detailUrl,
        });
        setStatus(`Loading apps: ${entries.length}/${apps.length}…`);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const res = await browser.runtime.sendMessage({
      type: "scraped-authorizations",
      provider: "github",
      entries,
    });
    const withUrl = entries.filter((e) => e.host).length;
    return { count: res?.count ?? entries.length, withUrl };
  }

  if (/^\/settings\/applications/.test(location.pathname)) {
    // Ensure UI helper is loaded (content_scripts array injects ui.js first)
    const tryMount = () => {
      if (window.__siwwUi) {
        window.__siwwUi.mount("github", { onSync: runSync });
      } else {
        setTimeout(tryMount, 50);
      }
    };
    tryMount();
  }
})();
