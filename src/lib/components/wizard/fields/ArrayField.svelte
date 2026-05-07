<script lang="ts">
	import Input from '$lib/ui/input.svelte';
	import FieldHeader from './FieldHeader.svelte';
	import { Minus, Plus } from 'lucide-svelte';
	import { tick } from 'svelte';

	interface Props {
		value: string[];
		label: string;
		description?: string;
		required?: boolean;
		error?: string;
		itemPlaceholder?: string;
		onDirty?: () => void;
	}

	let {
		value = $bindable(),
		label,
		description,
		required = false,
		error,
		itemPlaceholder,
		onDirty
	}: Props = $props();

	// Track input element references for focus management
	let inputRefs: (HTMLInputElement | null)[] = $state(
		value ? new Array(value.length).fill(null) : []
	);

	// Sync inputRefs and coerce types
	$effect.pre(() => {
		if (typeof value === 'string') {
			value = [value];
		} else if (!Array.isArray(value) && value) {
			value = [value];
		}

		if (Array.isArray(value)) {
			while (inputRefs.length < value.length) inputRefs.push(null);
			while (inputRefs.length > value.length) inputRefs.pop();
		}
	});

	function addItem() {
		if (!value) value = [];
		value = [...value, ''];
		onDirty?.();
	}

	async function addItemAndFocus(e?: Event) {
		e?.preventDefault();
		addItem();
		await tick();
		
		const lastInput = inputRefs[value.length - 1];
		lastInput?.focus();
	}

	function handleLabelClick() {
		if (!value || value.length === 0) {
			addItemAndFocus();
		} else {
			inputRefs[0]?.focus();
		}
	}

	function removeItem(index: number) {
		if (value && Array.isArray(value)) {
			value = value.filter((_, i) => i !== index);
			onDirty?.();
		}
	}

	function handleItemKeyDown(event: KeyboardEvent, index: number) {
		if (event.key === 'Enter') {
			event.preventDefault();
			addItemAndFocus();
		} else if (event.key === 'Backspace' && value[index] === '') {
			event.preventDefault();
			if (value.length > 1) {
				removeItem(index);
				tick().then(() => {
					const prevIndex = Math.max(0, index - 1);
					inputRefs[prevIndex]?.focus();
				});
			}
		}
	}
</script>

<div class="field-layout-grid">
	<FieldHeader
		{label}
		{required}
		{description}
		error={!!error}
		onLabelClick={handleLabelClick}
	>
		<button
			type="button"
			id={`add-item-${label}`}
			class="flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
			onclick={addItemAndFocus}
			title="Add item"
		>
			Add Item <Plus class="h-3 w-3" />
		</button>
	</FieldHeader>

	{#if value}
		{#each value as _, i (i)}
			{#if i < inputRefs.length}
				<div class="group relative mb-1 last:mb-0">
					<Input
						bind:value={value[i]}
						bind:ref={inputRefs[i]}
						placeholder={itemPlaceholder}
						class="field-input pr-8 transition-colors"
						oninput={() => onDirty?.()}
						onkeydown={(e) => handleItemKeyDown(e, i)}
					/>
					<button
						class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
						onclick={() => removeItem(i)}
						title="Remove item"
						tabindex="0"
					>
						<Minus class="h-3.5 w-3.5" />
					</button>
				</div>
			{/if}
		{/each}
	{/if}
	
	{#if error}
		<p class="field-error">{error}</p>
	{/if}
</div>
