const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

// The panel lives in a shadow root on other sites, so it carries its own copy of the tokens.
const read = (f) => readFileSync(f, 'utf8');
const tokens = (css) => Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[0].split(':')[0] + (css.indexOf(m[0]) > css.indexOf('@media') ? '@dark' : ''), m[2].trim()]));

test('panel tokens match src/tokens.css', () => {
  const file = tokens(read('src/tokens.css'));
  const panel = tokens(read('src/content.js').split('const CSS = `')[1].split('* { box-sizing')[0]);
  for (const [k, v] of Object.entries(panel)) assert.equal(v, file[k], k);
});

test('manifest and package versions match', () => {
  assert.equal(JSON.parse(read('manifest.json')).version, JSON.parse(read('package.json')).version);
});
