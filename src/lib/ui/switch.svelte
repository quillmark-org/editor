<script lang="ts">
	type SwitchProps = {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
		disabled?: boolean;
		id?: string;
		class?: string;
	};

	let {
		checked = $bindable(false),
		onCheckedChange,
		disabled = false,
		id,
		class: className = '',
		...restProps
	}: SwitchProps = $props();

	function handleClick() {
		if (disabled) return;
		const next = !checked;
		checked = next;
		onCheckedChange?.(next);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (disabled) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick();
		}
	}
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	{id}
	{disabled}
	tabindex={disabled ? -1 : 0}
	onclick={handleClick}
	onkeydown={handleKeydown}
	class="qm-switch {className}"
	class:qm-switch-on={checked}
	{...restProps}
>
	<span class="qm-switch-thumb"></span>
</button>

<style>
	.qm-switch {
		display: inline-flex;
		align-items: center;
		width: 2.25rem;
		height: 1.25rem;
		padding: 2px;
		border-radius: 9999px;
		border: none;
		background: var(--qm-accent);
		cursor: pointer;
		transition: background-color 0.18s ease;
	}
	.qm-switch.qm-switch-on {
		background: var(--qm-primary);
	}
	.qm-switch:focus-visible {
		outline: 2px solid var(--qm-ring);
		outline-offset: 2px;
	}
	.qm-switch:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.qm-switch-thumb {
		display: block;
		width: 1rem;
		height: 1rem;
		border-radius: 9999px;
		background: var(--qm-background);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
		transition: transform 0.18s ease;
	}
	.qm-switch-on .qm-switch-thumb {
		transform: translateX(1rem);
	}
</style>
