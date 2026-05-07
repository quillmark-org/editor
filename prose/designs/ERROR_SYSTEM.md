# Error System

**Unified error handling pattern across all application layers.**

## Overview

All errors in Tonguetoquill follow a consistent structure from WASM → Service → Frontend → UI.

## Error Class Hierarchy

### Base Error Class (AppError)

**Location**: `src/lib/errors/app-error.ts`

```typescript
interface AppError {
	code: string; // Unique identifier
	message: string; // Human-readable description
	statusCode: number; // HTTP status code
	hint?: string; // Optional fix guidance
	context?: Record<string, unknown>; // Optional debug data
}
```

### Service Error Classes

Each service (Document, Auth, Template, etc.) extends AppError with a typed error code union:

```typescript
type DocumentErrorCode = 'not_found' | 'unauthorized' | 'invalid_name' | 'content_too_large' | 'validation_error' | 'unknown_error';

class DocumentError extends AppError {
	code: DocumentErrorCode;
}
```

Follow this pattern for AuthError, TemplateError, etc., with domain-specific error codes.

**QuillmarkError**: WASM rendering errors

```typescript
type QuillmarkErrorCode =
	| 'not_initialized'
	| 'wasm_load_failed'
	| 'parse_error'
	| 'render_error'
	| 'unknown_error';

class QuillmarkError extends AppError {
	code: QuillmarkErrorCode;
	diagnostic?: QuillmarkDiagnostic; // Structured diagnostic info
}

interface QuillmarkDiagnostic {
	severity: 'error' | 'warning' | 'info';
	code?: string; // e.g., 'QM001'
	message: string;
	hint?: string;
	location?: {
		line: number;
		column: number;
		length: number;
	};
	sourceChain: string[]; // Error trace
}
```

## Error Flow Layers

### 1. QuillMark Layer (WASM)

**Error Source**: WASM parsing/rendering  
**Error Type**: QuillmarkError with structured diagnostic

- Parse errors: Invalid YAML, missing CARD
- Render errors: Unknown Quill template, compilation failure
- Validation errors: Invalid metadata structure

**Pattern**: WASM diagnostic → QuillmarkError → Service → UI

### 2. Service Layer

**Error Types**: Service-specific error classes (DocumentError, AuthError, etc.)

**Pattern**: Service methods throw typed errors for API failures (see SERVICE_FRAMEWORK.md)

### 3. Frontend Layer

**Error Handling**: Components catch typed errors and display via UI utilities

**Pattern**: `instanceof` checks for specific error types, then display via `getErrorMessage()` and UI components (see component READMEs)

### 4. UI Layer

**Display Patterns**:

- **Toast Notifications**: Brief, actionable messages (network errors, save failures)
- **Inline Errors**: Next to form fields (validation errors)
- **Error Pages**: Fatal errors with recovery options
- **Diagnostics Panel**: Structured QuillMark errors with location

## Shared Utilities

### Message Extraction

**Utility**: `getErrorMessage(error: unknown): string`

```
getErrorMessage(error):
  if error is AppError or Error → return error.message
  if error is string → return error
  else → return 'An unexpected error occurred'
```

### Error Display

**Toast Notifications** (`showErrorToast`):

```typescript
function showErrorToast(error: unknown) {
  const message = getErrorMessage(error);
  const hint = error instanceof AppError ? error.hint : undefined;

  toast.error(message, {
    description: hint,
    action: /* retry button if applicable */
  });
}
```

### Server Error Handler

**Generic Handler**: Server-side handlers catch AppError and respond with structured error JSON (see SERVICE_FRAMEWORK.md)

## UI Display Patterns

### Toast Notifications

**Use For**: Transient errors (network, save failures, API errors)

**Pattern**: Brief message (3-5 seconds), optional action button (retry)

**Accessibility**:
- `role="alert"` for screen readers
- Icon + text (not color alone)
- Keyboard dismissible (ESC)

### Inline Form Errors

**Use For**: Validation errors, field-specific issues

**Pattern**: Error text below field, red border, error icon

**Accessibility**:
- `aria-invalid="true"` on field
- `aria-describedby` linking to error message
- Error icon with alt text
- High contrast red (#ef4444)

### Error Pages

**Use For**: Fatal errors, route errors, auth failures

**Pattern**: Full page with error message, retry button, home link

**Accessibility**:
- Clear heading structure
- Focus management (focus error heading on mount)
- Keyboard navigation
- Action buttons with clear labels

### Diagnostics Panel (QuillMark)

**Use For**: Structured QuillMark errors with source location

**Pattern**: Collapsible panel with diagnostic details

**Display**:
- Severity indicator (error/warning/info)
- Error message with code
- Hint (if available)
- Source location (line/column)
- Source chain (error trace)

**Accessibility**:
- Collapsible with `aria-expanded`
- Keyboard toggle (Enter/Space)
- Screen reader announces severity
- High contrast colors per severity

## Visual Design

### Error Colors

**Design Token**: `--color-destructive: #ef4444`

- Error text: `text-destructive`
- Error borders: `border-destructive`
- Error backgrounds: `bg-destructive/10`

**Contrast**: 4.5:1 minimum (WCAG AA) on all backgrounds

### Error Icons

**Lucide Icons**:
- Error: `AlertCircle`
- Warning: `AlertTriangle`
- Info: `Info`

**Sizes**: Toast 20px · Inline 16px · Page 48px

**Always Paired**: Icon + text (never icon alone)

### Layout Patterns

**Toast**:

```
[Icon] Error message
       Optional hint text
       [Retry Button]
```

**Inline Error**:

```
[Input Field with red border]
[Icon] Error message
```

**Error Page**:

```
[Large Icon]
Error Title
Error message with details
[Retry Button] [Home Button]
```

**Diagnostics Panel**:

```
▶ [Severity Icon] Error: message (code)
  Hint: guidance text
  Location: line 5, column 12
  Source: WASM → Parser → Renderer
```

## Error Recovery Patterns

### Retry Strategy

**Retryable**: Network errors, timeouts, 5xx server errors  
**Non-retryable**: Validation errors (4xx except 429), 401, 403, 404

```
withRetry(fn, maxRetries=3):
  for i in 0..maxRetries:
    try:
      return await fn()
    catch error:
      if isRetryable(error) and i < maxRetries - 1:
        wait exponential backoff (2^i * 1s)
      else:
        throw error
```

### Fallback Strategy

**Guest Mode Fallback**: If API fails, fall back to localStorage

```typescript
try {
	return await apiClient.getDocuments();
} catch (error) {
	if (error instanceof AuthError && error.code === 'unauthorized') {
		return localStorageClient.getDocuments();
	}
	throw error;
}
```

### Optimistic Updates Rollback

```typescript
const originalDoc = { ...currentDoc };
currentDoc.content = newContent; // Optimistic update

try {
	await documentStore.updateDocument(id, { content: newContent });
} catch (error) {
	currentDoc.content = originalDoc.content; // Rollback
	showErrorToast(error);
}
```

---

**Error System READMEs**: `src/lib/errors/README.md` — Error class implementations and utilities

**Note**: Error classes and utilities are implemented in `src/lib/errors/`. Diagnostic display is handled inline in components without a dedicated DiagnosticsPanel component.
