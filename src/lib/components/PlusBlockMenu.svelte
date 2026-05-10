<script lang="ts">
	import { Plus } from 'lucide-svelte';
	import Portal from '$lib/ui/portal.svelte';
	import type { ComponentType } from 'svelte';

	export interface BlockCommand {
		id: string;
		label: string;
		icon: ComponentType;
	}

	interface Props {
		visible: boolean;
		/** Viewport coordinates for the left-edge midpoint of the empty line. */
		position: { x: number; y: number };
		commands: BlockCommand[];
		onSelect: (id: string) => void;
	}

	let { visible, position, commands, onSelect }: Props = $props();

	let menuOpen = $state(false);

	function pick(id: string) {
		menuOpen = false;
		onSelect(id);
	}
</script>

{#if visible}
	<Portal>
		<!-- Backdrop closes the sub-menu without affecting the editor -->
		{#if menuOpen}
			<button
				type="button"
				class="pbm-backdrop"
				onclick={() => (menuOpen = false)}
				aria-hidden="true"
				tabindex="-1"
			></button>
		{/if}

		<div class="pbm-wrap" style="left: {position.x}px; top: {position.y}px;">
			<button
				type="button"
				class="pbm-trigger"
				class:pbm-trigger--open={menuOpen}
				title="Insert block"
				onmousedown={(e) => {
					e.preventDefault(); // keep editor focus
					menuOpen = !menuOpen;
				}}
			>
				<Plus size={13} strokeWidth={2.5} />
			</button>

			{#if menuOpen}
				<div class="pbm-menu" role="listbox" aria-label="Insert block">
					{#each commands as cmd (cmd.id)}
						<button
							type="button"
							class="pbm-item"
							role="option"
							aria-selected="false"
							onmousedown={(e) => {
								e.preventDefault();
								pick(cmd.id);
							}}
						>
							<span class="pbm-icon"><cmd.icon size={14} strokeWidth={1.5} /></span>
							<span class="pbm-label">{cmd.label}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</Portal>
{/if}

<style>
	.pbm-backdrop {
		position: fixed;
		inset: 0;
		z-index: 149;
		background: transparent;
		border: none;
		padding: 0;
		cursor: default;
	}

	.pbm-wrap {
		position: fixed;
		/* Anchor to the left of the line, vertically centered */
		transform: translate(calc(-100% - 6px), -50%);
		z-index: 150;
		display: flex;
		align-items: center;
	}

	.pbm-trigger {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 4px;
		border: 1px solid var(--qm-border);
		background: var(--qm-background);
		color: var(--qm-muted-foreground);
		cursor: pointer;
		padding: 0;
		transition:
			color 100ms ease,
			border-color 100ms ease,
			background-color 100ms ease,
			transform 100ms ease;
	}

	.pbm-trigger:hover,
	.pbm-trigger--open {
		color: var(--qm-foreground);
		border-color: var(--qm-border-hover);
		background: var(--qm-muted);
		transform: translate(calc(-100% - 6px), -50%) rotate(45deg);
	}

	.pbm-menu {
		position: absolute;
		/* Open to the right of the trigger button */
		left: calc(100% + 8px);
		top: 50%;
		transform: translateY(-50%);
		z-index: 150;
		background: var(--qm-background);
		border: 1px solid var(--qm-border);
		border-radius: 8px;
		box-shadow:
			0 4px 16px rgb(0 0 0 / 0.1),
			0 1px 4px rgb(0 0 0 / 0.06);
		padding: 4px;
		min-width: 180px;
		animation: pbm-in 100ms ease-out;
	}

	@keyframes pbm-in {
		from {
			opacity: 0;
			transform: translateY(-50%) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(-50%) scale(1);
		}
	}

	.pbm-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 8px;
		border: none;
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
		text-align: left;
		transition: background-color 80ms ease;
	}

	.pbm-item:hover {
		background: var(--qm-accent);
	}

	.pbm-icon {
		color: var(--qm-muted-foreground);
	}

	.pbm-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--qm-foreground);
	}
</style>
