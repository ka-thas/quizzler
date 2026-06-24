#!/usr/bin/env node
// sync.js — regenerate data/*.json + data.json from a Notion database.
//
// The web app is fully static and cannot call the Notion API directly
// (no CORS, and the token must stay secret). Run this script locally to
// pull the latest questions from Notion and write them into the JSON files
// the app reads.
//
// Usage:
//   NOTION_TOKEN=secret_xxx NOTION_DB=<database-id-or-url> node sync.js
//
// Requires Node 18+ (global fetch). No npm install needed.
//
// Expected Notion database shape (property names are configurable below):
//   - a Title property            -> the question (q)
//   - "Answer" (rich text)        -> the answer (a)            [optional]
//   - "Quiz" (select/multi-select)-> groups rows into separate collections
//                                    (one data/<quiz>.json per value).
//                                    If absent, everything goes into one quiz.

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.NOTION_TOKEN;
const DB_INPUT = process.env.NOTION_DB;
const NOTION_VERSION = "2022-06-28";

// --- Property name mapping (edit to match your database) ---
// Defaults match the "Quiz spørsmål" Notion database:
//   Spørsmål (title) -> q,  Svar (text) -> a,  Tema (multi-select) -> groups.
const PROP = {
    answer: process.env.NOTION_ANSWER_PROP || "Svar",
    group: process.env.NOTION_GROUP_PROP || "Tema",
};
const DEFAULT_QUIZ = process.env.NOTION_DEFAULT_QUIZ || "Quiz";

if (!TOKEN || !DB_INPUT) {
    console.error("Set NOTION_TOKEN and NOTION_DB environment variables. See sync.js header.");
    process.exit(1);
}

// Accept a raw id, a dashed id, or a full notion.so URL.
function extractId(input) {
    const m = input.replace(/-/g, "").match(/[0-9a-f]{32}/i);
    if (!m) throw new Error(`Could not find a database id in "${input}"`);
    const h = m[0];
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function notion(endpoint, body) {
    const res = await fetch(`https://api.notion.com/v1/${endpoint}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error(`Notion ${endpoint} failed: ${res.status} ${await res.text()}`);
    return res.json();
}

// Flatten a Notion rich_text / title array to a plain string.
const plain = (rich) => (rich || []).map((t) => t.plain_text).join("").trim();

function readProp(prop) {
    if (!prop) return "";
    switch (prop.type) {
        case "title": return plain(prop.title);
        case "rich_text": return plain(prop.rich_text);
        case "select": return prop.select?.name || "";
        case "multi_select": return (prop.multi_select || []).map((s) => s.name);
        case "number": return prop.number == null ? "" : String(prop.number);
        case "formula": return prop.formula?.string ?? (prop.formula?.number != null ? String(prop.formula.number) : "");
        default: return "";
    }
}

function findTitle(props) {
    for (const key in props) if (props[key].type === "title") return plain(props[key].title);
    return "";
}

async function queryAll(dbId) {
    const rows = [];
    let cursor;
    do {
        const page = await notion(`databases/${dbId}/query`, cursor ? { start_cursor: cursor } : {});
        rows.push(...page.results);
        cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return rows;
}

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

(async () => {
    const dbId = extractId(DB_INPUT);
    console.log(`Querying Notion database ${dbId} ...`);
    const rows = await queryAll(dbId);
    console.log(`Fetched ${rows.length} rows.`);

    // Group rows into collections by the group property (or all into one).
    const collections = {}; // name -> [{q, a}]
    for (const row of rows) {
        const props = row.properties || {};
        const q = findTitle(props);
        if (!q) continue;
        const a = readProp(props[PROP.answer]);
        const item = a ? { q, a } : { q };

        let groups = readProp(props[PROP.group]);
        if (!Array.isArray(groups)) groups = groups ? [groups] : [];
        if (groups.length === 0) groups = [DEFAULT_QUIZ];

        for (const g of groups) {
            (collections[g] ||= []).push(item);
        }
    }

    const names = Object.keys(collections).sort();
    if (names.length === 0) {
        console.error("No questions found. Check your property names / database sharing.");
        process.exit(1);
    }

    fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
    const manifest = {};
    for (const name of names) {
        const key = slug(name) || "quiz";
        const file = `data/${key}.json`;
        const payload = {
            title: name,
            description: "",
            credit: "",
            questions: collections[name],
        };
        fs.writeFileSync(path.join(__dirname, file), JSON.stringify(payload, null, 4) + "\n");
        manifest[name] = file;
        console.log(`  ${file}  (${collections[name].length} questions)`);
    }
    fs.writeFileSync(path.join(__dirname, "data.json"), JSON.stringify(manifest, null, 4) + "\n");
    console.log(`Wrote data.json with ${names.length} quiz(zes). Done.`);
})().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
