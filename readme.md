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
token must stay secret). Instead, `sync.js` pulls questions from a Notion
database into the JSON files the app reads. `data/` and `data.json` are
generated — do not hand-edit them.

### Trigger a sync (canonical method)

Go to **Actions → "Sync questions from Notion" → Run workflow** in GitHub. The
workflow:

1. Runs `sync.js` in CI using `NOTION_TOKEN` from repo secrets
2. Commits any changed `data.json` / `data/` files back to this repo
3. If data changed, bumps the submodule pointer in the `kathas-projects` repo,
   triggering a GitHub Pages redeploy at `projects.kathas.no`

```
Notion DB
   ↓
GitHub Actions (manual trigger from Actions tab)
   ↓
node sync.js  →  commits data.json + data/ to quizzler repo
   ↓  (only if data changed)
Bumps submodule pointer in kathas-projects repo
   ↓
GitHub Pages redeploys projects.kathas.no
```

### Run locally (preview only)

```sh
NOTION_TOKEN=secret_xxx NOTION_DB=<database-id-or-url> node sync.js
```

Requires Node 18+. Writes generated files locally so you can preview changes
before they go live. See the header of `sync.js` for the expected database shape
and how to map property names.

## Running

Open over any static HTTP server (`fetch` of `data.json` needs HTTP, not
`file://`):

```sh
python3 -m http.server
```
