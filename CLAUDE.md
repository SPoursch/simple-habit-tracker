# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A habit tracker that runs entirely in the browser with no server and no dependencies.
The main view is a 7-day grid: one row per habit, one column per day for the last 7 days,
with today's column highlighted.

## Commands

There is no package manager, no build, no lint, and no test suite in this project.

- **Run:** open `index.html` directly in a browser (`file://` — no local server needed).
- **Verify a change:** reload the page; use DevTools -> Application -> Local Storage to
  inspect or clear saved state.

Do not add `package.json`, a bundler, or a task runner. If a change seems to require one,
stop and ask rather than introducing it.

## Prohibition

No frameworks or libraries — no React, Vue, Svelte, Angular, jQuery, or any other. No CDN
`<script>` tags. Everything is hand-written vanilla JavaScript.

## Conventions

1. **Three separate files.** `index.html`, `styles.css`, `app.js`. No inline `<style>` or
   `<script>` blocks, and no inline handlers (`onclick="..."`) in the HTML — attach every
   listener from `app.js`.

2. **Each habit is an individual item.** One habit = one object in the `habits` array = one
   row element in the DOM, addressed by its own stable `id`. No shared or index-based
   coupling between habits; deleting one must never disturb another's data.

3. **All persistence goes through localStorage, behind two functions.** `app.js` exposes
   `loadState()` and `saveState(state)`; these are the only places `localStorage` is touched.
   Everything else operates on the in-memory state object and calls `saveState()`.

4. **Render from state, not from the DOM.** State is the single source of truth. Mutate the
   state object, persist it, then re-render. Never read a habit's status back out of a
   checkbox or element to decide what is true.

## Storage shape

Single key: `habit-tracker/v1`, holding one JSON object.

```js
{
  version: 1,
  habits: [
    {
      id: "h_1756180800000",     // stable, generated once at creation
      name: "Drink water",
      createdAt: "2026-08-26",
      completions: ["2026-08-24", "2026-08-26"]  // local date keys, sorted
    }
  ]
}
```

A completion is recorded by presence of its date key in that habit's own `completions`
array — so each habit stays fully self-contained.

`loadState()` must tolerate a missing key, malformed JSON, and an unknown `version`, and
fall back to a valid empty state rather than throwing. A broken localStorage value must
never leave the user with a blank page.

## Two constraints that follow from "no build step"

- **Use `<script defer src="app.js"></script>`, not `type="module"`.** Opened over
  `file://`, ES module imports are blocked by CORS and the app will silently fail to start.
  All code therefore lives in one classic script.
- **Never use `toISOString()` to build a date key.** It converts to UTC, which marks the
  wrong day for users behind or ahead of UTC near midnight. Build keys from local parts:

```js
const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
```

## Rendering note

User-entered habit names must be inserted with `textContent`, never `innerHTML`, so a name
containing `<` or `&` renders literally instead of breaking the row.
