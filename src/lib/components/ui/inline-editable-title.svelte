<script lang="ts">
	import { tick } from 'svelte';
	import { DEFAULT_DOCUMENT_NAME } from '$lib/utils/document-naming';
	import { DocumentValidator } from '$lib/services/documents/document-validator';

	type Props = {
		/** The current committed value to display */
		value: string;
		/** Called with the new value when the user commits an edit */
		onCommit: (newValue: string) => void | Promise<void>;
		/** Controls whether the component is in editing mode — bind to this */
		isEditing?: boolean;
		/** Fallback value used when the input is left empty */
		defaultValue?: string;
		/** Maximum character length for the input */
		maxLength?: number;
		/** Additional classes for the outer inline-grid span */
		class?: string;
		/** Classes applied to the hidden sizer span and the visible text span */
		textClass?: string;
		/** Classes applied to the editing input */
		inputClass?: string;
		/** aria-label for the input element */
		ariaLabel?: string;
	};

	let {
		value,
		onCommit,
		isEditing = $bindable(false),
		defaultValue = DEFAULT_DOCUMENT_NAME,
		maxLength = DocumentValidator.MAX_NAME_LENGTH,
		class: className = '',
		textClass = '',
		inputClass = '',
		ariaLabel = 'Edit title'
	}: Props = $props();

let inputEl = $state<HTMLInputElement | null>(null);
let localValue = $state('');
let hasInitializedLocalValue = $state(false);

// Keep local value in sync when not editing
$effect(() => {
	if (!hasInitializedLocalValue || !isEditing) {
		localValue = value;
		hasInitializedLocalValue = true;
	}
});

	// Focus and select the input when editing starts
	$effect(() => {
		if (isEditing) {
			tick().then(() => inputEl?.select());
		}
	});

	async function commitEditing() {
		if (!isEditing) return;
		isEditing = false;
		const newName = (localValue || '').trim() || defaultValue;
		if (newName !== value) {
			await onCommit(newName);
		} else {
			localValue = value;
		}
	}

	function cancelEditing() {
		if (!isEditing) return;
		isEditing = false;
		localValue = value;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			commitEditing();
			document.body.focus();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			cancelEditing();
			document.body.focus();
		}
	}
</script>

<!--
	Inline auto-sizing editable title. The hidden sizer span drives the width
	so the input expands/contracts as the user types.
	The parent controls when editing starts by binding to `isEditing`.
-->
<span class="inline-grid items-center {className}">
	<!-- Hidden sizer — matches text metrics to size the grid column -->
	<span class="invisible col-start-1 row-start-1 max-w-full overflow-hidden whitespace-pre {textClass}"
		>{localValue || ' '}</span
	>
	{#if isEditing}
		<input
			bind:this={inputEl}
			class="col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none {inputClass}"
			size="1"
			value={localValue}
			oninput={(e) => (localValue = (e.target as HTMLInputElement).value)}
			onblur={commitEditing}
			onkeydown={handleKeydown}
			maxlength={maxLength}
			aria-label={ariaLabel}
		/>
		<span class="sr-only">Press Enter to save, Escape to cancel</span>
	{:else}
		<span class="col-start-1 row-start-1 {textClass}">{value}</span>
	{/if}
</span>
