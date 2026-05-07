<script lang="ts">
	import BodyEditor from '$lib/components/Editor/BodyEditor.svelte';
	import FieldHeader from './FieldHeader.svelte';

	interface Props {
		/** May be undefined until the parent object assigns a value */
		value: string | undefined;
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

	let editorRef: BodyEditor | undefined = $state();

	function handleLabelClick() {
		editorRef?.focus();
	}

	function handleChange(nextValue: string) {
		value = nextValue;
		onDirty?.();
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
	<div
		class="markdown-field-editor rounded-md border border-input bg-muted-background"
		style={`--md-field-min-height: ${multiline ? '5.5rem' : '2.5rem'};`}
	>
		<BodyEditor
			bind:this={editorRef}
			content={value || ''}
			placeholder={placeholder || 'Enter content...'}
			onChange={handleChange}
		/>
	</div>
	{#if error}
		<p class="field-error">{error}</p>
	{/if}
</div>

<style>
	.markdown-field-editor {
		min-height: var(--md-field-min-height);
	}

	.markdown-field-editor :global(.ProseMirror) {
		min-height: var(--md-field-min-height);
	}
</style>
