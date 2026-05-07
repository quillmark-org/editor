# Hotkey System Design

**Purpose**: Consistent keyboard shortcuts throughout the TongueToQuill web application.

**Status**: Active

---

## Usage

```typescript
import { useHotkey } from '$lib/services/hotkey';

useHotkey('save', 'Mod-s', 'Save document', () => {
  saveDocument();
  return true;
});
```

The service provides:
- **Registry** for documentation (`hotkeyService.getAllDefinitions()`)
- **Conflict detection** in dev mode
- **Platform-aware formatting** (`hotkeyService.formatHotkey('Mod-s')` → `⌘S` on Mac)

---

## Hotkey Reference

### Global

| Key | Action |
|-----|--------|
| `Mod-s` | Save document |
| `Escape` | Collapse sidebar (mobile) |

### Modal

| Key | Action |
|-----|--------|
| `Escape` | Close/cancel |
| `Mod-Enter` | Submit/accept |

### Visual Editor

| Key | Action |
|-----|--------|
| `Mod-b` | Bold |
| `Mod-i` | Italic |
| `Mod-u` | Underline |
| `Mod-z` | Undo |
| `Mod-Shift-z` | Redo |
| `Tab` | Indent list |
| `Shift-Tab` | Outdent list |

### Advanced Mode

| Key | Action |
|-----|--------|
| `Mod-.` | Toggle frontmatter fold |
| `Mod-b` | Bold (wraps in `**`) |
| `Mod-i` | Italic (wraps in `*`) |

---

## Architecture

- **Application-level hotkeys**: Managed by `HotkeyService` (e.g. save)
- **Modal hotkeys**: Managed by `useDismissible` hook
- **Editor hotkeys**: Managed by ProseMirror/CodeMirror keymaps

---

_Last Updated: 2026-04-08_
