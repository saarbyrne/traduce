// @ts-check
// Shared by the content script, the popup, the service worker and the tests.
// Plain script (no import/export) so it can load in all four places.

(() => {
  /** @typedef {'es' | 'en'} Lang */

  const ES_WORDS = new Set(('el la los las de del que y en un una unos unas es son está están por con para ' +
    'se lo al como más pero sus ya muy hay yo tú mi te qué cómo también este esta estos eso ' +
    'todo ser fue tiene hace sí porque cuando donde nos ella él pues entonces aquí ahora siempre').split(' '));
  const EN_WORDS = new Set(('the of and to in is it you that was for on are with as his they be at one ' +
    'have this from or had by but what some we can were all your when there an which do how their ' +
    'if will would about my has not he she been them than then here now always just').split(' '));

  /**
   * Quick guess between Spanish and English from common words and letters.
   * @param {string} text
   * @returns {Lang | null}
   */
  function guessLang(text) {
    const t = text.toLowerCase();
    let es = 0;
    let en = 0;
    if (/[ñáéíóúü¿¡]/.test(t)) es += 2;
    for (const w of t.match(/\p{L}+/gu) ?? []) {
      if (ES_WORDS.has(w)) es++;
      if (EN_WORDS.has(w)) en++;
      if (/(ción|mente|ando|iendo|dad)$/.test(w)) es += 0.5;
      if (/(tion|ing|ly|ness|ed)$/.test(w)) en += 0.5;
    }
    if (es > en) return 'es';
    if (en > es) return 'en';
    return null;
  }

  /**
   * Detects the language, using the browser's detector when it is ready.
   * Falls back to Spanish, because most users read Spanish they want in English.
   * @param {string} text
   * @returns {Promise<Lang>}
   */
  async function detect(text) {
    const g = /** @type {any} */ (globalThis);
    try {
      if (g.LanguageDetector && (await g.LanguageDetector.availability()) === 'available') {
        const detector = (detectDetector ??= await g.LanguageDetector.create());
        const results = /** @type {{detectedLanguage: string, confidence: number}[]} */ (await detector.detect(text));
        const top = results.find((r) => r.detectedLanguage === 'es' || r.detectedLanguage === 'en');
        if (top && top.confidence > 0.4) return /** @type {Lang} */ (top.detectedLanguage);
      }
    } catch {}
    return guessLang(text) ?? 'es';
  }
  /** @type {any} */
  let detectDetector = null;

  const enc = new TextEncoder();
  /** @param {string} s */
  const bytes = (s) => enc.encode(s).length;

  /**
   * Splits text into pieces under a byte limit, breaking at sentences, then words.
   * MyMemory rejects queries over 500 bytes.
   * @param {string} text
   * @param {number} [max]
   * @returns {string[]}
   */
  function chunk(text, max = 450) {
    const t = text.trim();
    if (!t) return [];
    if (bytes(t) <= max) return [t];
    /** @type {string[]} */
    const out = [];
    let cur = '';
    const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
    for (const sentence of t.split(/(?<=[.!?…;:])\s+/)) {
      const parts = bytes(sentence) <= max ? [sentence] : sentence.split(/\s+/);
      for (let part of parts) {
        while (bytes(part) > max) {
          push();
          let cut = part.length;
          while (bytes(part.slice(0, cut)) > max) cut = Math.floor(cut * 0.9);
          out.push(part.slice(0, cut));
          part = part.slice(cut);
        }
        const next = cur ? `${cur} ${part}` : part;
        if (bytes(next) > max) { push(); cur = part; } else cur = next;
      }
    }
    push();
    return out;
  }

  /** @param {string} s */
  function decodeEntities(s) {
    return s
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  /** @type {Map<string, any>} */
  const translators = new Map();

  /**
   * Translates on the device with the browser's built-in model.
   * Returns null when the model is missing, so the caller can use MyMemory.
   * If the model can be downloaded and the user just clicked, the download starts for next time.
   * @param {string} text @param {Lang} from @param {Lang} to
   * @returns {Promise<string | null>}
   */
  async function translateLocal(text, from, to) {
    const g = /** @type {any} */ (globalThis);
    if (!g.Translator) return null;
    const key = `${from}>${to}`;
    try {
      let t = translators.get(key);
      if (!t) {
        const opts = { sourceLanguage: from, targetLanguage: to };
        const avail = await g.Translator.availability(opts);
        if (avail === 'unavailable') return null;
        if (avail !== 'available') {
          if (g.navigator?.userActivation?.isActive) {
            g.Translator.create(opts).then((/** @type {any} */ tr) => translators.set(key, tr)).catch(() => {});
          }
          return null;
        }
        t = await g.Translator.create(opts);
        translators.set(key, t);
      }
      return await t.translate(text);
    } catch {
      return null;
    }
  }

  /**
   * Translates with the device model, or with MyMemory through the service worker.
   * @param {string} text @param {Lang} from @param {Lang} to
   * @returns {Promise<string>}
   */
  async function translate(text, from, to) {
    const local = await translateLocal(text, from, to);
    if (local !== null) return local;
    /** @type {{text?: string, error?: string} | undefined} */
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'translate', text, from, to });
    } catch {
      throw new Error('Recarga la página e inténtalo otra vez');
    }
    if (!res) throw new Error('Sin respuesta');
    if (res.error) throw new Error(res.error);
    return res.text ?? '';
  }

  /** @param {Lang} l @returns {Lang} */
  const other = (l) => (l === 'es' ? 'en' : 'es');

  /** @type {any} */ (globalThis).Traduce = { guessLang, detect, chunk, decodeEntities, translate, translateLocal, other };
})();
