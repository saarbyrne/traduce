// @ts-check
/* global importScripts */
importScripts('lang.js');

const { chunk, decodeEntities } = /** @type {any} */ (globalThis).Traduce;
const API = 'https://api.mymemory.translated.net/get';

/** Recent results, so the same text is not sent twice. */
const cache = new Map();
const CACHE_MAX = 200;

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg?.type === 'shortcut') {
    // Content scripts cannot read commands, so they ask here.
    if (!chrome.commands) { send({ shortcut: '' }); return; }
    chrome.commands.getAll().then((cmds) => {
      send({ shortcut: cmds.find((c) => c.name === 'translate-selection')?.shortcut || '' });
    }).catch(() => send({ shortcut: '' }));
    return true;
  }
  if (msg?.type !== 'translate') return;
  myMemory(String(msg.text ?? ''), msg.from, msg.to)
    .then((text) => send({ text }))
    .catch((err) => send({ error: err instanceof Error ? err.message : String(err) }));
  return true;
});

/**
 * @param {string} text @param {string} from @param {string} to
 * @returns {Promise<string>}
 */
async function myMemory(text, from, to) {
  const key = `${from}>${to}:${text}`;
  if (cache.has(key)) return cache.get(key);

  // Translate each paragraph on its own so line breaks survive.
  const paragraphs = text.split('\n');
  const out = [];
  for (const para of paragraphs) {
    const pieces = chunk(para);
    const done = [];
    for (const piece of pieces) done.push(await request(piece, from, to));
    out.push(done.join(' '));
  }
  const result = out.join('\n');

  cache.set(key, result);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return result;
}

/** @param {string} q @param {string} from @param {string} to */
async function request(q, from, to) {
  const url = `${API}?q=${encodeURIComponent(q)}&langpair=${from}|${to}`;
  /** @type {Response} */
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Sin conexión');
  }
  if (res.status === 429) throw new Error('Límite diario alcanzado');
  if (!res.ok) throw new Error(`Error del servicio (${res.status})`);
  const data = await res.json();
  const translated = String(data?.responseData?.translatedText ?? '');
  if (data?.quotaFinished || /MYMEMORY WARNING/i.test(translated)) throw new Error('Límite diario alcanzado');
  if (Number(data?.responseStatus) !== 200) throw new Error(data?.responseDetails || 'Error del servicio');
  return decodeEntities(translated);
}

// Desktop only. Mobile browsers have no context menus or commands, so these are guarded.

chrome.runtime.onInstalled.addListener(() => {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'traduce', title: 'Traducir «%s»', contexts: ['selection', 'editable'] });
  });
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'traduce' || !tab?.id) return;
  open(tab.id, info.frameId);
});

chrome.commands?.onCommand.addListener(async (command, tab) => {
  if (command !== 'translate-selection') return;
  // Some browsers (Dia) fire the command without the tab, so look it up.
  const id = tab?.id ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
  if (id) open(id);
});

/** @param {number} tabId @param {number} [frameId] */
function open(tabId, frameId) {
  const opts = frameId === undefined ? {} : { frameId };
  chrome.tabs.sendMessage(tabId, { type: 'open' }, opts).catch(() => {});
}
