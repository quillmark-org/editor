# Design Tokens

**Centralized design value system for consistent theming across Tonguetoquill.**

## Overview

Design tokens are the atomic design values that define the visual language of Tonguetoquill. All tokens are defined as CSS custom properties in `src/app.css` and registered with Tailwind CSS v4 for utility class generation.

## Token Categories

### Color Tokens

**Surface Colors**:

- `--color-background` - Main background color
- `--color-foreground` - Main text color
- `--color-surface` - Secondary background (cards/panels)
- `--color-surface-elevated` - Elevated surfaces (menu, toolbar)

**Interactive States**:

- `--color-primary` - Primary action color (USAF blue #355e93)
- `--color-primary-foreground` - Text on primary
- `--color-secondary` - Secondary action color
- `--color-secondary-foreground` - Text on secondary

**Identity & Overlay**:

- `--color-brand` - Brand accent for the wordmark
- `--color-brand-foreground` - Text on brand
- `--color-overlay` - Scrim for dialogs, sheets, popovers

**Semantic Colors**:

- `--color-muted` - Muted backgrounds
- `--color-muted-foreground` - Muted text (#71717a in dark)
- `--color-accent` - Accent backgrounds (hover states)
- `--color-accent-foreground` - Text on accent
- `--color-destructive` - Error/destructive actions (#ef4444)
- `--color-destructive-foreground` - Text on destructive

**UI Elements**:

- `--color-border` - Default border color
- `--color-border-hover` - Border on hover
- `--color-input` - Input field borders
- `--color-ring` - Focus ring color

**Feedback & Status**:

- `--color-error` / `--color-error-foreground` / `--color-error-background` / `--color-error-border`
- `--color-warning` / `--color-warning-foreground` / `--color-warning-background` / `--color-warning-border`
- `--color-success` / `--color-success-foreground` / `--color-success-background` / `--color-success-border`
- `--color-info` / `--color-info-foreground` / `--color-info-background` / `--color-info-border`

**Classification Banners**:

- `--color-classification-unclassified` / `--color-classification-unclassified-foreground`
- `--color-classification-cui` / `--color-classification-cui-foreground`
- Classification colors are shared for light/dark themes; only one set of tokens is defined and reused across theme scopes.

**Editor Colors**:

- `--color-editor-background` - Editor background
- `--color-editor-foreground` - Editor text
- `--color-editor-line-active` - Active line highlight
- `--color-editor-selection` - Selection background
- `--color-editor-cursor` - Cursor color
- `--color-editor-gutter-background` - Line number gutter
- `--color-editor-gutter-foreground` - Line number text

**Syntax Highlighting**:

- `--color-syntax-keyword` - Keywords (USAF blue #355e93)
- `--color-syntax-identifier` - Identifiers (cyan)
- `--color-syntax-string` - Strings (green)
- `--color-syntax-number` - Numbers (amber)
- `--color-syntax-boolean` - Booleans (purple)
- `--color-syntax-metadata-bg` - Metadata block tint
- `--color-syntax-metadata-border` - Metadata border

### Spacing Tokens

**Base Unit**: 4px (0.25rem)

**Spacing Scale**: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px

**Component Heights**:

- Top bar: 48px (`h-12`)
- Sidebar header: 48px (`h-12`)
- Sidebar expanded: 288px (`w-72`)
- Sidebar collapsed: 48px (`w-12`)
- Standard buttons: 40px (`h-10`)
- Medium buttons: 32px (`h-8`)
- Small buttons: 28px (`h-7`)

**Padding Standards**:

- Tight: 4px
- Compact: 8px
- Standard: 16px
- Generous: 24px
- Spacious: 32px

**Mobile Touch Targets**:

- Minimum: 44px
- Spacing: 8px minimum between targets

### Typography Tokens

**Font Families**:

- UI: `'Lato', Arial, sans-serif`
- Editor: `ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, 'Courier New', monospace`
- Preview: `'Crimson Text', Georgia, 'Times New Roman', serif`

**Font Weights**:

- Normal: 400
- Medium: 500
- Semibold: 600
- Bold: 700
- Black: 900

**Type Scale**:

- XS: 12px
- SM: 14px
- Base: 16px
- LG: 18px
- XL: 20px
- 2XL: 24px
- 3XL: 30px
- 4XL: 36px

**Line Heights**:

- Tight: 1.25 (headings)
- Normal: 1.5 (body text)
- Relaxed: 1.75 (long-form content)

### Border Tokens

**Border Radius**:

- Small: 4px
- Medium: 8px
- Large: 10px (base: `--radius: 0.625rem`)
- XL: 14px
- Full: 9999px (circular/pill)

**Border Widths**:

- Default: 1px
- Heavy: 1.5px (`.top-menu-strong-border`)
- Thick: 2px

### Shadow Tokens

**Shadow Scale**:

- Small: Subtle depth
- Medium: Standard elevation
- Large: Prominent elevation
- XL: Maximum elevation

**Elevation Layers**: See Z-Index Tokens section

### Z-Index Tokens

**Canvas Layers** (0–50):

- `--z-content: 0` - Base content layer
- `--z-canvas-ui: 10` - Sidebar (desktop)
- `--z-canvas-overlay: 20` - Canvas tools (ruler)
- `--z-sidebar-backdrop: 40` - Mobile sidebar backdrop
- `--z-sidebar: 50` - Mobile sidebar

**Widget Layers** (1000–1300):

- `--z-dropdown: 1000` - Dropdowns and selects
- `--z-scoped-backdrop: 1050` - Scoped modal backdrops (utility pages)
- `--z-scoped-content: 1075` - Scoped modal content (About, Terms, Privacy)
- `--z-popover: 1100` - Navigation popovers (kebab menu)
- `--z-toast: 1200` - Toast notifications
- `--z-banner: 1300` - Notification banners

**Modal Layers** (1400–1500):

- `--z-modal-backdrop: 1400` - Global modal backdrops
- `--z-modal-content: 1500` - Global modal content

**Layer Hierarchy Rules**:

1. Scoped content (1050–1075) always below navigation (1100)
2. Navigation popovers (1100) accessible above utility pages
3. Global modals (1400–1500) block all interaction
4. Toasts (1200) above scoped content but below global modals

### Animation Tokens

**Duration Scale**:

- Fast: 150ms (micro-interactions)
- Base: 300ms (standard transitions)
- Slow: 500ms (complex animations)

**Easing Functions**:

- Ease-in: Entry animations
- Ease-out: Exit animations
- Ease-in-out: State changes
- Spring: Playful interactions

**Reduced Motion**: Honor `prefers-reduced-motion` system setting

## Theme System Architecture

### CSS Custom Properties Foundation

**Location**: `src/app.css`

```css
:root {
--color-background: #ffffff;
--color-foreground: #09090b;
/* ... light theme tokens ... */
}

.dark {
--color-background: #18181b;
--color-foreground: #f4f4f5;
/* ... dark theme overrides ... */
}
```

### Tailwind CSS Integration

**Mechanism**: Tailwind v4 `@theme inline` directive

- `bg-background` → `var(--color-background)`
- `text-foreground` → `var(--color-foreground)`
- Theme changes via `.dark` class instantly update utilities

## Focus Indicators

**Default**:

- Outline: 2px solid USAF blue
- Offset: 2px

**High Contrast**:

- Outline: 3px solid (via `prefers-contrast: high`)

**Rule**: Never remove focus styles

## Loading Thresholds

**Loading Delay**: 300ms — show loading indicator only if operation exceeds 300ms.

## Token Usage Guidelines

### Color Usage

**Contrast Minimums**:

- Normal text: 4.5:1 (WCAG AA)
- Large text (18px+): 3:1 (WCAG AA)
- UI components: 3:1
- High contrast mode: 7:1 (WCAG AAA)

**Guidelines**:

- For feedback banners/toasts, use the status sets (`color-warning-*`, `color-info-*`, `color-success-*`, `color-error-*`) instead of palette colors
- Use `--color-overlay` for dialog/sheet scrims instead of `bg-black/40`
- Use classification tokens for banners rather than hex values or inline styles

### Spacing Usage

- Mobile touch targets: 44px minimum
- Desktop touch targets: 32px minimum
- Spacing between targets: 8px minimum

### Typography Usage

- Body text minimum: 16px
- Line height minimum: 1.5

### Z-Index Usage

| Range     | Purpose                                    | Position                    |
| --------- | ------------------------------------------ | --------------------------- |
| 1050–1075 | Scoped overlays (About, Terms, Privacy)    | `absolute` within container |
| 1100      | Navigation popovers (kebab, profile)       | `fixed` at document root    |
| 1400–1500 | Global modals (confirmations, share)       | `fixed` at document root    |

## Breakpoint Tokens

| Token | Value  | Viewport        |
| ----- | ------ | --------------- |
| `sm`  | 640px  | Mobile landscape |
| `md`  | 768px  | Tablet portrait  |
| `lg`  | 1024px | Desktop          |
| `xl`  | 1280px | Large desktop    |
| `2xl` | 1536px | Extra large      |

**Mobile-First**: Base styles for mobile, enhanced at larger breakpoints via `min-width` media queries.
