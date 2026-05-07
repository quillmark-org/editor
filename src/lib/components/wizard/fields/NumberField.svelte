<script lang="ts">
	import FieldHeader from './FieldHeader.svelte';
	import { cn } from '$lib/utils/cn';
	import { generateUniqueId } from '$lib/utils/unique-id';
	import { untrack } from 'svelte';

	interface Props {
		value: number | null;
		label: string;
		description?: string;
		required?: boolean;
		placeholder?: string;
		error?: string;
		onDirty?: () => void;
	}

	let {
		value = $bindable(),
		label,
		description,
		required = false,
		placeholder,
		error,
		onDirty
	}: Props = $props();

	const inputId = generateUniqueId('field');

	// Use local string state to handle intermediate inputs (e.g. "1.", "-", "")
	let inputValue = $state(value?.toString() ?? '');

	// Sync value -> inputValue (External changes)
	$effect(() => {
		const currentValue = value;
		
		untrack(() => {
			if (currentValue === null && inputValue === '') return;
			
			const parsedCurrent = parseFloat(inputValue);
			if (!isNaN(parsedCurrent) && parsedCurrent === currentValue) return;

			inputValue = currentValue?.toString() ?? '';
		});
	});

	// Sync inputValue -> value (User input)
	$effect(() => {
		if (inputValue === '') {
			if (value !== null) {
				value = null;
				onDirty?.();
			}
			return;
		}

		const parsed = parseFloat(inputValue);
		if (!isNaN(parsed) && parsed !== value) {
			value = parsed;
			onDirty?.();
		}
	});

	function handleLabelClick() {
		document.getElementById(inputId)?.focus();
	}
</script>

<div class="field-layout-grid">
	<FieldHeader 
		{label} 
		{required} 
		{description} 
		error={!!error} 
		onLabelClick={handleLabelClick}
	/>
	<input
		id={inputId}
		type="number"
		bind:value={inputValue}
		{placeholder}
		class={cn(
			'field-input flex w-full rounded-md border border-input bg-muted-background px-3 py-2 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
			error && 'border-destructive'
		)}
	/>
	{#if error}
		<p class="field-error">{error}</p>
	{/if}
</div>
