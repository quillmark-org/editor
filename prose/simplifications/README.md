# Simplification proposals

The original 17-proposal inventory was triaged in branch `claude/review-code-simplifications-WgaLc`:

- **Implemented**: #01–#12 (pure deletions, consolidations, public-surface trim, dead-component prune, `InlineMetadataNode` removal, Tooltip → CSS hint).
- **Rejected**: #13 (CodeMirror Advanced mode stays), #15 (preview comfort dim stays), #16 (last-successful render stays), #17 (metadata pulse stays).
- **Deferred**: [#14](./14-drop-inline-card-titles.md) — drop inline-editable card titles. Pending a decision on whether downstream Quillmark templates consume the `PRESENTATION.name` field.

Net result of the implemented set: roughly 2,150 lines deleted across 30+ files, no behavior change visible to a `<DocumentEditor>` user (modulo the deliberate behavior changes called out in commit messages: literal `---` lines in body text no longer get a custom HR rendering, native browser tooltip styling replaced by themed CSS hint).

A second pass triaged in [#18](./18-advanced-mode-spike.md):

- **Implemented (Tier 1)**: drop `{:placeholder:}` decoration + click handler, drop `!fill` YAML tag styling (engine strips them), drop markdown bold/italic/underline/link decorations in source view, drop `<u>` shortcut.
- **Implemented (Tier 2)**: drop YAML block folding entirely (fold service, fold-utils, `DelimiterFoldWidget`, custom `placeholderDOM` rendering, `Mod-.` keybinding).
- **Deferred (Tier 3)**: replace remaining CodeMirror surface with `<textarea>`. Pending a UX evaluation of cursor/scroll preservation tradeoffs (see #18 "Tier 3 losses").

Net result of Tiers 1+2: ~2,065 lines deleted across 12 files. Behavior changes: source-view loses bold/italic/underline/link colorization (rich mode is unaffected); advanced mode loses the click-to-fold metadata block UI and `Cmd/Ctrl+.` keybinding; `{:placeholder:}` and `!fill` no longer get distinguishing colors in source view.
