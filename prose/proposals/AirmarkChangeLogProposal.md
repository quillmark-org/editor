# Airmark "What's New" Sheet — Implementation Plan

## Context

Airmark users (Air Force officers generating memos) don't see the team's feedback loop today, so our responsiveness is invisible. We want an in-app surface that says "you spoke, we shipped" without interrupting work. The `CHANGELOG.md` at repo root is the source of truth for engineers but is too noisy (refactors, type fixes) to show end users directly.

The approach: add a **new `### From your feedback` category** to the Keep-a-Changelog format, render it as the headline section in a right-side Sheet, and filter out dev noise (`Changed`, `Removed`) for user display. `CHANGELOG.md` remains the single source of truth.

## Decisions (confirmed with user)

- **Surface:** right-side **Sheet** (uses existing `base-sheet.svelte`), not a modal or standalone page.
- **Trigger:** passive **"new" dot** on the entry-point icon — no auto-open, no toast. Dot clears when the sheet is opened.
- **Placement:** **sidebar footer**, next to Settings / theme toggle.
- **Content:** new `### From your feedback` section per version, rendered first and most prominently. Also show `Added` and `Fixed`. Hide `Changed` and `Removed`.
- **Scope:** latest version expanded; prior versions in a collapsible list beneath.

## Architecture

```
CHANGELOG.md (source of truth)
  - new optional section: ### From your feedback
  - scripts/validate-changelog.js updated to accept it
        │  imported via Vite ?raw at build time
        ▼
src/lib/utils/changelog.ts                        # pure parser + types
        │
        ▼
src/lib/components/WhatsNewSheet.svelte           # wraps base-sheet
src/lib/components/Sidebar/WhatsNewButton.svelte  # trigger + dot
        │
        ▼
src/lib/components/Sidebar/Sidebar.svelte         # wire into footer
```

## Files to create

### `src/lib/utils/changelog.ts`

Pure parser — no framework code, unit-testable. Exports:

```ts
type ChangelogVersion = {
  version: string;           // e.g. "0.0.17"
  fromYourFeedback: string[];
  added: string[];
  fixed: string[];
};

function parseChangelog(raw: string): ChangelogVersion[]
```

