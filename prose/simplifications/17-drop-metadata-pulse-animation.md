# 17 — Drop the one-time pulse animation on metadata widgets

## Why it matters

`MetadataWidget.svelte` runs a 1200ms attention-pulse animation on the first metadata widget shown per page load. This is implemented with:

- a module-level `hasSessionPulsed` flag (lines 1-4, in a separate `<script module>` block)
- `showPulse` reactive state (line 109)
- a `setTimeout(300)` then a `setTimeout(1200)` chain (lines 117-129)
- a derived class string injection (`animate-metadata-widget-pulse`, lines 111-115)
- a corresponding CSS keyframe somewhere in `styles/utilities.css` or theme

It is a tiny, easy-to-miss "remember to fill out frontmatter" cue. Users who use the editor more than once a session see it once. The cost — module-scoped global state, two timers, conditional class machinery — is disproportionate.

## Evidence

`src/lib/components/MetadataWidget.svelte`:

```svelte
<script module lang="ts">
    // Session-level flag - pulse only once per page load
    let hasSessionPulsed = false;
</script>

<script lang="ts">
    …
    let showPulse = $state(false);

    const widgetClass = $derived(
        `metadata-widget-base divider-border-t divider-border-b border-divider-accent transition-colors ${
            showPulse ? 'animate-metadata-widget-pulse' : ''
        }`
    );

    onMount(() => {
        if (hasSessionPulsed || context !== 'frontmatter') return;
        hasSessionPulsed = true;
        const startTimer = setTimeout(() => {
            showPulse = true;
            setTimeout(() => { showPulse = false; }, 1200);
        }, 300);
        return () => clearTimeout(startTimer);
    });
</script>
```

The module-level flag is the smell — global mutable state to coordinate "have we pulsed yet this session" across component instances.

## What to delete

- The `<script module>` block containing `hasSessionPulsed`
- `showPulse` state
- The `showPulse ? 'animate-metadata-widget-pulse' : ''` ternary in `widgetClass`
- The `onMount` block at lines 117-129
- The `animate-metadata-widget-pulse` CSS keyframe (search `styles/`)

`widgetClass` collapses to a static string and can move out of `$derived`.

## Risk / verification

- Pure visual feature; no functional impact.
- The "where do I fill out fields?" hint disappears. If user research shows the pulse helps onboarding, replace with a one-time empty-state hint inside the widget itself.

## Cascade

- ~25 lines removed including module-scope state, two `setTimeout`s, and one CSS keyframe.
- Eliminates the only `<script module>` block in the package (a minor code-style simplification).
