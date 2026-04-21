const PROVIDER_LABEL = { github: "GitHub", google: "Google" };

function formatAge(ts) {
  if (!ts) return "not synced";
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]
  );
}

async function renderCurrent() {
  const el = document.getElementById("current");
  const { url, matches } = await browser.runtime.sendMessage({
    type: "query-current",
  });
  if (!url) {
    el.innerHTML = `<p class="empty">No active tab.</p>`;
    return;
  }
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {}
  if (!matches.length) {
    el.innerHTML = `<div class="site">${escapeHtml(host)}</div><p class="empty">No known Sign-in authorization for this site.</p>`;
    return;
  }
  const rows = matches
    .map(
      (m) => `
      <div class="match">
        <span class="badge ${m.provider}">${PROVIDER_LABEL[m.provider]}</span>
        <span>${escapeHtml(m.name || m.host)}</span>
      </div>`
    )
    .join("");
  el.innerHTML = `<div class="site">${escapeHtml(host)}</div>${rows}`;
}

async function renderMeta() {
  const all = await browser.runtime.sendMessage({ type: "get-all" });
  const gh = all["github"] || [];
  const go = all["google"] || [];
  document.getElementById("gh-meta").textContent =
    `${gh.length} apps · ${formatAge(all["github:updatedAt"])}`;
  document.getElementById("go-meta").textContent =
    `${go.length} apps · ${formatAge(all["google:updatedAt"])}`;
  return all;
}

function renderProviderApps(container, provider, entries) {
  if (!entries.length) return;
  const group = document.createElement("div");
  group.className = "provider-group";
  const hosts = entries.filter((e) => e.host).length;
  group.innerHTML = `
    <h3><span class="badge ${provider}">${PROVIDER_LABEL[provider]}</span>
    <span class="meta">${entries.length} apps · ${hosts} with URL</span></h3>
  `;
  const ul = document.createElement("ul");
  ul.className = "app-list";
  const sorted = [...entries].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );
  for (const e of sorted) {
    const li = document.createElement("li");
    const name = escapeHtml(e.name || "(unnamed)");
    if (e.host) {
      li.innerHTML = `<strong>${name}</strong><span class="host">${escapeHtml(e.host)}</span>`;
    } else {
      li.innerHTML = `<strong>${name}</strong><span class="host no-url">no URL</span>`;
    }
    ul.appendChild(li);
  }
  group.appendChild(ul);
  container.appendChild(group);
}

async function renderDebug(all) {
  const body = document.getElementById("debug-body");
  body.innerHTML = "";
  const providers = ["github", "google"];
  let total = 0;
  for (const p of providers) {
    const entries = Array.isArray(all[p]) ? all[p] : [];
    total += entries.length;
    renderProviderApps(body, p, entries);
  }
  if (total === 0) {
    body.innerHTML = `<p class="empty">No apps stored yet. Sync from GitHub / Google first.</p>`;
  }
}

document.getElementById("clear").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "clear" });
  const all = await renderMeta();
  renderCurrent();
  renderDebug(all);
});

document.getElementById("toggle-debug").addEventListener("click", (e) => {
  const body = document.getElementById("debug-body");
  const hidden = body.hasAttribute("hidden");
  if (hidden) body.removeAttribute("hidden");
  else body.setAttribute("hidden", "");
  e.target.textContent = hidden ? "hide" : "show";
});

(async () => {
  renderCurrent();
  const all = await renderMeta();
  renderDebug(all);
})();
