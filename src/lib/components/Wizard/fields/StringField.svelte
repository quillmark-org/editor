<script lang="ts">
	import Input from '$lib/components/ui/input.svelte';
	import FieldHeader from './FieldHeader.svelte';
	import { generateUniqueId } from '$lib/utils/unique-id';

	interface Props {
		value: string;
		label: string;
		description?: string;
		required?: boolean;
		placeholder?: string;
		error?: string;
		onDirty?: () => void;
		multiline?: boolean;
	}

	let {
		value = $bindable(),
		label,
		description,
		required = false,
		placeholder,
		error,
		onDirty,
		multiline = false
	}: Props = $props();

	const inputId = generateUniqueId('field');
	let textareaEl: HTMLTextAreaElement | null = $state(null);
	const multilineTextareaClass =
		'w-full resize-none overflow-hidden rounded-sm border border-input bg-muted-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px] focus-visible:outline-none';

	function handleLabelClick() {
		document.getElementById(inputId)?.focus();
	}

	function adjustTextareaHeight() {
		if (!multiline || !textareaEl) return;
		// Reset first so scrollHeight is recalculated from natural content height.
		textareaEl.style.height = 'auto';
		textareaEl.style.height = `${textareaEl.scrollHeight}px`;
	}

	function handleTextareaInput() {
		adjustTextareaHeight();
		onDirty?.();
	}

	$effect(() => {
		if (multiline && typeof value === 'string') {
			adjustTextareaHeight();
		}
	});
</script>

<div class="field-layout-grid">
	<FieldHeader 
		{label} 
		{required} 
		{description} 
		error={!!error} 
		onLabelClick={handleLabelClick}
	/>
	{#if multiline}
		<textarea
			id={inputId}
			bind:value
			bind:this={textareaEl}
			{placeholder}
			rows="3"
			class={multilineTextareaClass}
			oninput={handleTextareaInput}
		></textarea>
	{:else}
		<Input
			id={inputId}
			bind:value
			{placeholder}
			oninput={() => onDirty?.()}
			class="field-input"
		/>
	{/if}
	{#if error}
		<p class="field-error">{error}</p>
	{/if}
</div>
