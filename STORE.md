# Web Store listing

Paste these into the Chrome Web Store developer dashboard for the existing item (ID `cdbloidgfaclhajkkmlfnnamggoledmg`). Keeping the same item keeps the users and the URL.

## Name

Traduce

## Summary

Translate selected text between Spanish and English without leaving the page.

## Description

Select text on any page and see the translation in a card in the bottom-right corner.

- Click the blue button, press Alt+T, or right-click and choose Traducir.
- Detects whether the text is Spanish or English.
- Replace the selection with the translation in text fields and editors.
- Type or paste text in the toolbar popup.
- Light and dark mode.

On Chrome 138 and later, translation runs on your device with Chrome's built-in model. Nothing is sent anywhere, and there is no limit. Otherwise Traduce uses the free MyMemory service.

No account, no tracking, no ads.

## Category

Tools

## Language

Spanish and English

## Single purpose

Translate text the user selects between Spanish and English.

## Permission justifications

- **Host access to all sites (content script).** Shows the translate button next to selected text on any page, and places the translation next to it. The script reads only the selected text.
- **api.mymemory.translated.net.** Sends the selected text for translation when the browser's built-in model is not available.
- **contextMenus.** Adds Traducir to the right-click menu for selected text.
- **storage.** Saves whether the floating button is on.

## Remote code

No. All code is in the package.

## Data use

- Collects: website content (the selected text only, sent for translation).
- Not sold, not used for anything other than translation, not used for credit.

## Privacy policy URL

https://hecho.fyi/privacidad/

## Screenshots

In `store/`, 1280×800:

1. `1-card-light.png`, a Spanish paragraph selected with the card open.
2. `2-card-dark.png`, the same in dark mode.
3. `3-popup.png`, the toolbar popup.
