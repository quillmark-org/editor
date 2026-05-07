/**
 * Store for managing ruler overlay state
 */
import { createSimpleState } from './factories.svelte';
import { responsiveStore } from './responsive.svelte';

const state = createSimpleState({
	initialValue: false
});

export const rulerStore = {
	get isActive() {
		return state.value;
	},
	setActive(active: boolean) {
		// Disable ruler on tap/touch devices
		if (active && responsiveStore.isTouchDevice) {
			return;
		}
		state.set(active);
	},
	toggle() {
		// Disable ruler on tap/touch devices
		if (!state.value && responsiveStore.isTouchDevice) {
			return;
		}
		state.toggle();
	}
};
