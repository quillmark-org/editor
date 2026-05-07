<script lang="ts">
	import { ToggleLeft, ToggleRight } from 'lucide-svelte';
	import type { EditorMode } from '$lib/editor/prosemirror';

	interface Props {
		mode: EditorMode;
		onModeChange: (mode: EditorMode) => void;
	}

	let { mode, onModeChange }: Props = $props();

	function toggle() {
		onModeChange(mode === 'rich' ? 'advanced' : 'rich');
	}
</script>

<button
	type="button"
	class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted/50"
	onclick={toggle}
	title={mode === 'rich' ? 'Switch to Advanced Mode' : 'Switch to Rich Text Mode'}
>
	{#if mode === 'rich'}
		<ToggleLeft class="h-4 w-4 text-muted-foreground" />
		<span class="text-muted-foreground">Rich Text</span>
	{:else}
		<ToggleRight class="h-4 w-4 text-accent" />
		<span class="text-accent">Advanced</span>
	{/if}
</button>
