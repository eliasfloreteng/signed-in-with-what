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

  // Read the total page count from a listing page. GitHub renders
  // <em class="current" data-total-pages="N"> inside .pagination.
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

  // Collect apps across all pagination pages. Start from the current page
  // (already rendered), then fetch remaining pages in parallel.
  async function collectAllApps(onProgress) {
    const first = scrapeListFromDoc(document);
    const totalPages = getTotalPages(document);
    if (totalPages <= 1) return first;
    onProgress?.(`Found ${totalPages} pages, fetching…`);
    const base = location.origin + location.pathname;
    const urls = [];
    for (let p = 2; p <= totalPages; p++) urls.push(`${base}?page=${p}`);
    const results = await Promise.all(
      urls.map(async (u) => {
        try {
          const doc = await fetchDoc(u);
          return scrapeListFromDoc(doc);
        } catch {
          return [];
        }
      })
    );
    const all = [first, ...results].flat();
    // Dedupe by id
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
      // On GitHub OAuth detail pages, the app's homepage is rendered in the
      // header as <a class="Link--inTextBlock" href="https://example.com">https://example.com</a>
      // adjacent to an octicon-link-external svg. Prefer Link--inTextBlock
      // anchors whose visible text is an http(s) URL, then fall back to any
      // external non-github anchor.
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
    } catch (e) {
      return null;
    }
  }

  function setStatus(btn, text, color) {
    btn.textContent = text;
    if (color) btn.style.background = color;
  }

  function createButton() {
    if (document.getElementById("__siww_btn")) return;
    const btn = document.createElement("button");
    btn.id = "__siww_btn";
    btn.type = "button";
    btn.textContent = "Sync to 'Signed in with What?'";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: 99999,
      padding: "10px 14px",
      background: "#1f883d",
      color: "white",
      border: "none",
      borderRadius: "6px",
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    });
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      setStatus(btn, "Scanning list…", "#0969da");
      const apps = await collectAllApps((msg) => setStatus(btn, msg));
      if (!apps.length) {
        setStatus(btn, "No apps found on page", "#cf222e");
        btn.disabled = false;
        return;
      }
      setStatus(btn, `Fetching ${apps.length} apps…`, "#0969da");

      const entries = [];
      // Fetch detail pages in parallel but with a small concurrency limit
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
          setStatus(btn, `Fetched ${entries.length}/${apps.length}…`);
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      const res = await browser.runtime.sendMessage({
        type: "scraped-authorizations",
        provider: "github",
        entries,
      });
      const hosts = entries.filter((e) => e.host).length;
      setStatus(btn, `Synced ${res?.count ?? entries.length} apps (${hosts} with URL)`, "#0969da");
      btn.disabled = false;
    });
    document.body.appendChild(btn);
  }

  if (/^\/settings\/applications/.test(location.pathname)) {
    createButton();
  }
})();
