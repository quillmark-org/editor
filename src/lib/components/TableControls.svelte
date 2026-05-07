<script lang="ts">
	/**
	 * TableControls - Obsidian-style hover controls for table manipulation.
	 *
	 * Renders invisible hover zones around table edges that reveal:
	 * - Bottom: "+" bar to add a row
	 * - Right: "+" bar to add a column
	 * - Left: GripVertical drag handles per row for selection/reordering
	 * - Top: GripHorizontal drag handles per column for selection/reordering
	 *
	 * Only the closest drag handle to the cursor is shown on hover.
	 * During drag, the handle tab follows the mouse position.
	 *
	 * All controls are positioned absolutely relative to the table's bounding rect.
	 * Rendered via Portal at document.body level to escape overflow containers.
	 */

	import { onMount, onDestroy } from 'svelte';
	import { TextSelection } from 'prosemirror-state';
	import type { EditorView } from 'prosemirror-view';
	import {
		isInTable,
		findTable,
		TableMap,
		CellSelection,
		moveTableRow,
		moveTableColumn
	} from 'prosemirror-tables';
	import { addRowAtEnd, addColumnAtEnd } from '$lib/editor/prosemirror/table-commands';
	import { GripVertical, GripHorizontal } from 'lucide-svelte';
	import Portal from '$lib/ui/portal.svelte';

	interface Props {
		editorView: EditorView;
		tableElement: HTMLElement;
	}

	let { editorView, tableElement }: Props = $props();

	// Reactive positions
	let tableRect = $state({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 });
	let rowRects: DOMRect[] = $state([]);
	let colRects: DOMRect[] = $state([]);

	// Hover states — only closest handle is revealed
	let showBottom = $state(false);
	let showRight = $state(false);
	let hoveredRow = $state(-1);
	let hoveredCol = $state(-1);

	// Drag state
	let draggingRow = $state(-1);
	let draggingCol = $state(-1);
	// Pixel offset of the dragged handle from its original position
	let dragRowY = $state(0);
	let dragColX = $state(0);

	let animFrameId: number | null = null;

	function measureTable() {
		if (!tableElement) return;

		const rect = tableElement.getBoundingClientRect();
		tableRect = {
			top: rect.top + window.scrollY,
			left: rect.left + window.scrollX,
			width: rect.width,
			height: rect.height,
			right: rect.right + window.scrollX,
			bottom: rect.bottom + window.scrollY
		};

		// Measure row rects
		const rows = tableElement.querySelectorAll('tr');
		rowRects = Array.from(rows).map((tr) => tr.getBoundingClientRect());

		// Measure column rects from first row cells
		const firstRow = rows[0];
		if (firstRow) {
			const cells = firstRow.querySelectorAll('th, td');
			colRects = Array.from(cells).map((cell) => cell.getBoundingClientRect());
		}
	}

	function rafMeasure() {
		measureTable();
		animFrameId = requestAnimationFrame(rafMeasure);
	}

	onMount(() => {
		measureTable();
		animFrameId = requestAnimationFrame(rafMeasure);
	});

	onDestroy(() => {
		if (animFrameId !== null) {
			cancelAnimationFrame(animFrameId);
		}
	});

	// ─── Closest-handle hover detection ────────────────────────

	function handleLeftZoneMove(ev: MouseEvent) {
		if (draggingRow >= 0) return; // Don't change during drag
		const y = ev.clientY;
		let closest = -1;
		let minDist = Infinity;
		for (let i = 0; i < rowRects.length; i++) {
			const mid = (rowRects[i].top + rowRects[i].bottom) / 2;
			const dist = Math.abs(y - mid);
			if (dist < minDist) {
				minDist = dist;
				closest = i;
			}
		}
		hoveredRow = closest;
	}

	function handleTopZoneMove(ev: MouseEvent) {
		if (draggingCol >= 0) return; // Don't change during drag
		const x = ev.clientX;
		let closest = -1;
		let minDist = Infinity;
		for (let i = 0; i < colRects.length; i++) {
			const mid = (colRects[i].left + colRects[i].right) / 2;
			const dist = Math.abs(x - mid);
			if (dist < minDist) {
				minDist = dist;
				closest = i;
			}
		}
		hoveredCol = closest;
	}

	// ─── Commands ───────────────────────────────────────────────

	/**
	 * Ensure cursor is inside the table. If not, place it in the last cell.
	 * Required because addRowAfter/addColumnAfter need selection inside a table.
	 */
	function ensureCursorInTable() {
		if (isInTable(editorView.state)) return;

		// Use model-based position finding via the table DOM element
		const result = getTableResult();
		if (!result) return;

		// Place cursor in the last cell using findFrom to get a valid text position
		const endOfTable = result.pos + result.node.nodeSize - 1;
		const resolvedPos = editorView.state.doc.resolve(endOfTable);
		const sel = TextSelection.findFrom(resolvedPos, -1, true);
		if (sel) {
			editorView.dispatch(editorView.state.tr.setSelection(sel));
		}
	}

	function handleAddRow(e: MouseEvent) {
		e.preventDefault();
		ensureCursorInTable();
		addRowAtEnd(editorView.state, editorView.dispatch);
		editorView.focus();
	}

	function handleAddColumn(e: MouseEvent) {
		e.preventDefault();
		ensureCursorInTable();
		addColumnAtEnd(editorView.state, editorView.dispatch);
		editorView.focus();
	}

	/**
	 * Prevent mousedown on control buttons from stealing focus from the editor.
	 * This keeps the cursor visible in the table cell during the interaction.
	 */
	function preventFocusLoss(e: MouseEvent) {
		e.preventDefault();
	}

	function getTableResult() {
		const { state } = editorView;
		// Try from selection first
		try {
			const result = findTable(state.selection.$from);
			if (result) return result;
		} catch {
			// Selection may not be in table
		}
		// Fall back to DOM-based resolution
		const pos = editorView.posAtDOM(tableElement, 0);
		if (pos == null) return null;
		const resolvedPos = state.doc.resolve(pos);
		return findTable(resolvedPos);
	}

	function handleSelectRow(index: number, e: MouseEvent) {
		e.preventDefault();
		const result = getTableResult();
		if (!result) return;
		doSelectRow(result, index);
		editorView.focus();
	}

	function doSelectRow(tableResult: { node: import('prosemirror-model').Node; pos: number }, index: number) {
		const { node: tableNode, pos: tablePos } = tableResult;
		const map = TableMap.get(tableNode);
		if (index < 0 || index >= map.height) return;

		const firstCellPos = tablePos + 1 + map.map[index * map.width];
		const lastCellPos = tablePos + 1 + map.map[index * map.width + map.width - 1];
		const anchorPos = editorView.state.doc.resolve(firstCellPos);
		const headPos = editorView.state.doc.resolve(lastCellPos);

		const selection = CellSelection.rowSelection(anchorPos, headPos);
		editorView.dispatch(editorView.state.tr.setSelection(selection));
	}

	function handleSelectColumn(index: number, e: MouseEvent) {
		e.preventDefault();
		const result = getTableResult();
		if (!result) return;
		doSelectColumn(result, index);
		editorView.focus();
	}

	function doSelectColumn(tableResult: { node: import('prosemirror-model').Node; pos: number }, index: number) {
		const { node: tableNode, pos: tablePos } = tableResult;
		const map = TableMap.get(tableNode);
		if (index < 0 || index >= map.width) return;

		const firstCellPos = tablePos + 1 + map.map[index];
		const lastCellPos = tablePos + 1 + map.map[(map.height - 1) * map.width + index];
		const anchorPos = editorView.state.doc.resolve(firstCellPos);
		const headPos = editorView.state.doc.resolve(lastCellPos);

		const selection = CellSelection.colSelection(anchorPos, headPos);
		editorView.dispatch(editorView.state.tr.setSelection(selection));
	}

	// ─── Drag helpers ──────────────────────────────────────────

	function handleRowDragStart(index: number, e: MouseEvent) {
		e.preventDefault();
		draggingRow = index;
		const handleOriginY = rowRects[index]
			? (rowRects[index].top + rowRects[index].bottom) / 2
			: e.clientY;
		dragRowY = 0;
		handleSelectRow(index, e);

		function onMouseMove(ev: MouseEvent) {
			// Move the handle tab to follow the mouse
			dragRowY = ev.clientY - handleOriginY;
			// Find which row the mouse is over for drop target
			const y = ev.clientY;
			for (let i = 0; i < rowRects.length; i++) {
				const r = rowRects[i];
				if (y >= r.top && y <= r.bottom) {
					hoveredRow = i;
					break;
				}
			}
		}

		function onMouseUp() {
			if (draggingRow >= 0 && hoveredRow >= 0 && draggingRow !== hoveredRow) {
				moveTableRow({ from: draggingRow, to: hoveredRow, select: true })(
					editorView.state,
					editorView.dispatch
				);
			}
			draggingRow = -1;
			dragRowY = 0;
			hoveredRow = -1;
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		}

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	}

	function handleColDragStart(index: number, e: MouseEvent) {
		e.preventDefault();
		draggingCol = index;
		const handleOriginX = colRects[index]
			? (colRects[index].left + colRects[index].right) / 2
			: e.clientX;
		dragColX = 0;
		handleSelectColumn(index, e);

		function onMouseMove(ev: MouseEvent) {
			// Move the handle tab to follow the mouse
			dragColX = ev.clientX - handleOriginX;
			// Find which column the mouse is over for drop target
			const x = ev.clientX;
			for (let i = 0; i < colRects.length; i++) {
				const r = colRects[i];
				if (x >= r.left && x <= r.right) {
					hoveredCol = i;
					break;
				}
			}
		}

		function onMouseUp() {
			if (draggingCol >= 0 && hoveredCol >= 0 && draggingCol !== hoveredCol) {
				moveTableColumn({ from: draggingCol, to: hoveredCol, select: true })(
					editorView.state,
					editorView.dispatch
				);
			}
			draggingCol = -1;
			dragColX = 0;
			hoveredCol = -1;
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		}

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	}
</script>

