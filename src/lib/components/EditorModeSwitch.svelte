<script lang="ts">
	import { ToggleLeft, ToggleRight } from 'lucide-svelte';
	import type { EditorMode } from '$lib/editor/prosemirror';

	interface Props {
		mode: EditorMode;
		onChange?: (mode: EditorMode) => void;
		/** Backwards-compatible alias for `onChange`. */
		onModeChange?: (mode: EditorMode) => void;
	}

	let { mode, onChange, onModeChange }: Props = $props();

	function toggle() {
		const next: EditorMode = mode === 'rich' ? 'advanced' : 'rich';
		onChange?.(next);
		onModeChange?.(next);
	}
</script>

<button
	type="button"
	class="qm-mode-switch"
	onclick={toggle}
	title={mode === 'rich' ? 'Switch to Advanced Mode' : 'Switch to Rich Text Mode'}
>
	{#if mode === 'rich'}
		<ToggleLeft size={14} />
		<span>Rich Text</span>
	{:else}
		<ToggleRight size={14} />
		<span>Advanced</span>
	{/if}
</button>

<style>
	.qm-mode-switch {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		color: var(--qm-muted-foreground);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--qm-radius-sm);
		cursor: pointer;
		font-family: inherit;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}
	.qm-mode-switch:hover {
		background: var(--qm-accent);
		color: var(--qm-foreground);
	}
</style>
