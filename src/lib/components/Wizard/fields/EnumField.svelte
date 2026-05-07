<script lang="ts">
	import BaseSelect from '$lib/components/ui/base-select.svelte';
	import FieldHeader from './FieldHeader.svelte';
	import { generateUniqueId } from '$lib/utils/unique-id';

	interface Props {
		value: string;
		label: string;
		description?: string;
		required?: boolean;
		items: string[];
		placeholder?: string;
		error?: string;
		onDirty?: () => void;
	}

	let {
		value = $bindable(),
		label,
		description,
		required = false,
		items = [],
		placeholder = 'Select...',
		error,
		onDirty
	}: Props = $props();

	const inputId = generateUniqueId('field');

	function handleSelect(newValue: string) {
		value = newValue;
		onDirty?.();
	}

	function handleLabelClick() {
		document.getElementById(inputId)?.click();
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
	<BaseSelect
		id={inputId}
		value={value}
		items={items}
		getItemKey={(item) => item}
		getItemLabel={(item) => item}
		{placeholder}
		{label}
		onValueChange={handleSelect}
		clearable={!required}
		class="field-input"
	/>
	{#if error}
		<p class="field-error">{error}</p>
	{/if}
</div>
