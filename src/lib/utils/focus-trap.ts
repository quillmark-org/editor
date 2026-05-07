/**
 * Focus trap utility for dialogs and modals
 * Traps keyboard focus within a container element
 */

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const AUTOFOCUS_SELECTOR = '[data-autofocus], [autofocus]';

interface FocusTrapOptions {
	restoreFocus?: boolean;
	/**
	 * Optional CSS selector to choose initial focus target inside the container.
	 * Falls back to [data-autofocus]/[autofocus], then first tabbable element.
	 */
	initialFocusSelector?: string;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function getInitialFocusTarget(
	container: HTMLElement,
	options: FocusTrapOptions
): HTMLElement | null {
	if (options.initialFocusSelector) {
		const explicitTarget = container.querySelector<HTMLElement>(options.initialFocusSelector);
		if (explicitTarget) return explicitTarget;
	}

	const autofocusTarget = container.querySelector<HTMLElement>(AUTOFOCUS_SELECTOR);
	if (autofocusTarget) return autofocusTarget;

	const focusableElements = getFocusableElements(container);
	if (focusableElements.length > 0) return focusableElements[0];

	return null;
}

function createFocusTrap(container: HTMLElement, options: FocusTrapOptions = {}) {
	let previouslyFocusedElement: HTMLElement | null = null;
	const { restoreFocus = true } = options;

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === ' ' && event.target === container) {
			// If focus lands on the wrapper, never allow native Space behavior there.
			event.preventDefault();
			getInitialFocusTarget(container, options)?.focus({ preventScroll: true });
			return;
		}

		if (event.key !== 'Tab') return;

		const focusableElements = getFocusableElements(container);
		if (focusableElements.length === 0) {
			event.preventDefault();
			return;
		}

		const firstFocusable = focusableElements[0];
		const lastFocusable = focusableElements[focusableElements.length - 1];

		if (event.shiftKey) {
			// Shift+Tab: moving backwards
			if (document.activeElement === firstFocusable) {
				event.preventDefault();
				lastFocusable?.focus();
			}
		} else {
			// Tab: moving forwards
			if (document.activeElement === lastFocusable) {
				event.preventDefault();
				firstFocusable?.focus();
			}
		}
	}

	function handleFocusIn(event: FocusEvent) {
		if (event.target !== container) return;
		// Recovery focus (e.g. after the previously focused descendant was removed)
		// must not scroll — otherwise the container can jump to [data-autofocus].
		getInitialFocusTarget(container, options)?.focus({ preventScroll: true });
	}

	function activate() {
		// Save currently focused element
		previouslyFocusedElement = document.activeElement as HTMLElement;

		// Focus initial target with deterministic fallback order.
		setTimeout(() => {
			getInitialFocusTarget(container, options)?.focus();
		}, 0);

		// Add keydown listener
		container.addEventListener('keydown', handleKeyDown);
		container.addEventListener('focusin', handleFocusIn);
	}

	function deactivate() {
		// Remove keydown listener
		container.removeEventListener('keydown', handleKeyDown);
		container.removeEventListener('focusin', handleFocusIn);

		// Restore focus to previously focused element
		if (restoreFocus && previouslyFocusedElement) {
			// Small delay to ensure smooth transition
			setTimeout(() => {
				previouslyFocusedElement?.focus();
			}, 0);
		}
	}

	return {
		activate,
		deactivate
	};
}

/**
 * Svelte action for focus trapping
 * Usage: <div use:focusTrap>
 */
export function focusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
	const trap = createFocusTrap(node, options);
	trap.activate();

	return {
		destroy() {
			trap.deactivate();
		}
	};
}
