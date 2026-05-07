# Routes & Layout Audit

Findings in `src/routes/**` and the global CSS in `src/app.css`. Pages audited: `+layout.svelte`, `+page.svelte`, `doc/[id]/+page.svelte`, `signin/+page.svelte`, `terms/+page.svelte`.

---

## M1. `+layout.svelte` — three concerns in one file

**File:** `src/routes/+layout.svelte:1-~130`

The root layout mixes:
1. **Service initialization** — `layout.svelte:38-49` (`loginClient`, `templateService`, `quillmarkService`, `userStore`).
2. **Session monitoring** — `layout.svelte:44-81` polls `/auth/session` on visibility change to detect expiry.
3. **Global hotkeys** — `layout.svelte:120-126` Escape-to-close-overlays.

The synchronous service bootstrap is correct; the reactive session `$effect` is correct; both living in the same file makes it hard to test either in isolation. The session monitor in particular is a standalone unit — fetch on visibility change, update `userStore` on 401.

**Suggested fix:** Extract `src/lib/features/session-monitor/use-session-monitor.svelte.ts`; import and instantiate from the layout. Do the same for global hotkey registration (`use-global-hotkeys.svelte.ts`) so the layout's `<script>` shrinks to data wiring + component composition.

---

## M2. Mixed data access: `$page.data` vs. `data` prop

**File:** `src/routes/+page.svelte:35, 50, 254`

```ts
const providers = $derived<AuthProviderConfig[]>($page.data.providers || []);   // L35
const disableMobile = $derived($page.data.disableMobile);                        // L50
...
{#if data.feedbackSubmissionEnabled}                                             // L254
```

Three reads from layout-provided data; two through `$page.data`, one through `data`. SvelteKit supports both, but mixing them in one page file means a new contributor has to learn both patterns and the rationale for each.

**Suggested fix:** Pick one. `data` prop is preferable here because it's typed at compile time; use `$page.data` only when reading sibling-route data.

---

## M3. `.prose` and `.widget-prose` are near-duplicates

**File:** `src/app.css:554-587` (`.prose …`) and `:590-622` (`.widget-prose …`)

Both selector groups set the same rules on `h1-h6, p, ul, ol, li, strong, em`:

```css
.prose h1, .prose h2, … { color: var(--color-foreground); font-weight: 600; }
.widget-prose h1, .widget-prose h2, … { color: var(--color-foreground); font-weight: 600; }
```

~65 lines of duplication. No code comment explains the intended difference.

**Suggested fix:** If the two scopes are genuinely interchangeable, merge: `.prose, .widget-prose h1 { … }`. If there's a semantic split, document it at the top of each block — a reader today cannot tell.

---

## M4. Typography utilities repeat `color: var(--color-foreground)` on 11 selectors

**File:** `src/app.css:480-537` and `:393`

`body` at `app.css:393` already sets the foreground color; the typography utilities then re-declare it on `.text-base`, each heading, `p`, `ul`, `ol`, `li`, `strong`, `em`. If the theme changes the foreground variable, all of those rules re-settle correctly — the declarations are redundant, not harmful — but they inflate the cascade and make it harder to spot the selectors that *do* need a specific color (e.g. `.muted-foreground`, `.prose a`).

**Suggested fix:** Drop the `color:` declaration from typography utilities that inherit the default. Estimated: 40-50 lines of CSS can go.

---

## L1. Classification messaging bypasses `classification.ts`

**Files:** `src/lib/config/classification.ts`, `src/routes/signin/+page.svelte:63`, `src/routes/terms/+page.svelte:13, 44-95`, `src/routes/+layout.svelte:132-136`.

`ClassificationBanner` reads from `classification.ts` and decides its own visibility. Sign-in and terms pages hard-code CUI warning text instead of reading the config. If the site classification changes, those two pages will silently disagree with the banner.

**Suggested fix:** Expose the warning text on the classification config and have both pages import it. Same source of truth as the banner.

---

## L2. Vendor-prefixed scrollbar CSS

**File:** `src/app.css:625-640`

`-webkit-scrollbar` rules. Firefox uses `scrollbar-width` / `scrollbar-color`. Verify autoprefixer is active (or if targeting modern evergreen, drop the prefixes where standardized). Low priority — worth it only during another CSS pass.

---

## Positive observations (no change)

- `src/routes/doc/[id]/+page.server.ts` — clean load: UUID validation, `event.depends()` for invalidation, no hard-coded strings. Pattern to imitate.
- `src/lib/branding.ts` is the single source of truth for brand strings; 22+ consumers and zero hard-coded bypasses.
- Service init is synchronous with a Svelte-ignore comment (`layout.svelte:34`) — correct for manifests that never change during client-side navigation. The reasoning should be surfaced in a one-line comment rather than requiring the reader to chase the ignore directive.

---

## Summary table

| ID | Severity | File | One-line |
|---|---|---|---|
| M1 | M | `+layout.svelte` | Extract session monitor + global hotkeys |
| M2 | M | `+page.svelte` | Pick one of `data` / `$page.data` |
| M3 | M | `app.css:554-622` | Merge `.prose` + `.widget-prose` or document split |
| M4 | M | `app.css:480-537` | Drop redundant `color:` declarations |
| L1 | L | `signin`, `terms`, `classification.ts` | Single-source the CUI warning text |
| L2 | L | `app.css:625-640` | Audit vendor prefixes |
