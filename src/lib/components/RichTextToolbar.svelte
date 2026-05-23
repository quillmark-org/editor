<script lang="ts">
	import {
		Bold,
		Italic,
		Underline,
		Strikethrough,
		Code,
		Link,
		List,
		ListOrdered,
		Table2
	} from 'lucide-svelte';
	import ToolbarButton from './ToolbarButton.svelte';
	import ToolbarSeparator from './ToolbarSeparator.svelte';
	import ToolbarContainer from './ToolbarContainer.svelte';
	import TablePicker from './TablePicker.svelte';
	import { clickOutside } from '$lib/utils/use-click-outside';

	interface Props {
		onFormat: (type: string) => void;
		onInsertTable?: (rows: number, cols: number) => void;
	}

	let { onFormat, onInsertTable }: Props = $props();

	let showTablePicker = $state(false);
	let tableButtonEl: HTMLDivElement | undefined = $state();

	function toggleTablePicker() {
		showTablePicker = !showTablePicker;
	}

	function handleTableSelect(rows: number, cols: number) {
		showTablePicker = false;
		if (onInsertTable) {
			onInsertTable(rows, cols);
		} else {
			// Fallback: use the format string API with the default 3×3
			onFormat('insertTable');
		}
	}
</script>

<ToolbarContainer>
	<div class="flex items-center gap-1">
		<!-- Formatting Group -->
		<ToolbarButton
			onclick={() => onFormat('bold')}
			title="Bold"
			icon={Bold}
		/>

		<ToolbarButton
			onclick={() => onFormat('italic')}
			title="Italic"
			icon={Italic}
		/>

		<ToolbarButton
			onclick={() => onFormat('underline')}
			title="Underline"
			icon={Underline}
		/>

		<ToolbarSeparator />

		<ToolbarButton
			onclick={() => onFormat('strikethrough')}
			title="Strikethrough"
			icon={Strikethrough}
		/>

		<ToolbarButton
			onclick={() => onFormat('code')}
			title="Inline Code"
			icon={Code}
		/>

		<ToolbarButton
			onclick={() => onFormat('link')}
			title="Hyperlink"
			icon={Link}
		/>

		<ToolbarSeparator />

		<!-- List Group -->
		<ToolbarButton
			onclick={() => onFormat('bulletList')}
			title="Bullet List"
			icon={List}
		/>
		<ToolbarButton
			onclick={() => onFormat('numberedList')}
			title="Numbered List"
			icon={ListOrdered}
		/>

		<ToolbarSeparator />

		<!-- Table insertion with grid picker -->
		<div class="table-btn-wrap" bind:this={tableButtonEl}>
			<ToolbarButton
				onclick={toggleTablePicker}
				title="Insert Table (AFH 33-337)"
				icon={Table2}
				isActive={showTablePicker}
			/>
			{#if showTablePicker}
				<div
					class="table-picker-popover"
					use:clickOutside={() => { showTablePicker = false; }}
				>
					<TablePicker onSelect={handleTableSelect} />
				</div>
			{/if}
		</div>
	</div>
</ToolbarContainer>

<style>
	.table-btn-wrap {
		position: relative;
	}

	.table-picker-popover {
		position: absolute;
		top: calc(100% + 4px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 200;
		background: var(--qm-surface-elevated, var(--qm-background));
		border: 1px solid var(--qm-border);
		border-radius: var(--radius-md, 6px);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
		min-width: max-content;
	}
</style>
