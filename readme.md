# Quiz

A dependency-free, static quiz app for the phone — designed to be used in
**landscape, fullscreen**, added to the iOS home screen as a Safari web app.

Two pages:

1. **Settings** — theme (light/dark), pick a quiz, and toggle *Display for
   participants* (large projector view for the room vs. a compact host view).
2. **Quiz** — a two-phase view: the numbered **questions** first, then a button
   flips to the numbered **question + answer** pairs for the reveal.

## Questions come from Notion

The app itself is static and never talks to Notion (the API has no CORS and the
token must stay secret). Instead, run the local sync script to pull questions
from a Notion database into the JSON files the app reads:

```sh
NOTION_TOKEN=secret_xxx NOTION_DB=<database-id-or-url> node sync.js
```

Requires Node 18+. See the header of `sync.js` for the expected database shape
and how to map property names.

## Running

Open over any static HTTP server (`fetch` of `data.json` needs HTTP, not
`file://`):

```sh
python3 -m http.server
```
