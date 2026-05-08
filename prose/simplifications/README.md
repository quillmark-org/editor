# Simplification proposals

The original 17-proposal inventory was triaged in branch `claude/review-code-simplifications-WgaLc`:

- **Implemented**: #01–#12 (pure deletions, consolidations, public-surface trim, dead-component prune, `InlineMetadataNode` removal, Tooltip → CSS hint).
- **Rejected**: #13 (CodeMirror Advanced mode stays), #15 (preview comfort dim stays), #16 (last-successful render stays), #17 (metadata pulse stays).
- **Deferred**: [#14](./14-drop-inline-card-titles.md) — drop inline-editable card titles. Pending a decision on whether downstream Quillmark templates consume the `PRESENTATION.name` field.

Net result of the implemented set: roughly 2,150 lines deleted across 30+ files, no behavior change visible to a `<DocumentEditor>` user (modulo the deliberate behavior changes called out in commit messages: literal `---` lines in body text no longer get a custom HR rendering, native browser tooltip styling replaced by themed CSS hint).
