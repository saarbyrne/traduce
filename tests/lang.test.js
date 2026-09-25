const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/lang.js');

const { guessLang, chunk, decodeEntities, detect, other } = globalThis.Traduce;
const bytes = (s) => new TextEncoder().encode(s).length;

test('guessLang tells Spanish from English', () => {
  assert.equal(guessLang('¿Dónde está la estación de tren?'), 'es');
  assert.equal(guessLang('Where is the train station?'), 'en');
  assert.equal(guessLang('Los niños juegan en el parque'), 'es');
  assert.equal(guessLang('The children are playing in the park'), 'en');
  assert.equal(guessLang('rápidamente'), 'es');
  assert.equal(guessLang('quickly'), 'en');
  assert.equal(guessLang('123'), null);
});

test('detect falls back to Spanish when unsure', async () => {
  assert.equal(await detect('ok'), 'es');
  assert.equal(await detect('This is the one'), 'en');
});

test('chunk keeps short text whole', () => {
  assert.deepEqual(chunk('  Hola mundo  '), ['Hola mundo']);
  assert.deepEqual(chunk('   '), []);
});

test('chunk splits long text under the byte limit at sentence ends', () => {
  const sentence = 'Esta es una frase bastante larga con acentos como canción y corazón. ';
  const text = sentence.repeat(30);
  const parts = chunk(text);
  assert.ok(parts.length > 1);
  for (const p of parts) {
    assert.ok(bytes(p) <= 450, `piece is ${bytes(p)} bytes`);
    assert.ok(p.endsWith('.'), 'breaks at a sentence end');
  }
  assert.equal(parts.join(' '), text.trim());
});

test('chunk splits a sentence with no punctuation at words', () => {
  const text = Array.from({ length: 200 }, (_, i) => `palabra${i}`).join(' ');
  const parts = chunk(text);
  for (const p of parts) assert.ok(bytes(p) <= 450);
  assert.equal(parts.join(' '), text);
});

test('chunk hard-splits one very long word', () => {
  const text = 'ñ'.repeat(1000);
  const parts = chunk(text);
  for (const p of parts) assert.ok(bytes(p) <= 450);
  assert.equal(parts.join(''), text);
});

test('decodeEntities', () => {
  assert.equal(decodeEntities('It&#39;s &quot;fine&quot; &amp; ok &lt;3'), 'It\'s "fine" & ok <3');
});

test('other', () => {
  assert.equal(other('es'), 'en');
  assert.equal(other('en'), 'es');
});
