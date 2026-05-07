<script lang="ts">
	type LabelProps = {
		for?: string;
		class?: string;
		children?: import('svelte').Snippet;
	};

	let { for: htmlFor, class: className = '', children, ...restProps }: LabelProps = $props();
</script>

<label for={htmlFor} class="qm-label {className}" {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</label>

<style>
	.qm-label {
		display: inline-block;
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1.4;
		color: var(--qm-foreground);
	}
</style>
