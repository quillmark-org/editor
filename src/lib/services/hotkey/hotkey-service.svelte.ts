import { browser, dev } from '$app/environment';
import { SvelteMap } from 'svelte/reactivity';
import type { HotkeyDefinition, HotkeyHandler } from './types';

function parseHotkey(hotkey: string): { key: string; mod: boolean; shift: boolean; alt: boolean } {
	const parts = hotkey.split('-');
	return {
		key: parts[parts.length - 1].toLowerCase(),
		mod: parts.includes('Mod'),
		shift: parts.includes('Shift'),
		alt: parts.includes('Alt')
	};
}

function matchesHotkey(event: KeyboardEvent, hotkey: string): boolean {
	const config = parseHotkey(hotkey);
	const isMod = event.metaKey || event.ctrlKey;

	// Strict modifier checking:
	// A hotkey defined as "Mod-." should NOT match if Shift is also pressed (unless "Shift" is in definition)
	if (config.mod !== isMod) return false;
	if (config.shift !== event.shiftKey) return false;
	if (config.alt !== event.altKey) return false;

	return event.key.toLowerCase() === config.key;
}

class HotkeyService {
	private definitions = new Map<string, HotkeyDefinition>();
	private handlers = new Map<string, HotkeyHandler>();
	private listenerAttached = false;

	register(id: string, key: string, description: string): void {
		if (dev && this.definitions.has(id)) {
			console.warn(`[HotkeyService] Overwriting hotkey: ${id}`);
		}
		this.definitions.set(id, { id, key, description });
		this.checkConflicts();
	}

	unregister(id: string): void {
		this.definitions.delete(id);
		this.handlers.delete(id);
		if (this.handlers.size === 0) this.detachListener();
	}

	addHandler(id: string, handler: (event: KeyboardEvent) => boolean | void): void {
		this.handlers.set(id, { id, handler });
		if (browser && !this.listenerAttached) this.attachListener();
	}

	removeHandler(id: string): void {
		this.handlers.delete(id);
		if (this.handlers.size === 0) this.detachListener();
	}

	getAllDefinitions(): HotkeyDefinition[] {
		return Array.from(this.definitions.values());
	}

	formatHotkey(hotkey: string): string {
		if (!browser) return hotkey;
		const isMac = navigator.platform.toLowerCase().includes('mac');
		return hotkey
			.replace('Mod', isMac ? '⌘' : 'Ctrl')
			.replace('Shift', isMac ? '⇧' : 'Shift')
			.replace('Alt', isMac ? '⌥' : 'Alt')
			.replace(/-/g, isMac ? '' : '+');
	}

	private checkConflicts(): void {
		if (!dev) return;
		const byKey = new SvelteMap<string, string[]>();
		for (const def of this.definitions.values()) {
			const ids = byKey.get(def.key) ?? [];
			ids.push(def.id);
			byKey.set(def.key, ids);
		}
		for (const [key, ids] of byKey) {
			if (ids.length > 1) {
				console.warn(`[HotkeyService] Conflict on "${key}": ${ids.join(', ')}`);
			}
		}
	}

	private attachListener(): void {
		if (!browser || this.listenerAttached) return;
		window.addEventListener('keydown', this.handleKeyDown);
		this.listenerAttached = true;
	}

	private detachListener(): void {
		if (!browser || !this.listenerAttached) return;
		window.removeEventListener('keydown', this.handleKeyDown);
		this.listenerAttached = false;
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		for (const handler of this.handlers.values()) {
			const def = this.definitions.get(handler.id);
			if (!def) continue;
			if (matchesHotkey(event, def.key)) {
				if (handler.handler(event)) {
					event.preventDefault();
					return;
				}
			}
		}
	};
}

export const hotkeyService = new HotkeyService();
