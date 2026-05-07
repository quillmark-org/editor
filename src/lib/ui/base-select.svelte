<script lang="ts" generics="T">
	import { generateUniqueId } from '$lib/utils/unique-id';
	import { Check, ChevronDown } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import Portal from '$lib/ui/portal.svelte';

	interface BaseSelectProps<T> {
		/** Currently selected value */
		value: T;

		/** Selection callback */
		onValueChange: (value: T) => void;

		/** Array of selectable items */
		items: T[];

		/** Get unique key for each item */
		getItemKey: (item: T) => string;

		/** Get display label for item */
		getItemLabel: (item: T) => string;

		/** Placeholder when no selection */
		placeholder?: string;

		/** Disable interaction */
		disabled?: boolean;

		/** Close dropdown after selection */
		closeOnSelect?: boolean;

		/** Enable type-ahead search */
		searchable?: boolean;

		/** Max height of dropdown */
		maxHeight?: string;

		/** Additional CSS classes */
		class?: string;

		/** Accessible label */
		label?: string;

		/** Unique ID */
		id?: string;

		/** Custom item renderer */
		itemContent?: Snippet<[T, boolean]>;

		/** Automatically focus and open on mount */
		autoFocus?: boolean;

		/** Allow clearing the selection by clicking the selected item again */
		clearable?: boolean;
	}

	let {
		value = $bindable(),
		onValueChange,
		items,
		getItemKey,
		getItemLabel,
		placeholder = 'Select...',
		disabled = false,
		closeOnSelect = true,
		searchable = true,
		maxHeight = '300px',
		class: className,
		label,
		id = generateUniqueId('select'),
		itemContent,
		autoFocus = false,
		clearable = false
	}: BaseSelectProps<T> = $props();

	// State
	let open = $state(false);
	let focusedIndex = $state(-1);
	let searchBuffer = $state('');
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	let triggerRef = $state<HTMLButtonElement | null>(null);
	let dropdownRef = $state<HTMLDivElement | null>(null);
	let containerRef = $state<HTMLDivElement | null>(null);

	// Fixed positioning state for dropdown (avoids clipping by overflow containers)
	let dropdownStyle = $state('');

	// Derived state
	let selectedLabel = $derived.by(() => {
		if (!value) return placeholder;
		const valueKey = getItemKey(value);
		const item = items.find((item) => getItemKey(item) === valueKey);
		return item ? getItemLabel(item) : placeholder;
	});

	// Get selected index
	let selectedIndex = $derived.by(() => {
		if (!value) return -1;
		const valueKey = getItemKey(value);
		return items.findIndex((item) => getItemKey(item) === valueKey);
	});

	// Focus management
	function focusItem(index: number) {
		if (index < 0 || index >= items.length) return;
		focusedIndex = index;

		// Scroll focused item into view
		const itemElement = dropdownRef?.querySelector(`[data-index="${index}"]`) as HTMLElement;
		if (itemElement) {
			itemElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}

	// Compute fixed position for dropdown based on trigger's viewport rect
	function updateDropdownPosition() {
		if (!triggerRef) return;
		const rect = triggerRef.getBoundingClientRect();
		dropdownStyle = `position: fixed; top: ${rect.bottom + 4}px; left: ${rect.left}px; width: ${rect.width}px; max-height: ${maxHeight};`;
	}

	// Open/close handlers
	function handleTriggerClick() {
		if (disabled) return;
		open = !open;

		if (open) {
			// Focus selected item or first item
			focusedIndex = selectedIndex >= 0 ? selectedIndex : 0;
			updateDropdownPosition();
		}
	}

	function handleItemClick(item: T) {
		if (clearable && value && getItemKey(item) === getItemKey(value)) {
			value = undefined as T;
			onValueChange(undefined as T);
		} else {
			value = item;
			onValueChange(item);
		}

		if (closeOnSelect) {
			open = false;
			triggerRef?.focus();
		}
	}

	// Keyboard navigation
	function handleTriggerKeyDown(e: KeyboardEvent) {
		if (disabled) return;

		switch (e.key) {
			case 'Enter':
			case ' ':
			case 'ArrowDown':
			case 'ArrowUp':
				e.preventDefault();
				open = true;
				focusedIndex = selectedIndex >= 0 ? selectedIndex : 0;
				updateDropdownPosition();
				break;
			case 'Escape':
				e.preventDefault();
				open = false;
				break;
		}
	}

	function handleDropdownKeyDown(e: KeyboardEvent) {
		if (!open) return;

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				focusItem(Math.min(focusedIndex + 1, items.length - 1));
				break;
			case 'ArrowUp':
				e.preventDefault();
				focusItem(Math.max(focusedIndex - 1, 0));
				break;
			case 'Home':
				e.preventDefault();
				focusItem(0);
				break;
			case 'End':
				e.preventDefault();
				focusItem(items.length - 1);
				break;
			case 'Enter':
			case ' ':
				e.preventDefault();
				if (focusedIndex >= 0 && focusedIndex < items.length) {
					handleItemClick(items[focusedIndex]);
				}
				break;
			case 'Escape':
				e.preventDefault();
				open = false;
				triggerRef?.focus();
				break;
			case 'Tab':
				open = false;
				break;
			default:
				// Type-ahead search
				if (searchable && e.key.length === 1) {
					e.preventDefault();
					handleTypeAhead(e.key);
				}
				break;
		}
	}

	// Type-ahead search
	function handleTypeAhead(key: string) {
		searchBuffer += key.toLowerCase();

		// Find matching item
		const matchIndex = items.findIndex((item) =>
			getItemLabel(item).toLowerCase().startsWith(searchBuffer)
		);

		if (matchIndex >= 0) {
			focusItem(matchIndex);
		}

		// Clear search buffer after 1 second
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			searchBuffer = '';
		}, 1000);
	}

	// Click outside to close (check both trigger container and portaled dropdown)
	function handleClickOutside(e: MouseEvent) {
		if (!open) return;
		const target = e.target as Node | null;
		if (
			target &&
			containerRef && !containerRef.contains(target) &&
			(!dropdownRef || !dropdownRef.contains(target))
		) {
			open = false;
		}
	}

	// Close on Escape even when focus is outside trigger/dropdown
	function handleDocumentKeyDown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			open = false;
			triggerRef?.focus();
		}
	}

	// Close dropdown on scroll in ancestor containers (since we use fixed positioning)
	function handleScroll() {
		if (open) {
			open = false;
		}
	}

	// Cleanup
	$effect(() => {
		if (open) {
			document.addEventListener('click', handleClickOutside);
			document.addEventListener('keydown', handleDocumentKeyDown);
			// Close on any scroll since fixed dropdown won't follow
			document.addEventListener('scroll', handleScroll, true);
			return () => {
				document.removeEventListener('click', handleClickOutside);
				document.removeEventListener('keydown', handleDocumentKeyDown);
				document.removeEventListener('scroll', handleScroll, true);
			};
		}
	});

	// Expose focus
	export function focus() {
		triggerRef?.focus();
	}

	// Expose open
	export function openDropdown() {
		if (!disabled) {
			open = true;
			focusedIndex = selectedIndex >= 0 ? selectedIndex : 0;
			updateDropdownPosition();
			triggerRef?.focus();
		}
	}

	// Reset focused index when items change
	$effect(() => {
		if (items && focusedIndex >= items.length) {
			focusedIndex = items.length - 1;
		}
	});

	onMount(() => {
		if (autoFocus && !disabled) {
			triggerRef?.focus();
			openDropdown();
		}
	});
