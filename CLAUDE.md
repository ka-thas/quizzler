# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A dependency-free, static quiz web app (vanilla HTML/CSS/JS, no build step, no
package manager, no tests). Designed for the phone, used in **landscape,
fullscreen**, added to the iOS home screen as a Safari web app. Open
`index.html` over any static HTTP server (e.g. `python3 -m http.server`) —
`fetch` of `data.json` requires HTTP rather than `file://`.

External libraries are loaded via CDN `<script>`/`<link>` tags in `index.html`,
not npm:
- **KaTeX** (+ auto-render) — renders LaTeX math in questions/answers
- **lucide** — icons

## Architecture

Two `<main>` "pages" in `index.html`, toggled via `style.display` (`#settings`
uses `flex`, both hidden via the other being set to `none`):
- `#settings` — theme toggle, a `<select>` to pick a quiz, two pill toggles
  (*Display for participants*, *Shuffle questions*), and a Start button.
- `#quiz` — a **one-at-a-time presentation**. `#slide` shows the current
  question's number + text; tapping the slide (or `#reveal`) toggles its answer.
  `#prev`/`#next`, arrow keys, and swipe move between questions; `#progress`
  shows `n / total`. A back button returns to settings.

`renderQuiz()` normalizes `questions` (string → `{q}`) and optionally shuffles
(`shuffleArray`, Fisher–Yates); `showSlide()` renders the slide at `index` and
manages disabled states / answer visibility.

`styles.css` holds the theme variables (`:root` / `[data-theme="dark"]`) and
layout. **Participant mode** is a `body.participant` class: large, high-contrast
"projector" styling for showing to the room; without it the quiz is a compact
host view. The chosen quiz is reflected in the URL via `?quiz=<name>` so a deep
link auto-opens it.

**State** lives in module-level globals in `script.js` (`data`,
`currentCollection`, `questions`, `index`, `revealed`, `participantMode`,
`shuffleMode`). Theme, participant mode, and shuffle mode persist in
`localStorage`.

## Data: decoupled via a manifest, sourced from Notion

`data.json` maps each quiz name to a JSON file under `data/`. On load,
`fetchCollections()` fetches the manifest, then fetches every referenced file in
parallel and assembles them into the global `data` object.

**Collection file shape:** `title`, `description`, `credit`, and `questions`,
where a question is `{ "q": ..., "a": ... }` (or a plain string for prompt-only).

**`data/*.json` and `data.json` are generated — do not hand-edit.** They are
produced by `sync.js`, which pulls from a Notion database:

```sh
NOTION_TOKEN=secret_xxx NOTION_DB=<database-id-or-url> node sync.js
```

`sync.js` (plain Node 18+, no npm) queries the Notion database via the regular
REST API (the MCP query tools are gated behind a Notion Business plan and can't
read rows). It maps the Title property → `q`, the answer property → `a`, and
groups rows into separate quiz files by a multi-select property. Defaults match
the **"Quiz spørsmål"** database — `Spørsmål` (title), `Svar` (answer), `Tema`
(groups) — and are overridable via `NOTION_ANSWER_PROP` / `NOTION_GROUP_PROP`
env vars. The integration must be shared with the database in Notion or the
query returns nothing.

**LaTeX:** all user-facing text goes through `setMathText(element, text)` rather
than direct `textContent` assignment, so math renders everywhere. Supported
delimiters: `$...$` / `\(...\)` inline, `$$...$$` / `\[...\]` display.
