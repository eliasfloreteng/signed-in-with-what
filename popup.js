const PROVIDER_LABEL = { github: "GitHub", google: "Google" };
const PROVIDER_URL = {
  github: "https://github.com/settings/applications",
  google: "https://myaccount.google.com/connections",
};

function formatAge(ts) {
  if (!ts) return "not synced yet";
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

async function openOrFocusProvider(provider) {
  const url = PROVIDER_URL[provider];
  if (!url) return;
  // Try to find an existing tab already on the provider's page
  const tabs = await browser.tabs.query({ url: url + "*" });
  if (tabs.length) {
    await browser.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId != null) {
      await browser.windows.update(tabs[0].windowId, { focused: true });
    }
  } else {
    await browser.tabs.create({ url });
  }
  window.close();
}

function wireProviderButtons() {
  document.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => openOrFocusProvider(el.dataset.open));
  });
}

async function renderCurrent(currentSection) {
  const { url, matches } = await browser.runtime.sendMessage({
    type: "query-current",
  });
  if (!url) {
    currentSection.hidden = true;
    return;
  }
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* noop */
  }
  if (!host) {
    currentSection.hidden = true;
    return;
  }
  currentSection.hidden = false;
  currentSection.replaceChildren();
  currentSection.appendChild(el("div", { class: "site", text: host }));
  if (!matches.length) {
    currentSection.appendChild(
      el("p", { class: "empty", text: "No known Sign-in authorization for this site." })
    );
    return;
  }
  for (const m of matches) {
    currentSection.appendChild(
      el("div", { class: "match" }, [
        el("span", {
          class: `badge ${m.provider}`,
          text: PROVIDER_LABEL[m.provider],
        }),
        el("span", { text: m.name || m.host }),
      ])
    );
  }
}

function renderProviderMeta(all) {
  const gh = Array.isArray(all["github"]) ? all["github"] : [];
  const go = Array.isArray(all["google"]) ? all["google"] : [];
  document.getElementById("gh-meta").textContent =
    `${gh.length} apps · ${formatAge(all["github:updatedAt"])}`;
  document.getElementById("go-meta").textContent =
    `${go.length} apps · ${formatAge(all["google:updatedAt"])}`;
}

function renderProviderApps(container, provider, entries) {
  if (!entries.length) return;
  const hosts = entries.filter((e) => e.host).length;
  const group = el("div", { class: "provider-group" }, [
    el("h3", {}, [
      el("span", { class: `badge ${provider}`, text: PROVIDER_LABEL[provider] }),
      " ",
      el("span", {
        class: "meta",
        text: `${entries.length} apps · ${hosts} with URL`,
      }),
    ]),
  ]);
  const ul = el("ul", { class: "app-list" });
  const sorted = [...entries].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );
  for (const e of sorted) {
    const li = el("li", {}, [
      el("strong", { text: e.name || "(unnamed)" }),
      e.host
        ? el("span", { class: "host", text: e.host })
        : el("span", { class: "host no-url", text: "no URL" }),
    ]);
    ul.appendChild(li);
  }
  group.appendChild(ul);
  container.appendChild(group);
}

function renderDebug(all) {
  const body = document.getElementById("debug-body");
  body.replaceChildren();
  const providers = ["github", "google"];
  let total = 0;
  for (const p of providers) {
    const entries = Array.isArray(all[p]) ? all[p] : [];
    total += entries.length;
    renderProviderApps(body, p, entries);
  }
  if (total === 0) {
    body.appendChild(el("p", { class: "empty", text: "Nothing synced yet." }));
  }
}

function show(id, visible = true) {
  const el = document.getElementById(id);
  if (!el) return;
  if (visible) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
}

async function render() {
  const all = await browser.runtime.sendMessage({ type: "get-all" });
  const hasAny =
    Boolean(all["github:updatedAt"]) || Boolean(all["google:updatedAt"]);

  if (!hasAny) {
    show("onboarding", true);
    show("current", false);
    show("actions", false);
    show("debug", false);
    show("footer", false);
    return;
  }

  show("onboarding", false);
  show("actions", true);
  show("debug", true);
  show("footer", true);

  renderProviderMeta(all);
  renderDebug(all);
  await renderCurrent(document.getElementById("current"));
}

document.getElementById("clear").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "clear" });
  render();
});

document.getElementById("toggle-debug").addEventListener("click", (e) => {
  const body = document.getElementById("debug-body");
  const hidden = body.hasAttribute("hidden");
  if (hidden) body.removeAttribute("hidden");
  else body.setAttribute("hidden", "");
  e.target.textContent = hidden ? "hide" : "show";
});

wireProviderButtons();
render();
