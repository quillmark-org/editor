<script lang="ts">
	import BaseSelect from '$lib/ui/base-select.svelte';
	type BaseSelectInstance = { focus(): void; openDropdown(): void };

	interface Props {
		/** Currently selected card type */
		value: string | null;
		/** Available card types to select from */
		items: string[];
		/** Placeholder text */
		placeholder?: string;
		/** Callback when a type is selected */
		onSelect: (value: string) => void;
		/** Automatically focus and open on mount */
		autoFocus?: boolean;
	}

	let {
		value,
		items,
		placeholder = "Select a card type...",
		onSelect,
		autoFocus = false
	}: Props = $props();

	let baseSelect: BaseSelectInstance | undefined = $state();

	// Expose focus
	export function focus() {
		baseSelect?.focus();
	}

	// Expose openDropdown
	export function openDropdown() {
		baseSelect?.openDropdown();
	}
</script>

<BaseSelect
	bind:this={baseSelect}
	value={value as string}
	items={items}
	getItemKey={(item) => item}
	getItemLabel={(item) => item.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
	placeholder={placeholder}
	onValueChange={onSelect}
	{autoFocus}
/>
