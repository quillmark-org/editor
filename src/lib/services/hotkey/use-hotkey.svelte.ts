import { onDestroy } from 'svelte';
import { hotkeyService } from './hotkey-service.svelte';

export function useHotkey(
	id: string,
	key: string,
	description: string,
	handler: (event: KeyboardEvent) => boolean | void
): void {
	hotkeyService.register(id, key, description);
	hotkeyService.addHandler(id, handler);

	onDestroy(() => {
		hotkeyService.unregister(id);
	});
}
