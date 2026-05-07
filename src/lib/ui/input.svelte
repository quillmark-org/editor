<script lang="ts">
	type InputProps = {
		id?: string;
		type?: string;
		placeholder?: string;
		value?: string;
		disabled?: boolean;
		class?: string;
		onkeydown?: (e: KeyboardEvent) => void;
		oninput?: (e: Event) => void;
		onblur?: (e: FocusEvent) => void;
		onclick?: (e: MouseEvent) => void;
		readonly?: boolean;
		tabindex?: number;
		ref?: HTMLInputElement | null;
	};

	let {
		id,
		type = 'text',
		placeholder,
		value = $bindable(),
		disabled = false,
		class: className = '',
		onkeydown,
		oninput,
		ref = $bindable(null),
		...restProps
	}: InputProps = $props();
</script>

<input
	{id}
	{type}
	{placeholder}
	bind:value
	bind:this={ref}
	{disabled}
	{onkeydown}
	{oninput}
	class="qm-input {className}"
	{...restProps}
/>

<style>
	.qm-input {
		display: block;
		width: 100%;
		height: 2.25rem;
		padding: 0 0.625rem;
		font-size: 0.875rem;
		line-height: 1.4;
		color: var(--qm-foreground);
		background: var(--qm-surface);
		border: 1px solid var(--qm-input);
		border-radius: var(--qm-radius-sm);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
		font-family: inherit;
	}
	.qm-input::placeholder {
		color: var(--qm-muted-foreground);
	}
	.qm-input:focus {
		outline: none;
		border-color: var(--qm-ring);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--qm-ring) 25%, transparent);
	}
	.qm-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