<Portal>
	<!-- Bottom zone: Add Row -->
	<div
		class="table-add-zone table-add-zone-bottom"
		style="left: {tableRect.left}px; top: {tableRect.bottom}px; width: {tableRect.width}px; height: 24px;"
		role="presentation"
		onmouseenter={() => (showBottom = true)}
		onmouseleave={() => (showBottom = false)}
	>
		<button
			class="table-add-bar table-add-bar-horizontal"
			class:visible={showBottom}
			onmousedown={preventFocusLoss}
			onclick={handleAddRow}
			aria-label="Add row"
			tabindex={-1}
		>
			<span class="table-add-icon">+</span>
		</button>
	</div>

	<!-- Right zone: Add Column -->
	<div
		class="table-add-zone table-add-zone-right"
		style="left: {tableRect.right}px; top: {tableRect.top}px; width: 24px; height: {tableRect.height}px;"
		role="presentation"
		onmouseenter={() => (showRight = true)}
		onmouseleave={() => (showRight = false)}
	>
		<button
			class="table-add-bar table-add-bar-vertical"
			class:visible={showRight}
			onmousedown={preventFocusLoss}
			onclick={handleAddColumn}
			aria-label="Add column"
			tabindex={-1}
		>
			<span class="table-add-icon">+</span>
		</button>
	</div>

	<!-- Left zone: Row drag handles (only closest visible) -->
	<div
		class="table-add-zone table-add-zone-left"
		style="left: {tableRect.left - 28}px; top: {tableRect.top}px; width: 28px; height: {tableRect.height}px;"
		role="presentation"
		onmousemove={handleLeftZoneMove}
		onmouseleave={() => { if (draggingRow < 0) hoveredRow = -1; }}
	>
		{#each rowRects as rect, i (i)}
			{@const isDragging = draggingRow === i}
			{@const isClosest = hoveredRow === i}
			<button
				class="table-drag-handle"
				class:visible={isClosest || isDragging}
				class:dragging={isDragging}
				style="top: {rect.top + window.scrollY - tableRect.top + (isDragging ? dragRowY : 0)}px; height: {rect.height}px;"
				onmousedown={(e) => handleRowDragStart(i, e)}
				aria-label={`Select row ${i + 1}`}
				tabindex={-1}
			>
				<GripVertical class="h-3.5 w-3.5" />
			</button>
		{/each}
	</div>

	<!-- Top zone: Column drag handles (only closest visible) -->
	<div
		class="table-add-zone table-add-zone-top"
		style="left: {tableRect.left}px; top: {tableRect.top - 28}px; width: {tableRect.width}px; height: 28px;"
		role="presentation"
		onmousemove={handleTopZoneMove}
		onmouseleave={() => { if (draggingCol < 0) hoveredCol = -1; }}
	>
		{#each colRects as rect, i (i)}
			{@const isDragging = draggingCol === i}
			{@const isClosest = hoveredCol === i}
			<button
				class="table-drag-handle table-drag-handle-col"
				class:visible={isClosest || isDragging}
				class:dragging={isDragging}
				style="left: {rect.left + window.scrollX - tableRect.left + (isDragging ? dragColX : 0)}px; width: {rect.width}px;"
				onmousedown={(e) => handleColDragStart(i, e)}
				aria-label={`Select column ${i + 1}`}
				tabindex={-1}
			>
				<GripHorizontal class="h-3.5 w-3.5" />
			</button>
		{/each}
	</div>
</Portal>

<style>
	/* Invisible hover detection zone */
	.table-add-zone {
		position: absolute;
		pointer-events: auto;
		z-index: 10;
	}

	/* The visible bar inside the zone — always rendered, toggle visibility */
	.table-add-bar {
		opacity: 0;
		pointer-events: none;
		transition: opacity 120ms ease;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--qm-muted);
		border: 1px solid var(--qm-border);
		border-radius: 4px;
		cursor: pointer;
		color: var(--qm-muted-foreground);
		font-size: 14px;
		padding: 0;
	}

	.table-add-bar:hover {
		background: color-mix(in srgb, var(--qm-brand) 15%, transparent);
	}

	.table-add-bar.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.table-add-bar-horizontal {
		width: 100%;
		height: 20px;
		margin-top: 2px;
	}

	.table-add-bar-vertical {
		width: 20px;
		height: 100%;
		margin-left: 2px;
	}

	.table-add-icon {
		line-height: 1;
		font-weight: bold;
	}

	/* Drag handles */
	.table-drag-handle {
		position: absolute;
		left: 0;
		width: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: grab;
		user-select: none;
		opacity: 0;
		pointer-events: none;
		transition: opacity 100ms ease, background 100ms ease;
		background: var(--qm-muted);
		border: 1px solid var(--qm-border);
		border-radius: 4px;
		color: var(--qm-muted-foreground);
		padding: 0;
	}

	.table-drag-handle.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.table-drag-handle:hover {
		background: color-mix(in srgb, var(--qm-brand) 15%, transparent);
	}

	.table-drag-handle.dragging {
		cursor: grabbing;
		opacity: 1;
		background: color-mix(in srgb, var(--qm-brand) 30%, transparent);
		z-index: 20;
	}

	.table-drag-handle-col {
		position: absolute;
		top: 0;
		left: unset;
		height: 24px;
		width: auto;
	}
</style>
