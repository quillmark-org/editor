<script lang="ts">
	const MAX_ROWS = 8;
	const MAX_COLS = 8;

	interface Props {
		onSelect: (rows: number, cols: number) => void;
	}

	let { onSelect }: Props = $props();

	let hoverRow = $state(0);
	let hoverCol = $state(0);
</script>

<div
	class="table-picker"
	role="grid"
	aria-label="Select table dimensions"
	tabindex="0"
	onmouseleave={() => {
		hoverRow = 0;
		hoverCol = 0;
	}}
>
	{#each Array.from({ length: MAX_ROWS }, (_, r) => r + 1) as row (row)}
		<div class="picker-row" role="row">
			{#each Array.from({ length: MAX_COLS }, (_, c) => c + 1) as col (col)}
				<button
					type="button"
					class="picker-cell"
					class:active={row <= hoverRow && col <= hoverCol}
					role="gridcell"
					aria-label="{row} × {col} table"
					onmouseenter={() => {
						hoverRow = row;
						hoverCol = col;
					}}
					onclick={() => onSelect(row, col)}
				></button>
			{/each}
		</div>
	{/each}

	<p class="picker-label">
		{hoverRow > 0 && hoverCol > 0 ? `${hoverRow} × ${hoverCol}` : 'Hover to select'}
	</p>
</div>

<style>
	.table-picker {
		padding: 8px;
		user-select: none;
	}

	.picker-row {
		display: flex;
		gap: 3px;
		margin-bottom: 3px;
	}

	.picker-cell {
		width: 18px;
		height: 18px;
		border: 1px solid var(--qm-border, #d1d5db);
		border-radius: 2px;
		background: var(--qm-background, #fff);
		cursor: pointer;
		padding: 0;
		flex-shrink: 0;
		transition:
			background-color 60ms ease,
			border-color 60ms ease;
	}

	.picker-cell:hover,
	.picker-cell.active {
		background: var(--qm-accent, #e5e7eb);
		border-color: var(--qm-ring, #3b82f6);
	}

	.picker-label {
		margin: 6px 0 0;
		font-size: 0.72rem;
		text-align: center;
		color: var(--qm-muted-foreground, #6b7280);
		min-height: 1.1em;
	}
</style>
