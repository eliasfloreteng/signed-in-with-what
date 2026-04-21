// Shared UI for the on-page sync controls. Rendered inside a Shadow DOM so the
// host page's CSS can't alter our styles. Exposed as window.__siwwUi.
(function () {
  if (window.__siwwUi) return;

  const THEMES = {
    github: {
      label: "GitHub",
      accent: "#1f883d",
      accentHover: "#1a7f37",
      badgeBg: "#24292f",
    },
    google: {
      label: "Google",
      accent: "#1a73e8",
      accentHover: "#1557b0",
      badgeBg: "#1a73e8",
    },
  };

  const CSS = `
    :host, * { box-sizing: border-box; }
    .root {
      position: fixed;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      color: #1f2328;
    }

    /* Onboarding card (centered) */
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 20, 25, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483646;
      animation: fadeIn 160ms ease-out;
    }
    .card {
      background: #ffffff;
      color: #1f2328;
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.1);
      width: min(440px, 90vw);
      padding: 24px 24px 20px;
      animation: pop 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      color: white;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .badge-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: white; opacity: 0.9;
    }
    h2 {
      margin: 14px 0 6px;
      font-size: 20px;
      font-weight: 600;
      line-height: 1.25;
    }
    p { margin: 0 0 12px; font-size: 14px; line-height: 1.5; color: #404858; }
    ul.bullets {
      margin: 0 0 16px;
      padding: 0;
      list-style: none;
    }
    ul.bullets li {
      position: relative;
      padding: 4px 0 4px 22px;
      font-size: 13px;
      color: #404858;
      line-height: 1.5;
    }
    ul.bullets li::before {
      content: "";
      position: absolute;
      left: 4px;
      top: 11px;
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--accent);
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 18px;
      align-items: center;
    }
    button {
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      border-radius: 8px;
      padding: 9px 16px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: background 120ms, transform 80ms;
    }
    button:active { transform: translateY(1px); }
    button:disabled { opacity: 0.6; cursor: default; }
    .primary {
      background: var(--accent);
      color: white;
    }
    .primary:hover:not(:disabled) { background: var(--accent-hover); }
    .secondary {
      background: transparent;
      color: #404858;
      border-color: #d0d7de;
    }
    .secondary:hover:not(:disabled) { background: #f6f8fa; }
    .linklike {
      background: transparent;
      color: #57606a;
      border: none;
      padding: 9px 8px;
      font-size: 13px;
    }
    .linklike:hover:not(:disabled) { color: #1f2328; text-decoration: underline; }
    .status {
      font-size: 13px;
      color: #57606a;
      margin-right: auto;
      min-height: 18px;
    }
    .status.error { color: #cf222e; }
    .status.ok { color: #1a7f37; }

    /* Compact pill (subtle, once synced) */
    .pill {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483645;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #ffffff;
      border: 1px solid #d0d7de;
      border-radius: 999px;
      padding: 8px 14px 8px 10px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.08);
      font-size: 13px;
      cursor: pointer;
      transition: box-shadow 120ms, transform 80ms;
    }
    .pill:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.12); }
    .pill:active { transform: translateY(1px); }
    .pill .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--accent);
    }
    .pill .close {
      border: none;
      background: transparent;
      padding: 0 0 0 4px;
      margin-left: 2px;
      color: #8c959f;
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
    }
    .pill .close:hover { color: #1f2328; }

    @media (prefers-color-scheme: dark) {
      .card { background: #1c2128; color: #e6edf3; }
      p, ul.bullets li { color: #b3bac3; }
      .secondary { color: #b3bac3; border-color: #363b42; }
      .secondary:hover:not(:disabled) { background: #2b3139; }
      .linklike { color: #8c959f; }
      .linklike:hover:not(:disabled) { color: #e6edf3; }
      .pill { background: #1c2128; border-color: #363b42; color: #e6edf3; }
      .status { color: #8c959f; }
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pop {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to   { opacity: 1; transform: none; }
    }
  `;

  const DISMISS_KEY_PREFIX = "overlay-dismissed:";

  async function hasEverSynced(provider) {
    try {
      const { authorizations = {} } = await browser.storage.local.get("authorizations");
      return Boolean(authorizations[`${provider}:updatedAt`]);
    } catch {
      return false;
    }
  }

  async function isDismissed(provider) {
    try {
      const key = DISMISS_KEY_PREFIX + provider;
      const obj = await browser.storage.local.get(key);
      return Boolean(obj[key]);
    } catch {
      return false;
    }
  }

  async function setDismissed(provider, value) {
    const key = DISMISS_KEY_PREFIX + provider;
    await browser.storage.local.set({ [key]: value ? Date.now() : null });
  }

  function mount(provider, { onSync }) {
    const theme = THEMES[provider];
    if (!theme) return null;

    // Clean up any previous instance
    const existing = document.getElementById("__siww_ui_host");
    if (existing) existing.remove();

    const host = document.createElement("div");
    host.id = "__siww_ui_host";
    host.style.all = "initial";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS.replace(/var\(--accent\)/g, theme.accent)
      .replace(/var\(--accent-hover\)/g, theme.accentHover);
    shadow.appendChild(style);

    const root = document.createElement("div");
    root.className = "root";
    shadow.appendChild(root);
    document.documentElement.appendChild(host);

    let currentView = null;
    let statusTimer = null;

    function clearStatusTimer() {
      if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    }

    function renderOverlay() {
      currentView = "overlay";
      root.innerHTML = `
        <div class="overlay" part="overlay">
          <div class="card" role="dialog" aria-labelledby="siww-title">
            <span class="badge" style="background:${theme.badgeBg}">
              <span class="badge-dot"></span> Signed in with What?
            </span>
            <h2 id="siww-title">Import your ${theme.label} sign-ins</h2>
            <p>Scan the apps you've authorized with "Sign in with ${theme.label}" so the extension can flag them when you browse.</p>
            <ul class="bullets">
              <li>Reads the list already shown on this page.</li>
              <li>Stores app names and domains locally in your browser.</li>
              <li>Nothing is sent anywhere — no servers, no tracking.</li>
            </ul>
            <div class="actions">
              <div class="status" data-role="status"></div>
              <button class="linklike" data-action="dismiss">Not now</button>
              <button class="primary" data-action="sync">Sync now</button>
            </div>
          </div>
        </div>
      `;
      wireButtons();
    }

    function renderPill() {
      currentView = "pill";
      root.innerHTML = `
        <div class="pill" role="button" tabindex="0" data-action="sync" title="Re-sync your ${theme.label} authorizations">
          <span class="dot"></span>
          <span>Re-sync ${theme.label}</span>
          <button class="close" data-action="dismiss" title="Hide" aria-label="Hide">×</button>
        </div>
      `;
      wireButtons();
    }

    function wireButtons() {
      root.querySelectorAll("[data-action]").forEach((el) => {
        el.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const action = el.getAttribute("data-action");
          if (action === "sync") {
            await triggerSync();
          } else if (action === "dismiss") {
            await setDismissed(provider, true);
            host.remove();
          }
        });
      });
      // Keyboard activate pill
      const pill = root.querySelector(".pill");
      if (pill) {
        pill.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            triggerSync();
          }
        });
      }
    }

    function setStatus(text, kind) {
      const statusEl = root.querySelector("[data-role='status']");
      if (statusEl) {
        statusEl.textContent = text || "";
        statusEl.className = "status" + (kind ? " " + kind : "");
      }
      // For pill view, update the label text
      const pillLabel = root.querySelector(".pill > span:nth-child(2)");
      if (pillLabel && currentView === "pill" && text) {
        pillLabel.textContent = text;
      }
    }

    function setBusy(isBusy) {
      root.querySelectorAll("button").forEach((b) => {
        if (b.getAttribute("data-action") === "dismiss") return;
        b.disabled = isBusy;
      });
    }

    async function triggerSync() {
      clearStatusTimer();
      setBusy(true);
      setStatus("Scanning…");
      try {
        const report = await onSync((msg) => setStatus(msg));
        const { count = 0, withUrl = count, error } = report || {};
        if (error) {
          setStatus(error, "error");
        } else {
          setStatus(`Synced ${count} apps · ${withUrl} with URL`, "ok");
          // After first successful sync, switch to pill form and clear
          // dismissal so the user can see the confirmation.
          await setDismissed(provider, false);
          statusTimer = setTimeout(() => {
            renderPill();
            setStatus(`Synced ${count} ${theme.label} apps`);
          }, 1800);
        }
      } catch (e) {
        setStatus(String(e?.message || e), "error");
      } finally {
        setBusy(false);
      }
    }

    // Decide initial view
    (async () => {
      const [synced, dismissed] = await Promise.all([
        hasEverSynced(provider),
        isDismissed(provider),
      ]);
      if (!synced) {
        if (dismissed) {
          // user dismissed before syncing — show minimal pill so they can
          // still find it, but don't nag with the overlay.
          renderPill();
        } else {
          renderOverlay();
        }
      } else {
        if (dismissed) {
          // hide entirely after explicit dismissal of the subtle pill
          host.remove();
          return;
        }
        renderPill();
      }
    })();

    return {
      destroy: () => host.remove(),
      setStatus,
    };
  }

  window.__siwwUi = { mount };
})();
