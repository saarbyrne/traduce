// @ts-check
const { detect, translate, other } = /** @type {any} */ (globalThis).Traduce;

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = /** @type {HTMLTextAreaElement} */ ($('input'));
const output = $('output');
const dirBtn = $('dir');
const copyBtn = /** @type {HTMLButtonElement} */ ($('copy'));
const showButton = /** @type {HTMLInputElement} */ ($('showButton'));

/** @type {'es' | 'en'} */
let from = 'es';
/** True once the user picks the direction, so detection stops changing it. */
let manual = false;
let result = '';
let req = 0;
let timer = 0;

function setDir() {
  dirBtn.textContent = `${from.toUpperCase()} → ${other(from).toUpperCase()}`;
}

async function run() {
  const text = input.value.trim();
  const id = ++req;
  if (!text) {
    manual = false;
    output.hidden = true;
    copyBtn.disabled = true;
    return;
  }
  if (!manual) from = await detect(text);
  if (id !== req) return;
  setDir();
  output.hidden = false;
  output.className = 'out loading';
  output.textContent = 'Traduciendo…';
  copyBtn.disabled = true;
  try {
    const t = await translate(text, from, other(from));
    if (id !== req) return;
    result = t;
    output.className = 'out';
    output.lang = other(from);
    output.textContent = t;
    copyBtn.disabled = !t;
  } catch (err) {
    if (id !== req) return;
    output.className = 'out bad';
    output.textContent = err instanceof Error ? err.message : String(err);
  }
}

input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = window.setTimeout(run, 450);
});

dirBtn.addEventListener('click', () => {
  from = other(from);
  manual = true;
  setDir();
  run();
});

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(result).catch(() => {});
  copyBtn.textContent = 'Copiado';
  setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 1200);
});

chrome.storage.sync.get({ showButton: true }).then((s) => { showButton.checked = s.showButton; });
showButton.addEventListener('change', () => chrome.storage.sync.set({ showButton: showButton.checked }));

// Desktop only. Opens Chrome's page for changing the shortcut.
chrome.commands?.getAll().then((cmds) => {
  const cmd = cmds.find((c) => c.name === 'translate-selection');
  const key = $('shortcut');
  key.textContent = cmd?.shortcut || 'Añadir';
  key.addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  $('shortcutRow').hidden = false;
}).catch(() => {});

setDir();
