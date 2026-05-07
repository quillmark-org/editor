<script lang="ts">
	import Switch from '$lib/ui/switch.svelte';
	import FieldHeader from './FieldHeader.svelte';
	import { generateUniqueId } from '$lib/utils/unique-id';

	interface Props {
		value: boolean;
		label: string;
		description?: string;
		required?: boolean;
		error?: string;
		onDirty?: () => void;
	}

	let {
		value = $bindable(),
		label,
		description,
		required = false,
		error,
		onDirty
	}: Props = $props();

	const inputId = generateUniqueId('field');

	function handleLabelClick() {
		value = !value;
		onDirty?.();
	}
</script>

<div class="field-layout-horizontal">
	<div class="space-y-0.5">
		<FieldHeader
			{label}
			{required}
			{description}
			error={!!error}
			onLabelClick={handleLabelClick}
		/>
		{#if error}
			<p class="field-error">{error}</p>
		{/if}
	</div>
	<Switch id={inputId} bind:checked={value} onCheckedChange={() => onDirty?.()} />
</div>
