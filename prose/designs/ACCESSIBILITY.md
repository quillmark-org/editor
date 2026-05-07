# Accessibility & Section 508 Compliance - MVP

## Core Requirements for Launch

### Essential WCAG 2.1 Level AA (Must-Have)

**Keyboard Navigation**:

- All interactive elements accessible via Tab/Shift+Tab
- Visible focus indicators on all focusable elements
- No keyboard traps
- ESC closes modals/menus

**Screen Reader Basics**:

- Alt text for images
- ARIA labels for icon-only buttons
- Form labels properly associated
- Page title set

**Color & Contrast**:

- 4.5:1 contrast ratio for normal text
- 3:1 for large text (18pt+) and UI components
- Don't rely on color alone for information (use icons + text)

**Mobile/Touch**:

- Touch targets minimum 44x44px
- Content reflows at mobile widths

### Testing for MVP

**Quick Checks**:

1. Tab through the app - can you reach everything?
2. Turn on a screen reader - does it make sense?
3. Use a contrast checker on key UI elements
4. Test on mobile - can you tap buttons easily?

**Automated**:

- Flag blocking issues only

## Defer to Post-MVP

These can be added iteratively after launch:

- Multiple navigation methods (skip links, breadcrumbs)
- Configurable keyboard shortcuts
- Advanced ARIA live regions for dynamic content
- Comprehensive screen reader testing (NVDA, JAWS, VoiceOver)
- 200% zoom testing
- Motion preferences (`prefers-reduced-motion`)
- Detailed timing controls
- Full Section 508 documentation
- Accessibility statement page
- Formal compliance audits

## Launch Checklist

- [ ] Keyboard navigation works throughout
- [ ] Focus indicators visible
- [ ] Alt text on images
- [ ] Form labels present
- [ ] Color contrast meets minimums
- [ ] Mobile touch targets adequate
- [ ] One manual keyboard test pass
- [ ] One manual screen reader spot check


