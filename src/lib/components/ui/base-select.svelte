<script lang="ts" generics="T">
	import { cn } from '$lib/utils/cn';
	import { generateUniqueId } from '$lib/utils/unique-id';
	import { Check, ChevronDown } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import Portal from '$lib/components/ui/portal.svelte';

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

<div bind:this={containerRef} class={cn('relative', className)}>
	<!-- Trigger Button -->
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
		class={cn(
			'flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors',
			'disabled:cursor-not-allowed disabled:opacity-50',
			'hover:bg-accent hover:text-accent-foreground'
		)}
	>
		<span class="truncate">{selectedLabel}</span>
		<ChevronDown
			class={cn('ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform', open && 'rotate-180')}
		/>
	</button>

	<!-- Dropdown (portaled to body to escape overflow clipping) -->
	{#if open}
		<Portal>
			<div
				bind:this={dropdownRef}
				id="listbox-{id}"
				role="listbox"
				aria-label={label}
				tabindex="-1"
				onkeydown={handleDropdownKeyDown}
				class="z-dropdown overflow-y-auto rounded-md border border-border bg-surface-elevated shadow-md"
				style={dropdownStyle}
			>
				<div class="py-1">
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
							class={cn(
								'flex h-10 w-full items-center justify-between px-3 text-left text-sm transition-colors',
								isFocused && 'bg-accent text-accent-foreground',
								isSelected && 'bg-primary font-semibold text-primary-foreground',
								!isSelected &&
									!isFocused &&
									'text-foreground hover:bg-accent hover:text-accent-foreground'
							)}
						>
							<div class="flex items-center gap-2">
								{#if isSelected}
									<Check class="h-4 w-4 shrink-0" />
								{:else}
									<span class="h-4 w-4 shrink-0"></span>
								{/if}
								{#if itemContent}
									{@render itemContent(item, isSelected)}
								{:else}
									<span>{getItemLabel(item)}</span>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			</div>
		</Portal>
	{/if}
</div>
