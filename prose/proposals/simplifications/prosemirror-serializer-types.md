# Typed Access to MarkdownSerializerState Internals

**Purpose**: Remove the `as any` casts in the QuillMark markdown serializer.

**Status**: Proposed
**Related**: `src/lib/editor/prosemirror/serializer.ts`

---

## Problem

`forceTightListTransition` (and its prior inline duplicates) reaches into `MarkdownSerializerState` for two fields that `prosemirror-markdown` doesn't include in its public types:

```ts
const closed = (state as unknown as { closed?: Node }).closed;
if (closed && (…)) {
  (state as unknown as { flushClose: (n: number) => void }).flushClose(1);
}
```

Both `closed` and `flushClose` exist at runtime and are the de-facto mechanism for controlling inter-block whitespace in custom serializers — this is documented on the prosemirror forum and used by the upstream defaults — but the TS types don't surface them. The cast silences the type error without capturing why the access is safe.

## Scope

In-scope: one module augmentation or one local type alias that names the internals we touch. Out of scope: upstreaming fixes to `prosemirror-markdown`.

## Options

### A. Local type alias (lowest cost)

```ts
type ListTransitionState = MarkdownSerializerState & {
  closed?: Node;
  flushClose: (n: number) => void;
};

function forceTightListTransition(state: ListTransitionState) { … }
```

Callers pass `state as ListTransitionState` once at the call site — still a cast, but the shape is named and greppable.

### B. Module augmentation

```ts
declare module 'prosemirror-markdown' {
  interface MarkdownSerializerState {
    closed?: Node;
    flushClose(n: number): void;
  }
}
```

Eliminates casts entirely and every handler in `serializer.ts` gets the correct types. Downside: if upstream ever publishes these on the real type, our declaration can drift. Mitigation: pin the augmentation in the same file so it's co-located with the usage.

## Recommendation

**B.** The augmentation pays off because `nodes` already has 4+ handlers that could benefit (`table`, `bullet_list`, `ordered_list`, `inline_metadata`), and the alternative is casting at each call.

## Non-goals

- Don't write a general-purpose wrapper around `MarkdownSerializerState`. The need is small and a class wrapper would just forward most methods.
- Don't add runtime guards (`typeof state.flushClose === 'function'`). The methods have existed since prosemirror-markdown 1.0; defensive checks add noise.

## Risk

Very low. Type-only change; runtime behavior is unchanged.
