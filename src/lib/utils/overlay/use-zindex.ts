/**
 * Lightweight z-index coordination for popovers/tooltips.
 *
 * The original tonguetoquill-web wired this to a global overlay store that
 * coordinated dismissal stacks (escape closes the topmost). The editor
 * package owns far fewer overlays, so we use a simple per-instance counter
 * — each `registerEffect()` call returns a higher index than the last.
 *
 * `onClose` is kept on the contract so call sites don't need to change, but
 * we don't dispatch close events globally; consumers wire their own dismiss
 * behavior via `use-dismissible.ts` (click-outside / escape per element).
 */

export type OverlayType = 'tooltip' | 'popover' | 'dialog' | 'sheet' | 'select';

export interface ZIndexConfig {
	layer: OverlayType;
	onClose: () => void;
}

const baseZ: Record<OverlayType, number> = {
	tooltip: 1100,
	popover: 1050,
	select: 1040,
	sheet: 1020,
	dialog: 1010
};

let counter = 0;

export function useZIndex(config: ZIndexConfig) {
	const { layer } = config;
	let assigned = 0;

	function registerEffect() {
		assigned = baseZ[layer] + ++counter;
		return () => {
			assigned = 0;
		};
	}

	return {
		registerEffect,
		get zIndex() {
			return assigned;
		}
	};
}
