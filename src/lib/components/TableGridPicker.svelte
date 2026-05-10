<script lang="ts">
	import { Table } from 'lucide-svelte';
	import ToolbarButton from './ToolbarButton.svelte';

	interface Props {
		onInsert: (rows: number, cols: number) => void;
	}

	let { onInsert }: Props = $props();

	const GRID_ROWS = 6;
	const GRID_COLS = 6;

	let open = $state(false);
	let hoverRow = $state(0);
	let hoverCol = $state(0);

	const label = $derived(
		hoverRow > 0 && hoverCol > 0 ? `${hoverRow} × ${hoverCol} table` : 'Hover to select size'
	);

	function insert(rows: number, cols: number) {
		onInsert(rows, cols);
		open = false;
		hoverRow = 0;
		hoverCol = 0;
	}

	function close() {
		open = false;
		hoverRow = 0;
		hoverCol = 0;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="tgp-wrap"
	onkeydown={(e) => e.key === 'Escape' && close()}
>
	<ToolbarButton
		onclick={() => (open = !open)}
		title="Insert Table"
		icon={Table}
		isActive={open}
	/>

	{#if open}
		<button
			type="button"
			class="tgp-backdrop"
			onclick={close}
			aria-hidden="true"
			tabindex="-1"
		></button>

		<div class="tgp-popover" role="dialog" aria-label="Choose table size">
			<div
				class="tgp-grid"
				style="grid-template-columns: repeat({GRID_COLS}, 1fr);"
				onmouseleave={() => { hoverRow = 0; hoverCol = 0; }}
			>
				{#each { length: GRID_ROWS } as _, r}
					{#each { length: GRID_COLS } as _, c}
						{@const row = r + 1}
						{@const col = c + 1}
						<button
							type="button"
							class="tgp-cell"
							class:tgp-cell--lit={row <= hoverRow && col <= hoverCol}
							onmouseenter={() => { hoverRow = row; hoverCol = col; }}
							onclick={() => insert(row, col)}
							aria-label="{row}×{col} table"
						></button>
					{/each}
				{/each}
			</div>
			<p class="tgp-label">{label}</p>
		</div>
	{/if}
</div>

<style>
	.tgp-wrap {
		position: relative;
	}

	.tgp-backdrop {
		position: fixed;
		inset: 0;
		z-index: 49;
		background: transparent;
		border: none;
		padding: 0;
		cursor: default;
	}

	.tgp-popover {
		position: absolute;
		top: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
		padding: 10px;
		background: var(--qm-background);
		border: 1px solid var(--qm-border);
		border-radius: 8px;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
		display: flex;
		flex-direction: column;
		gap: 8px;
		animation: tgp-in 120ms ease-out;
	}

	@keyframes tgp-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-4px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0) scale(1);
		}
	}

	.tgp-grid {
		display: grid;
		gap: 3px;
	}

	.tgp-cell {
		width: 20px;
		height: 20px;
		border: 1px solid var(--qm-border);
		border-radius: 2px;
		background: transparent;
		cursor: pointer;
		padding: 0;
		transition:
			background-color 60ms ease,
			border-color 60ms ease;
	}

	.tgp-cell--lit {
		background: color-mix(in srgb, var(--qm-brand) 18%, transparent);
		border-color: var(--qm-brand);
	}

	.tgp-label {
		margin: 0;
		font-size: 11px;
		line-height: 1;
		text-align: center;
		color: var(--qm-muted-foreground);
		font-weight: 500;
	}
</style>