</script>

<div bind:this={containerRef} class="qm-select {className ?? ''}">
	<button
		bind:this={triggerRef}
		type="button"
		role="combobox"
		aria-expanded={open}
		aria-haspopup="listbox"
		aria-controls="listbox-{id}"
		aria-label={label}
		{id}
		{disabled}
		onclick={handleTriggerClick}
		onkeydown={handleTriggerKeyDown}
		class="qm-select-trigger"
	>
		<span class="qm-select-label">{selectedLabel}</span>
		<ChevronDown class={`qm-select-chevron ${open ? 'qm-select-chevron-open' : ''}`} size={14} />
	</button>

	{#if open}
		<Portal>
			<div
				bind:this={dropdownRef}
				id="listbox-{id}"
				role="listbox"
				aria-label={label}
				tabindex="-1"
				onkeydown={handleDropdownKeyDown}
				class="qm-select-dropdown"
				style={dropdownStyle}
			>
				<div class="qm-select-list">
					{#each items as item, index (getItemKey(item))}
						{@const itemKey = getItemKey(item)}
						{@const valueKey = value ? getItemKey(value) : null}
						{@const isSelected = itemKey === valueKey}
						{@const isFocused = index === focusedIndex}
						<button
							type="button"
							role="option"
							aria-selected={isSelected}
							data-index={index}
							onclick={() => handleItemClick(item)}
							class="qm-select-item"
							class:qm-select-item-focused={isFocused && !isSelected}
							class:qm-select-item-selected={isSelected}
						>
							<span class="qm-select-item-row">
								{#if isSelected}
									<Check size={14} />
								{:else}
									<span class="qm-select-icon-spacer"></span>
								{/if}
								{#if itemContent}
									{@render itemContent(item, isSelected)}
								{:else}
									<span>{getItemLabel(item)}</span>
								{/if}
							</span>
						</button>
					{/each}
				</div>
			</div>
		</Portal>
	{/if}
</div>

<style>
	.qm-select {
		position: relative;
	}
	.qm-select-trigger {
		display: flex;
		width: 100%;
		height: 2.25rem;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.625rem;
		font-size: 0.875rem;
		color: var(--qm-foreground);
		background: var(--qm-surface);
		border: 1px solid var(--qm-border);
		border-radius: var(--qm-radius-sm);
		cursor: pointer;
		font-family: inherit;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease;
	}
	.qm-select-trigger:hover {
		background: var(--qm-accent);
		color: var(--qm-accent-foreground);
	}
	.qm-select-trigger:focus-visible {
		outline: 2px solid var(--qm-ring);
		outline-offset: 2px;
	}
	.qm-select-trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.qm-select-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.qm-select-chevron) {
		flex-shrink: 0;
		opacity: 0.6;
		margin-left: 0.5rem;
		transition: transform 0.18s ease;
	}
	:global(.qm-select-chevron-open) {
		transform: rotate(180deg);
	}

	:global(.qm-select-dropdown) {
		overflow-y: auto;
		background: var(--qm-surface-elevated);
		border: 1px solid var(--qm-border);
		border-radius: var(--qm-radius);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
		z-index: var(--qm-z-popover);
	}
	:global(.qm-select-list) {
		padding: 0.25rem 0;
	}
	:global(.qm-select-item) {
		display: flex;
		width: 100%;
		min-height: 2.25rem;
		align-items: center;
		padding: 0.375rem 0.625rem;
		text-align: left;
		font-size: 0.875rem;
		color: var(--qm-foreground);
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: background-color 0.12s ease;
	}
	:global(.qm-select-item:hover) {
		background: var(--qm-accent);
		color: var(--qm-accent-foreground);
	}
	:global(.qm-select-item-focused) {
		background: var(--qm-accent);
		color: var(--qm-accent-foreground);
	}
	:global(.qm-select-item-selected) {
		background: var(--qm-primary);
		color: var(--qm-primary-foreground);
		font-weight: 600;
	}
	:global(.qm-select-item-row) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	:global(.qm-select-icon-spacer) {
		display: inline-block;
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}
</style>