Rules:
1. Split on `^## \[v(\d+\.\d+\.\d+)\]` headers.
2. Within each version, split on `^### (.+)$` subheadings.
3. Bullets = lines starting with `- `; join wrapped continuation lines (indented or non-bullet).
4. Match category names case-insensitively, trim whitespace. Recognize: `From your feedback`, `Added`, `Fixed`. Silently drop `Changed`, `Removed`, `Security` (they're in the source file but not for users).
5. Skip any version where all three kept lists are empty (pure-refactor releases vanish from the user view).
6. Versions returned newest-first (matches file order).

### `src/lib/components/WhatsNewSheet.svelte`

Props: `{ open: boolean; onOpenChange: (open: boolean) => void }`.

Structure (wraps `base-sheet.svelte`, side=right, size ~ `md`):
- **Header:** `Sparkles` icon + "What's new in {brand.name}" (pulled from `src/lib/branding.ts`).
- **Subheader:** muted text — "We build Airmark with your feedback. Here's what's shipped recently."
- **Body (scrollable), per version, newest first:**
  - Version chip: `v0.0.17`
  - **From your feedback** (if any) — at the top, with an accent treatment (primary-tinted left border, `MessageSquareHeart` icon to echo the feedback button). This is the headline, making the loop visible.
  - **New** (`Added`) — `Sparkles` icon, neutral styling.
  - **Fixed** — `Wrench` icon, neutral styling.
  - Latest version: all three sections open.
  - Prior versions: collapsed accordion row; expand to reveal the same three sections.
- **Footer:** "Have a request? Send feedback →" — wires to the existing feedback dialog trigger (same one the TopMenu uses). Reinforces the loop.

Data: `import changelogRaw from '../../CHANGELOG.md?raw'` (Vite handles `?raw` natively in SvelteKit), parsed once at module scope.

### `src/lib/components/Sidebar/WhatsNewButton.svelte`

Props: `{ onOpen: () => void; expanded: boolean }` (mirrors sidebar's expanded/collapsed state to match Settings / theme toggle).

Behavior:
- Icon: `Sparkles` from `lucide-svelte`.
- Label: "What's new" (hidden when sidebar collapsed, same convention as neighbors).
- **Dot indicator:** ~7px `bg-primary` rounded dot at the icon's top-right, shown when `hasUnseenVersion === true`.
- `hasUnseenVersion` logic:
  - `APP_VERSION` comes from a new `src/lib/version.ts` one-liner export.
  - On mount: read `localStorage.getItem('last-seen-changelog-version')`. If null or `!== APP_VERSION`, dot shows.
  - On click: call `onOpen()`, then `localStorage.setItem('last-seen-changelog-version', APP_VERSION)` and clear the dot.
  - Follows existing pattern used by `BetaRecruitmentModal.svelte` (`localStorage` read in `$effect`, write on state change).

### `src/lib/version.ts` (new one-liner)

```ts
export const APP_VERSION = '0.0.17';
```

Keeps the displayed version explicit (SvelteKit discourages runtime `package.json` reads in client code). Future work: extend `validate-changelog.js` to check this constant matches the version header; out of scope here.

## Files to modify

### `src/lib/components/Sidebar/Sidebar.svelte`

- Add `let whatsNewOpen = $state(false)`.
- In the footer row-group (same area as Settings and dark-mode toggle), mount
  `<WhatsNewButton expanded={isExpanded} onOpen={() => (whatsNewOpen = true)} />`.
- Mount `<WhatsNewSheet open={whatsNewOpen} onOpenChange={(v) => (whatsNewOpen = v)} />` at the end of the component (sheets portal themselves).

### `scripts/validate-changelog.js`

Add `'From your feedback'` to the `ALLOWED_SECTIONS` set at line 21. Current set: `['Added', 'Changed', 'Fixed', 'Removed', 'Security']`. New set: append `'From your feedback'`. No other changes needed — the rest of the validator only checks structure, not category order.

### `CHANGELOG.md`

- Add a one-line note under the file intro explaining the new category:
  > `### From your feedback` — changes directly driven by user requests and bug reports. Used to close the loop with users in-app.
- **Do not backfill** older versions. They'll render with just `Added` / `Fixed` and that's fine; no faked attribution.
- Going forward, release authors can move bullets from `Added`/`Fixed` into `From your feedback` when a user report or request drove the work.

### `.claude/skills/changelog/SKILL.md` (if present)

If this skill documents the allowed categories, append `From your feedback` there too so the `generate-changelog.js` Anthropic prompt knows it's valid. (Exact file to confirm during implementation.)

## Existing utilities being reused

- `src/lib/components/ui/base-sheet.svelte` — the sheet primitive (focus trap, escape/backdrop dismiss already handled).
- `src/lib/branding.ts` — `brand.name` for the header copy.
- `src/lib/utils/cn.ts` — class-name merge.
- `lucide-svelte` — `Sparkles`, `MessageSquareHeart`, `Wrench`, `ChevronRight` (all already in use in the project).
- Existing feedback dialog trigger — linked from the sheet footer (same wiring as the TopMenu feedback button).
- localStorage convention — same pattern as `BetaRecruitmentModal.svelte`.

## What we are NOT doing

- No markdown-to-HTML dependency — the parser handles the rigid Keep-a-Changelog structure directly.
- No backfill of `From your feedback` on historical versions.
- No auto-open modal, no toast, no email, no analytics.
- No `/changelog` route. Can be added later if deep-linking becomes valuable.
- No per-entry feedback issue linking (e.g. `[#142]`). Deferred — the section-level approach already carries the narrative.
- No changes to `scripts/generate-changelog.js`. Follow-up work: teach its Anthropic prompt to propose a `From your feedback` section when PR descriptions reference feedback issues.

## Verification

End-to-end manual test (dev server via `npm run dev`, with `PUBLIC_TITLE_VARIANT=airmark`):

1. Temporarily add a `### From your feedback` section to v0.0.17 in `CHANGELOG.md` with one bullet (so we have real content to render). Revert before committing if we don't want to ship that content.
2. Clear `localStorage`; load app. Confirm a primary-colored dot appears on the "What's new" sidebar button.
3. Click the button. Sheet slides in from right. Header reads "What's new in Airmark". v0.0.17 is expanded and shows the `From your feedback` section first (accented), then `New`, then no `Fixed` section (because v0.0.17 has no Fixed entries). No `Changed` / `Removed` visible.
4. Close the sheet (Esc, backdrop, or X). Dot is gone.
5. Reload. Dot stays gone.
6. Edit `src/lib/version.ts` to `0.0.18`. Reload. Dot reappears.
7. Expand an older version (`v0.0.16`). Confirm it shows `New` + `Fixed` with the expected bullets; no `Changed` / `Removed` noise; no `From your feedback` section (correctly omitted because it wasn't in the source).
8. Click "Send feedback →" in the sheet footer. Confirm the existing feedback dialog opens.
9. Collapse the sidebar. "What's new" icon remains clickable; dot still visible when applicable.
10. Toggle dark mode. Sheet, dot, accent border, and accordion chevrons all render correctly.
11. Switch to non-Airmark brand variant via env. Header copy updates to the new brand name.
12. Run `node scripts/validate-changelog.js CHANGELOG.md`. Confirm the `From your feedback` section no longer triggers an "unknown section" warning.

Parser edge-case checks against today's `CHANGELOG.md`:
- `v0.0.17` (no feedback section yet): renders with only `Added`.
- `v0.0.16`: renders with `Added` (2) + `Fixed` (7). No `Changed`/`Removed` visible.
- `v0.0.14`: renders with only `Fixed`.
- Any version whose only content is `Changed`/`Removed`: excluded from the user view.