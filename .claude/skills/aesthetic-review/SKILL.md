# Skill: aesthetic-review

Run a functional and aesthetic critique of `@quillmark/editor` components by
capturing live screenshots and reviewing them against the rubric below.

---

## Steps

### 1 — Install Chromium (idempotent)

```bash
npx playwright install chromium
```

Playwright caches the browser; subsequent runs are instant.

### 2 — Ensure the dev server is running

Check whether `http://localhost:5173/_dev/gallery` is reachable:

```bash
curl -sf -o /dev/null http://localhost:5173/_dev/gallery && echo "UP" || echo "DOWN"
```

**If DOWN:** open a second terminal and run `npm run dev`, then wait ~5 s and
recheck. Alternatively set `GALLERY_URL` to point at a running preview server
(`npm run build && npm run preview` serves on port 4173 by default).

### 3 — Capture snapshots

```bash
node scripts/snapshot.js
```

This writes PNGs to `.snapshots/` (git-ignored). Each run overwrites the
previous set, so the directory always reflects the current state.

Output files:

| File | Content |
|---|---|
| `gallery-light-full.png` | Full gallery page, light mode |
| `gallery-dark-full.png` | Full gallery page, dark mode |
| `section-empty-light/dark.png` | MarkdownEditor — empty state |
| `section-content-light/dark.png` | MarkdownEditor — with content |
| `section-card-light/dark.png` | EditorBlock — card containers |
| `section-modeswitch-light/dark.png` | EditorModeSwitch toggle |

### 4 — Review each PNG

Use the `Read` tool to load each PNG. Claude Code is multimodal and reads
images directly — no external vision service needed.

Review **light and dark** variants side by side for each section.

### 5 — Print critique to stdout

For each section, print findings against the rubric below. Use the format:

```
## <Section name>

**Functional**
- <finding> [pass | warn | fail]
- …

**Aesthetic**
- <finding> [pass | warn | fail]

**Priority fixes**
1. …
```

End with a short `## Summary` (3–5 bullets, highest priority first).

---

## Rubric

Keep findings concise. The developer will tune the rubric iteratively.

### Functional

| Concern | What to look for |
|---|---|
| Prop API consistency | Props named predictably; no redundant aliases leaking into rendered DOM |
| Accessibility | Visible focus ring on interactive elements; ARIA roles where needed; keyboard-operable controls |
| State handling | Empty, default, and active states all render without layout collapse or overflow |
| Error paths | No visible JS error artifacts (blank sections, `[object Object]`, broken icons) |
| Svelte 5 idioms | No `$:` reactive statements in screenshots (can't verify from image, flag for code review separately) |
| Peer-dep boundaries | Component renders without requiring wasm bindings (gallery uses standalone components only) |

### Aesthetic

| Concern | What to look for |
|---|---|
| Spacing rhythm | Consistent vertical and horizontal rhythm between elements and sections |
| Typographic hierarchy | Clear size/weight distinction between headings, labels, and body text |
| Contrast | Text meets WCAG AA (≥ 4.5:1 for normal, ≥ 3:1 for large text); check both light and dark |
| Alignment | Elements align on a shared grid; no orphaned or ragged edges |
| Visual weight | Primary vs. secondary controls feel appropriately weighted |
| Hover / focus / disabled states | Hover backgrounds visible; focus rings clearly distinct; disabled controls desaturated |
| Dark/light parity | Dark mode mirrors light layout; no colours hardcoded to light-only values |
| Motion restraint | No distracting animations (can't verify from static PNGs — flag transitions for live review) |

---

## Notes for future iterations

- Add dark-mode toggle to the gallery page itself so screenshots always capture
  both themes in a single run.
- Expand the gallery with `VisualEditor` and `Preview` states once wasm
  bindings are injectable in the dev route.
- Consider pixel-diffing (e.g. `pixelmatch`) against baseline PNGs once the
  design is stable.
- PR-comment integration (GitHub MCP) can be layered on later for multi-dev
  workflows.
