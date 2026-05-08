# 16 — Drop "last successful render dimmed under error overlay"

## Why it matters

When a render fails, `Preview.svelte` keeps the most recent successful render in memory and displays it dimmed (`opacity: 0.3 blur-sm`) behind an error overlay, instead of just showing the error. This is a nice idea but carries:

- 4 extra state fields (`lastSuccessfulResult`, `lastSuccessfulSvgPages`, `lastSuccessfulPdfUrl`, plus `pdfObjectUrl` cleanup paths that have to track which is current vs which is "last good")
- 6+ branches of object-URL revocation in the render path (lines 194-220) and onDestroy (lines 292-298)
- ~40 lines of error-branch JSX duplicating the success-branch JSX with `opacity-30 blur-sm` modifiers

Most editors just clear the preview and show the error. The "last good" view is initially confusing — users see a stale-looking blurred document and may think the editor is laggy rather than recognizing that they're seeing an old render.

## Evidence

`src/lib/components/Preview.svelte`:

- **State** (lines 39-43): `renderResult`, `lastSuccessfulResult`, `pdfObjectUrl`, `lastSuccessfulPdfUrl`, `svgPages`, `lastSuccessfulSvgPages`.
- **Save-success block** (lines 211-220): copies the just-rendered values into the `lastSuccessful*` fields.
- **Cleanup of lastSuccessfulPdfUrl** (lines 213-218): "Clean up old successful PDF URL" — extra revocation path on top of the current-render URL revocation.
- **OnDestroy** (lines 292-298): revoke both `pdfObjectUrl` AND `lastSuccessfulPdfUrl`.
- **Error rendering** (lines 320-349): if `errorDisplay`, render the dimmed last-good output behind the overlay. About 30 lines of duplicated SVG/PDF rendering JSX.

## What to delete

- `lastSuccessfulResult`, `lastSuccessfulSvgPages`, `lastSuccessfulPdfUrl` state fields
- The save-success copy block (lines 211-220)
- The "Clean up old successful PDF URL" branch in the render path
- The dimmed background block in the error branch (lines 321-349) — replaced by just the error overlay alone
- The `lastSuccessfulPdfUrl` revocation in onDestroy

The error branch becomes:

```svelte
{:else if errorDisplay}
    <div class="absolute inset-0 flex items-center justify-center bg-background/80 p-4">
        <div class="max-w-2xl rounded-lg border border-error-border bg-error-background p-6 …">
            <!-- existing error overlay JSX, lines 351-441 -->
        </div>
    </div>
```

— a clean error display with no stale background.

## Risk / verification

- Some users may prefer the "see last good" UX. If telemetry shows the feature is appreciated, keep it. If not, drop.
- Smoke: trigger an error (delete the QUILL field), confirm error renders cleanly without the dimmed prior frame.

## Cascade

- ~60 lines + 3 state fields + 2 revocation paths.
- Error path becomes single-purpose (just show the error).
- Combines well with #15: both touch Preview's render branches.
