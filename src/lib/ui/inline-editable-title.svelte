<script lang="ts">
	import { tick } from 'svelte';

	const DEFAULT_VALUE = 'Untitled';
	const DEFAULT_MAX_LENGTH = 200;

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
		defaultValue = DEFAULT_VALUE,
		maxLength = DEFAULT_MAX_LENGTH,
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
-->
<span class="qm-inline-title {className}">
	<span class="qm-inline-title-sizer {textClass}">{localValue || ' '}</span>
	{#if isEditing}
		<input
			bind:this={inputEl}
			class="qm-inline-title-input {inputClass}"
			size="1"
			value={localValue}
			oninput={(e) => (localValue = (e.target as HTMLInputElement).value)}
			onblur={commitEditing}
			onkeydown={handleKeydown}
			maxlength={maxLength}
			aria-label={ariaLabel}
		/>
		<span class="qm-sr-only">Press Enter to save, Escape to cancel</span>
	{:else}
		<span class="qm-inline-title-text {textClass}">{value}</span>
	{/if}
</span>

<style>
	.qm-inline-title {
		display: inline-grid;
		align-items: center;
	}
	.qm-inline-title-sizer {
		visibility: hidden;
		grid-column-start: 1;
		grid-row-start: 1;
		max-width: 100%;
		overflow: hidden;
		white-space: pre;
	}
	.qm-inline-title-input {
		grid-column-start: 1;
		grid-row-start: 1;
		width: 100%;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		color: inherit;
		font: inherit;
		padding: 0;
	}
	.qm-inline-title-text {
		grid-column-start: 1;
		grid-row-start: 1;
	}
	.qm-sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
