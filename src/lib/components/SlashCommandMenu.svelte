<script lang="ts">
	import Portal from '$lib/ui/portal.svelte';
	import type { ComponentType } from 'svelte';

	export interface SlashCommand {
		id: string;
		label: string;
		description: string;
		icon: ComponentType;
	}

	interface Props {
		visible: boolean;
		position: { x: number; y: number };
		query: string;
		commands: SlashCommand[];
		onSelect: (id: string) => void;
		onClose: () => void;
	}

	let { visible, position, query, commands, onSelect, onClose }: Props = $props();

	let activeIndex = $state(0);
	let menuEl = $state<HTMLElement | null>(null);

	const filtered = $derived(
		query.trim() === ''
			? commands
			: commands.filter(
					(c) =>
						c.label.toLowerCase().includes(query.toLowerCase()) ||
						c.description.toLowerCase().includes(query.toLowerCase())
				)
	);

	$effect(() => {
		void filtered.length;
		activeIndex = 0;
	});

	// Scroll active item into view when it changes
	$effect(() => {
		if (!menuEl || !visible) return;
		const items = menuEl.querySelectorAll<HTMLElement>('.sc-item');
		items[activeIndex]?.scrollIntoView({ block: 'nearest' });
	});

	function handleKeydown(e: KeyboardEvent) {
		if (!visible || filtered.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			e.stopPropagation();
			activeIndex = (activeIndex + 1) % filtered.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			e.stopPropagation();
			activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
		} else if (e.key === 'Enter' && filtered[activeIndex]) {
			e.preventDefault();
			e.stopPropagation();
			onSelect(filtered[activeIndex].id);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onClose();
		}
	}

	// Capture-phase listener so we intercept before Lexical handles arrow keys / Enter
	$effect(() => {
		if (!visible) return;
		document.addEventListener('keydown', handleKeydown, true);
		return () => document.removeEventListener('keydown', handleKeydown, true);
	});
</script>

{#if visible && filtered.length > 0}
	<Portal>
		<div
			bind:this={menuEl}
			class="sc-menu"
			style="left: {position.x}px; top: {position.y}px;"
			role="listbox"
			aria-label="Insert block"
		>
			<p class="sc-hint">BLOCKS</p>
			{#each filtered as cmd, i (cmd.id)}
				<!-- svelte-ignore a11y_mouse_events_have_key_events -->
				<button
					type="button"
					class="sc-item"
					class:sc-item--active={i === activeIndex}
					role="option"
					aria-selected={i === activeIndex}
					onmouseenter={() => (activeIndex = i)}
					onclick={() => onSelect(cmd.id)}
				>
					<span class="sc-icon"><cmd.icon size={16} strokeWidth={1.5} /></span>
					<span class="sc-text">
						<span class="sc-label">{cmd.label}</span>
						<span class="sc-desc">{cmd.description}</span>
					</span>
				</button>
			{/each}
		</div>
	</Portal>
{/if}

<style>
	.sc-menu {
		position: fixed;
		z-index: 200;
		min-width: 240px;
		max-height: 320px;
		overflow-y: auto;
		background: var(--qm-background);
		border: 1px solid var(--qm-border);
		border-radius: 8px;
		box-shadow:
			0 8px 24px rgb(0 0 0 / 0.12),
			0 2px 6px rgb(0 0 0 / 0.06);
		padding: 4px;
		animation: sc-in 120ms ease-out;
	}

	@keyframes sc-in {
		from {
			opacity: 0;
			transform: translateY(-4px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.sc-hint {
		margin: 0;
		padding: 4px 8px 2px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--qm-muted-foreground);
		text-transform: uppercase;
	}

	.sc-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 6px 8px;
		border: none;
		border-radius: 5px;
		background: transparent;
		cursor: pointer;
		text-align: left;
		transition: background-color 80ms ease;
	}

	.sc-item--active {
		background: var(--qm-accent);
	}

	.sc-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 5px;
		background: var(--qm-muted);
		color: var(--qm-foreground);
	}

	.sc-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.sc-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--qm-foreground);
		line-height: 1.3;
	}

	.sc-desc {
		font-size: 11px;
		color: var(--qm-muted-foreground);
		line-height: 1.3;
	}
</style>
