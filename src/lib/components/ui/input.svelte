<script lang="ts">
	import { cn } from '$lib/utils/cn';

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
		/** Bind to the underlying input element */
		ref?: HTMLInputElement | null;
	};

	let {
		id,
		type = 'text',
		placeholder,
		value = $bindable(),
		disabled = false,
		class: className,
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
	class={cn(
		'flex h-10 w-full rounded-sm border border-input bg-muted-background px-3 py-2 text-base text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
/>
