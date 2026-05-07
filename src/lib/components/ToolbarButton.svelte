<script lang="ts">
	import Button from '$lib/ui/button.svelte';
	import type { ComponentType } from 'svelte';

	interface Props {
		onclick: () => void;
		title: string;
		icon: ComponentType;
		isActive?: boolean;
		disabled?: boolean;
		class?: string; // Additional classes
	}

	let {
		onclick,
		title,
		icon: Icon,
		isActive = false,
		disabled = false,
		class: className = ''
	}: Props = $props();
</script>

<Button
	variant="ghost"
	size="sm"
	class="h-7 w-7 p-0 text-muted-foreground hover:bg-accent hover:text-foreground {isActive
		? 'bg-accent text-accent-foreground'
		: ''} {className}"
	{onclick}
	{title}
	{disabled}
>
	<Icon class="h-4 w-4" />
</Button>
