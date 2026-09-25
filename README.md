# Traduce

Traduce is a browser extension that translates selected text between Spanish and English. The translation appears in a card in the bottom-right corner, so it never covers the text. It has no dependencies, no build step, no account and no server.

It used to be called Slug Translate. The Web Store listing is https://chromewebstore.google.com/detail/cdbloidgfaclhajkkmlfnnamggoledmg.

## Use

1. Select text on any page.
2. Click the blue button next to the selection, press `Alt+T`, or right-click and choose Traducir.
3. The card shows the translation. Tap the ES → EN chip to swap the direction.
4. In a text field or an editor, Reemplazar puts the translation in place of the selection.

The toolbar icon opens a box for typed text, a switch for the floating button and the shortcut. The shortcut can be changed at `chrome://extensions/shortcuts`. Some browsers, such as Dia and Arc, do not pass extension shortcuts on, so the page also listens for Alt+T (Option+T on a Mac) itself when text is selected.

## Browsers

- Desktop Chrome, Edge, Brave, Arc, Opera and other Chromium browsers, version 116 or later.
- Android browsers that install Chrome extensions, such as Edge, Quetta and Lemur. These have no shortcut or right-click menu, so the floating button is the way in.
- Chrome on Android and iOS cannot run extensions.

## Translation

1. Chrome 138 and later on desktop has a translation model built in. Traduce uses it when it is on the device. The text stays on the device, and there is no limit or cost.
2. When the model is missing, Traduce asks [MyMemory](https://mymemory.translated.net/doc/usagelimits.php). MyMemory is free with no key. Each user has their own daily limit of about 5,000 characters, counted by IP address.
3. The first time a user clicks Traducir while the model is missing, Chrome starts downloading it for next time.

No one uses the author's keys or quota, because there are none.

## Development

You need Node 22 or later. There is nothing to install.

```sh
npm test       # language guess, text splitting, tokens, versions
npm run zip    # dist/traduce-<version>.zip for the Web Store
```

To try it, open `chrome://extensions`, turn on Developer mode, choose Load unpacked and pick this folder.

## Structure

```
manifest.json
src/
  lang.js        detection, splitting, on-device and MyMemory translation (shared)
  background.js  MyMemory requests, cache, right-click menu, shortcut
  content.js     floating button and card, in a closed shadow root
  popup.html/js/css
  tokens.css     colour tokens, the same names as Verbos and Charla
icons/
tests/
scripts/zip.mjs
STORE.md         Web Store listing text and permission answers
PRIVACY.md
```

## Family

Traduce shares its design tokens with [Verbos](https://github.com/saarbyrne/verbos) and [Charla](https://github.com/saarbyrne/charla). Each app has one accent colour. Verbos is terracotta, Charla is green and Traduce is blue.
