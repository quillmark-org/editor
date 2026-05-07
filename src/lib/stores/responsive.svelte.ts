/**
 * Responsive store - Centralized responsive state management
 *
 * Provides a reactive store for tracking viewport size and device type.
 * Used across components (Sidebar, DocumentEditor, etc.) to coordinate
 * responsive behavior.
 *
 * Note: This store uses custom lifecycle management (initialize/destroy) that
 * doesn't benefit from factory abstraction. Kept as-is for clarity.
 */

// Breakpoint definition (matches Tailwind's md breakpoint)
const MOBILE_BREAKPOINT = 768;

class ResponsiveStore {
	isNarrowViewport = $state(false);
	isPortraitViewport = $state(false);
	isTouchDevice = $state(false);
	isInitialized = $state(false);

	constructor() {
		// Initialize will be called on mount
	}

	/**
	 * Initialize responsive tracking
	 * Should be called once in the root layout or main component
	 */
	initialize() {
		if (this.isInitialized) return;

		// Check initial state
		this.checkNarrowViewport();
		this.checkPortraitViewport();
		this.checkTouchDevice();

		// Listen for resize events
		if (typeof window !== 'undefined') {
			window.addEventListener('resize', this.checkNarrowViewport);
			window.addEventListener('resize', this.checkPortraitViewport);
			window.addEventListener('orientationchange', this.checkPortraitViewport);
			this.isInitialized = true;
		}
	}

	/**
	 * Clean up event listeners
	 */
	destroy() {
		if (typeof window !== 'undefined') {
			window.removeEventListener('resize', this.checkNarrowViewport);
			window.removeEventListener('resize', this.checkPortraitViewport);
			window.removeEventListener('orientationchange', this.checkPortraitViewport);
			this.isInitialized = false;
		}
	}

	/**
	 * Check if viewport is narrow (< 768px)
	 * Used for responsive layout decisions
	 */
	checkNarrowViewport = () => {
		if (typeof window !== 'undefined') {
			this.isNarrowViewport = window.innerWidth < MOBILE_BREAKPOINT;
		}
	};

	/**
	 * Check if viewport is portrait-oriented
	 * Used for mobile-disabled fallback screen handling
	 */
	checkPortraitViewport = () => {
		if (typeof window !== 'undefined') {
			this.isPortraitViewport = window.matchMedia('(orientation: portrait)').matches;
		}
	};

	/**
	 * Check if device has touch capability
	 * Uses multiple detection methods for broad browser support
	 */
	checkTouchDevice = () => {
		if (typeof window !== 'undefined') {
			this.isTouchDevice =
				'ontouchend' in document ||
				navigator.maxTouchPoints > 0 ||
				// @ts-expect-error - msMaxTouchPoints is IE/Edge legacy
				navigator.msMaxTouchPoints > 0;
		}
	};
}

// Export singleton instance
export const responsiveStore = new ResponsiveStore();
