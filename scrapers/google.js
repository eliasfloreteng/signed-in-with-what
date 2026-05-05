(function () {
  function cleanHost(u) {
    try {
      return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      // Treat bare hostname strings (like "eliasf.se") as valid
      if (typeof u === "string" && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u)) {
        return u.replace(/^www\./, "").toLowerCase();
      }
      return null;
    }
  }

  function isGoogleHost(h) {
    if (!h) return true;
    return (
      h === "google.com" ||
      h.endsWith(".google.com") ||
      h === "gstatic.com" ||
      h.endsWith(".gstatic.com") ||
      h === "youtube.com" ||
      h.endsWith(".youtube.com") ||
      h === "googleapis.com" ||
      h.endsWith(".googleapis.com") ||
      h === "googleusercontent.com" ||
      h.endsWith(".googleusercontent.com") ||
      h === "googlemail.com" ||
      h === "gmail.com" ||
      h === "android.com" ||
      h.endsWith(".android.com") ||
      h === "goo.gl" ||
      h === "g.co" ||
      h === "google.dev"
    );
  }

  // Extract the AF_initDataCallback blob with key 'ds:0' from the current page.
  // The blob contains a nested array; we traverse it to find app tuples of
  // shape [overviewId, [name, null, iconUrl, [privacyUrls], [tosUrls], homepageUrl], ...].
  function extractInitData() {
    const scripts = Array.from(document.querySelectorAll("script"));
    for (const s of scripts) {
      const text = s.textContent || "";
      if (!text.includes("AF_initDataCallback")) continue;
      if (!text.includes("'ds:0'") && !text.includes('"ds:0"')) continue;
      const m = text.match(/AF_initDataCallback\(\{[^]*?data:\s*(\[[\s\S]*?\])\s*,\s*sideChannel/);
      if (!m) continue;
      try {
        return JSON.parse(m[1]);
      } catch {
        /* malformed blob — skip */
      }
    }
    return null;
  }

  // Recursively walk the data structure looking for tuples that look like
  // [<id-string>, [<name>, null, <icon?>, ...]]
  function findAppTuples(data) {
    const out = [];
    // Google currently uses IDs like "AVBx9..." and "AcBx0..." on the
    // connections pages. Keep this broad enough to tolerate format changes.
    const ID_RE = /^A[A-Za-z0-9_-]{20,}$/;
    function walk(node) {
      if (!Array.isArray(node)) return;
      // Check if this node looks like a list of app tuples
      for (const item of node) {
        if (Array.isArray(item) && typeof item[0] === "string" && ID_RE.test(item[0]) && Array.isArray(item[1])) {
          const id = item[0];
          const meta = item[1];
          const name = typeof meta[0] === "string" ? meta[0] : null;
          // Look for the homepage string: it's typically the last string-typed
          // field in meta. Skip the icon (index 2, https://lh3.googleusercontent...
          // or gstatic.com) and any arrays of privacy/tos URLs.
          let homepage = null;
          for (let i = meta.length - 1; i >= 0; i--) {
            const v = meta[i];
            if (typeof v !== "string") continue;
            if (v === name) continue;
            if (v.startsWith("https://lh3.googleusercontent") || v.startsWith("https://www.gstatic.com") || v.startsWith("https://gstatic.com")) continue;
            // Accept http(s) URLs or bare hostnames like "lifx.com.au"
            const isUrl = /^https?:\/\//i.test(v);
            const isBareHost = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v);
            if (!isUrl && !isBareHost) continue;
            homepage = v;
            break;
          }
          if (name) {
            out.push({ id, name, homepage: homepage || null });
          }
        }
        walk(item);
      }
    }
    walk(data);
    return dedupeById(out);
  }

  function dedupeById(arr) {
    const seen = new Map();
    for (const e of arr) {
      if (!seen.has(e.id)) seen.set(e.id, e);
    }
    return [...seen.values()];
  }

  // Fallback: scrape list of anchors from DOM (name + overview URL), no homepage.
  function scrapeAnchors() {
    const anchors = Array.from(
      document.querySelectorAll("a.RlFDUe, a[href*='/connections/overview/']")
    );
    const apps = [];
    const seen = new Set();
    anchors.forEach((a) => {
      const m = a.href.match(/\/connections\/overview\/([^/?#]+)/);
      if (!m) return;
      const id = m[1];
      if (seen.has(id)) return;
      seen.add(id);
      const name = a.querySelector(".mMsbvc")?.textContent?.trim();
      if (!name) return;
      apps.push({ id, name, homepage: null });
    });
    return apps;
  }

  function scrape() {
    const data = extractInitData();
    let tuples = data ? findAppTuples(data) : [];
    if (!tuples.length) tuples = scrapeAnchors();
    const entries = tuples.map(({ id, name, homepage }) => {
      const host = homepage ? cleanHost(homepage) : null;
      return {
        id,
        name,
        host: host && !isGoogleHost(host) ? host : null,
        url: homepage || null,
        overviewUrl: `https://myaccount.google.com/connections/overview/${id}`,
      };
    });
    return entries;
  }

  async function runSync(setStatus) {
    setStatus("Reading your connections…");
    let entries = [];
    for (let i = 0; i < 10; i++) {
      entries = scrape();
      if (entries.length) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!entries.length) {
      return { error: "Couldn't find your connections on this page. Try scrolling and retry." };
    }
    const res = await browser.runtime.sendMessage({
      type: "scraped-authorizations",
      provider: "google",
      entries,
    });
    const withUrl = entries.filter((e) => e.host).length;
    return { count: res?.count ?? entries.length, withUrl };
  }

  if (/^\/connections\/?$/.test(location.pathname)) {
    const tryMount = () => {
      if (window.__siwwUi) {
        window.__siwwUi.mount("google", { onSync: runSync });
      } else {
        setTimeout(tryMount, 50);
      }
    };
    tryMount();
  }
})();
