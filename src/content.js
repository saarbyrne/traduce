// @ts-check
// Runs on every page. Kept small: nothing is built until there is a selection.

(() => {
  const w = /** @type {any} */ (window);
  if (w.__traduce) return;
  w.__traduce = true;

  const { detect, translate, other } = w.Traduce;
  const MAX_CHARS = 5000;
  const coarse = matchMedia('(pointer: coarse)');

  /**
   * @typedef {{
   *   text: string,
   *   range: Range | null,
   *   field: HTMLInputElement | HTMLTextAreaElement | null,
   *   start: number, end: number,
   *   editable: boolean,
   * }} Target
   */

  /** The text the open panel is working on. */
  /** @type {Target | null} */
  let target = null;
  /** The current page selection, for the floating button. */
  /** @type {Target | null} */
  let pending = null;
  let openId = 0;
  let showButton = true;
  chrome.storage?.sync.get({ showButton: true }).then((s) => { showButton = s.showButton; }).catch(() => {});
  chrome.storage?.onChanged.addListener((c) => { if (c.showButton) { showButton = c.showButton.newValue; if (!showButton) hideButton(); } });

  // ---------- Selection ----------

  /** @returns {Target | null} */
  function readSelection() {
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && /^(text|search|url|email|)$/.test(active.type))) {
      const start = active.selectionStart ?? 0;
      const end = active.selectionEnd ?? 0;
      const text = active.value.slice(start, end).trim();
      if (!text) return null;
      return { text, range: null, field: active, start, end, editable: !active.readOnly && !active.disabled };
    }
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = sel.toString().trim();
    if (!text) return null;
    const range = sel.getRangeAt(0).cloneRange();
    if (host && host.contains(range.commonAncestorContainer)) return null;
    const node = range.commonAncestorContainer;
    const el = node instanceof Element ? node : node.parentElement;
    return { text, range, field: null, start: 0, end: 0, editable: !!el?.isContentEditable };
  }

  /** @param {Target} t @returns {DOMRect | null} */
  function anchorRect(t) {
    if (t.field) return t.field.getBoundingClientRect();
    if (!t.range) return null;
    const rects = t.range.getClientRects();
    return rects.length ? rects[rects.length - 1] : t.range.getBoundingClientRect();
  }

  // ---------- Shadow root ----------

  /** @type {HTMLElement | null} */
  let host = null;
  /** @type {ShadowRoot} */
  let root;
  /** @type {HTMLButtonElement} */
  let fab;
  /** @type {HTMLElement | null} */
  let panel = null;

  function ensureHost() {
    if (host) return;
    host = document.createElement('traduce-root');
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.append(style);

    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'fab';
    fab.setAttribute('aria-label', 'Traducir');
    fab.innerHTML = `${ICON}<span class="key"></span>`;
    fab.hidden = true;
    showShortcut();
    // Keep the page selection when the button is pressed.
    fab.addEventListener('mousedown', (e) => e.preventDefault());
    fab.addEventListener('click', () => { if (pending) openPanel(pending); });
    root.append(fab);

    document.documentElement.append(host);
  }

  // ---------- Floating button ----------

  let selTimer = 0;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selTimer);
    selTimer = window.setTimeout(onSelection, coarse.matches ? 350 : 150);
  });

  function onSelection() {
    const t = readSelection();
    if (!t) {
      // A tap on the button can clear the selection first, so keep the last target.
      hideButton();
      return;
    }
    pending = t;
    if (!showButton || panel || t.text.length > MAX_CHARS) return;
    ensureHost();
    fab.hidden = false;
    place();
  }

  /** Puts the current shortcut in the button. Hidden on touch screens, which have no keyboard. */
  function showShortcut() {
    chrome.runtime.sendMessage({ type: 'shortcut' }).then((res) => {
      const key = /** @type {HTMLElement} */ (fab.querySelector('.key'));
      const text = coarse.matches ? '' : String(res?.shortcut || FALLBACK_LABEL);
      key.textContent = text;
      fab.classList.toggle('pill', !!text);
      fab.setAttribute('aria-label', text ? `Traducir (${text})` : 'Traducir');
      fab.title = text ? `Traducir · ${text}` : 'Traducir';
    }).catch(() => {});
  }

  // Some Chromium browsers (Dia, Arc and others) do not pass extension shortcuts on.
  // So the page also listens for Alt/Option+T itself. It only acts when text is selected.
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const FALLBACK_LABEL = isMac ? '⌥T' : 'Alt+T';
  let lastOpen = 0;

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyT' || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return;
    const t = readSelection();
    if (!t || t.text.length > MAX_CHARS) return;
    // Stop Option+T from typing † in a text field.
    e.preventDefault();
    e.stopPropagation();
    openOnce(t);
  }, true);

  /** The browser shortcut and the page listener can both fire, so open only once. @param {Target} t */
  function openOnce(t) {
    if (Date.now() - lastOpen < 400) return;
    lastOpen = Date.now();
    openPanel(t, true);
  }

  function hideButton() {
    if (fab) fab.hidden = true;
  }

  // ---------- Panel ----------

  /** @type {{ from: 'es' | 'en', to: 'es' | 'en', result: string, req: number }} */
  const state = { from: 'es', to: 'en', result: '', req: 0 };

  /** @param {Target} t @param {boolean} [focus] Move focus into the panel, for keyboard use. */
  async function openPanel(t, focus = false) {
    ensureHost();
    closePanel();
    hideButton();
    target = t;
    panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Traduce');
    panel.innerHTML = `
      <div class="head">
        <button type="button" class="dir" aria-label="Cambiar idioma"></button>
        <button type="button" class="close" aria-label="Cerrar">${CLOSE}</button>
      </div>
      <div class="out" aria-live="polite"></div>
      <div class="actions">
        <button type="button" class="btn copy">Copiar</button>
        ${t.editable ? '<button type="button" class="btn primary replace">Reemplazar</button>' : ''}
      </div>`;
    root.append(panel);
    const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (panel?.querySelector(s));
    q('.close').addEventListener('click', closePanel);
    q('.dir').addEventListener('click', () => { state.from = other(state.from); state.to = other(state.to); run(); });
    q('.copy').addEventListener('click', copy);
    panel.querySelector('.replace')?.addEventListener('click', replaceText);
    if (focus) q('.dir').focus();

    const id = ++openId;
    const from = await detect(t.text);
    if (id !== openId) return;
    state.from = from;
    state.to = other(from);
    run();
  }

  async function run() {
    if (!panel || !target) return;
    const req = ++state.req;
    const out = /** @type {HTMLElement} */ (panel.querySelector('.out'));
    const dir = /** @type {HTMLElement} */ (panel.querySelector('.dir'));
    dir.textContent = `${state.from.toUpperCase()} → ${state.to.toUpperCase()}`;
    out.lang = state.to;
    out.className = 'out loading';
    out.textContent = 'Traduciendo…';
    state.result = '';
    setActions(false);
    place();
    try {
      const text = await translate(target.text, state.from, state.to);
      if (req !== state.req || !panel) return;
      state.result = text;
      out.className = 'out';
      out.textContent = text;
      setActions(!!text);
    } catch (err) {
      if (req !== state.req || !panel) return;
      out.className = 'out bad';
      out.textContent = err instanceof Error ? err.message : String(err);
    }
    place();
  }

  /** @param {boolean} on */
  function setActions(on) {
    panel?.querySelectorAll('.actions .btn').forEach((b) => { /** @type {HTMLButtonElement} */ (b).disabled = !on; });
  }

  async function copy() {
    const btn = /** @type {HTMLButtonElement} */ (panel?.querySelector('.copy'));
    try {
      await navigator.clipboard.writeText(state.result);
      btn.textContent = 'Copiado';
      setTimeout(() => { btn.textContent = 'Copiar'; }, 1200);
    } catch {
      btn.textContent = 'No se pudo copiar';
    }
  }

  function replaceText() {
    const t = target;
    const text = state.result;
    if (!t || !text) return;
    if (t.field) {
      t.field.focus();
      t.field.setRangeText(text, t.start, t.end, 'end');
      t.field.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (t.range) {
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(t.range);
      // execCommand keeps undo working and is what rich editors listen to.
      if (!document.execCommand('insertText', false, text)) {
        t.range.deleteContents();
        t.range.insertNode(document.createTextNode(text));
      }
    }
    closePanel();
  }

  function closePanel() {
    panel?.remove();
    panel = null;
    state.req++;
    openId++;
  }

  // ---------- Placement ----------
  // The card is fixed to the bottom-right corner (see CSS), so it never sits on top of
  // a long selection. Only the floating button follows the selection.

  const GAP = 8;

  function place() {
    if (!host || fab.hidden || !pending) return;
    const r = anchorRect(pending);
    if (!r) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const size = fab.offsetWidth || 32;
    // On touch screens the selection handles sit under the text, so go lower.
    const below = coarse.matches ? 28 : 6;
    const left = Math.min(Math.max(GAP, r.right + 4), vw - size - GAP);
    const top = Math.min(Math.max(GAP, r.bottom + below), vh - size - GAP);
    fab.style.transform = `translate(${left}px, ${top}px)`;
  }

  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
  addEventListener('scroll', schedule, { capture: true, passive: true });
  addEventListener('resize', schedule, { passive: true });

  // ---------- Closing ----------

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel) {
      e.stopPropagation();
      const back = panel.contains(root.activeElement) ? target?.field : null;
      closePanel();
      back?.focus();
    }
  }, true);

  addEventListener('pointerdown', (e) => {
    if (!host || e.composedPath().includes(host)) return;
    if (panel) closePanel();
  }, true);

  // ---------- Shortcut and context menu ----------

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'open') return;
    const t = readSelection() ?? pending;
    if (t && t.text.length <= MAX_CHARS) openOnce(t);
  });

  // ---------- Styles ----------

  const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 8.5h13M14.5 5 18 8.5 14.5 12M19 15.5H6M9.5 12 6 15.5 9.5 19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  // Tokens match src/tokens.css (checked by tests/tokens.test.js).
  const CSS = `
:host {
  --bg: #ffffff; --surface: #ffffff; --surface-2: #f2f2ef; --text: #141414; --muted: #6e6e6e;
  --line: #e3e3de; --accent: #ffd60a; --accent-text: #141414; --accent-weak: #fff3b0;
  --ok: #1f7a4d; --bad: #b42318; --radius: 0;
  --lift: 0 0 0 2px #141414;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :host {
    --bg: #141414; --surface: #1c1c1c; --surface-2: #262626; --text: #ffffff; --muted: #a3a3a3;
    --line: #333333; --accent: #ffd60a; --accent-text: #141414; --accent-weak: #3a3310;
    --ok: #5ccf96; --bad: #f97a70;
    --lift: 0 0 0 2px #ffffff;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; margin: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
[hidden] { display: none !important; }

.fab {
  position: fixed; top: 0; left: 0;
  display: grid; place-items: center;
  width: 32px; height: 32px; padding: 0; border: 0; border-radius: 0;
  background: var(--accent); color: var(--accent-text); box-shadow: var(--lift);
  animation: in 120ms ease-out;
}
.fab:hover { filter: brightness(0.95); }
.fab .key:empty { display: none; }
.fab.pill {
  display: inline-flex; align-items: center; gap: 6px;
  width: auto; padding: 0 11px 0 8px;
  font: 600 12px/1 "Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: 0.02em;
}

.panel {
  position: fixed; right: 16px; bottom: 16px;
  width: min(360px, calc(100vw - 16px)); max-height: min(60vh, 520px);
  display: flex; flex-direction: column;
  padding: 12px 14px 14px;
  background: var(--surface); color: var(--text);
  border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--lift);
  font: 15px/1.5 "Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  animation: in 120ms ease-out;
}
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.dir {
  min-height: 28px; padding: 0 10px; border: 0; border-radius: 0;
  background: var(--accent); color: var(--accent-text);
  font-size: 12px; font-weight: 650; letter-spacing: 0.04em; font-variant-numeric: tabular-nums;
}
.dir:hover { filter: brightness(0.97); }
.close {
  display: grid; place-items: center; width: 28px; height: 28px; margin-right: -6px; padding: 0;
  border: 0; border-radius: 0; background: transparent; color: var(--muted);
}
.close:hover { background: var(--surface-2); color: var(--text); }
.out {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  white-space: pre-wrap; overflow-wrap: anywhere; user-select: text;
}
.out.loading { color: var(--muted); animation: pulse 1.4s ease-in-out infinite; }
.out.bad { color: var(--bad); }
.actions { display: flex; gap: 8px; margin-top: 12px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 36px; padding: 0 14px; border-radius: 0;
  border: 1px solid var(--line); background: var(--surface);
  font-size: 14px; font-weight: 550;
}
.btn:hover { background: var(--surface-2); }
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
.btn.primary:hover { filter: brightness(0.95); background: var(--accent); }

@media (pointer: coarse) {
  .fab { width: 40px; height: 40px; }
  .btn { min-height: 44px; flex: 1; }
  .dir, .close { min-height: 36px; height: 36px; }
  .close { width: 36px; }
  .panel { right: 8px; bottom: calc(8px + env(safe-area-inset-bottom)); font-size: 16px; }
}
@keyframes in { from { opacity: 0; } }
@keyframes pulse { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .fab, .panel, .out.loading { animation: none; } }
`;
})();
