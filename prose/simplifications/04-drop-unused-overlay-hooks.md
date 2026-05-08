# 04 — Drop unused overlay hooks

## Why it matters

`src/lib/utils/overlay/` contains 5 composition helpers (`use-portal`, `use-focus-trap`, `use-positioning`, `use-dismissible`, `use-zindex`). Two of them are never imported. The presence of empty composition primitives invites the reader to assume there is a coherent overlay framework here — there isn't.

This proposal targets only the never-imported ones. Proposal #08 collapses the rest.

## Evidence

```
$ grep -rn "use-portal\|usePortal" src --include="*.ts" --include="*.svelte" | grep -v "overlay/use-portal"
(no output)

$ grep -rn "use-focus-trap\|useFocusTrap" src --include="*.ts" --include="*.svelte" | grep -v "overlay/use-focus-trap"
(no output)
```

- `src/lib/utils/overlay/use-portal.ts` (24 lines) — defines `usePortal({ target?, disabled? })` returning `{ portalTarget, portalDisabled }`. Returns the same data the caller passes in. Never imported.
- `src/lib/utils/overlay/use-focus-trap.ts` (38 lines) — wraps `focus-trap.ts` with an `enabled` flag. Never imported. (The base `focus-trap.ts` is also not imported anywhere — see Risk.)

## What to delete

- `src/lib/utils/overlay/use-portal.ts`
- `src/lib/utils/overlay/use-focus-trap.ts`

If `npm run check` then surfaces that nothing uses `src/lib/utils/focus-trap.ts` either:

```
$ grep -rn "focusTrap\|focus-trap" src --include="*.ts" --include="*.svelte" \
       | grep -v "overlay/use-focus-trap.ts" \
       | grep -v "utils/focus-trap.ts"
(no output)
```

Then also delete `src/lib/utils/focus-trap.ts` (134 lines). Net deletion: ~196 lines if focus-trap goes too.

## Risk / verification

- `npm run check` will reveal any straggler imports.
- `BasePopover` (in proposal #05) and the dialog dismissal flow are sometimes built on focus traps in other apps — verify by full-text search before deleting `focus-trap.ts`. In this codebase nothing builds dialogs.

## Cascade

- Removes a phantom "overlay framework" abstraction.
- Combined with #05 (delete `base-popover` and `label`), the `overlay/` directory shrinks to just `use-positioning` (covered in #08), `use-dismissible`, and `use-zindex`.
- Combined with #08 (collapse remaining overlay hooks into call sites), the `overlay/` folder disappears entirely.
