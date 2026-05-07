<script lang="ts">
	import '$lib/styles/theme.css';

	let { children } = $props();
</script>

<main class="qm-editor">
	{@render children()}
</main>

<style>
	main {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--qm-background);
		color: var(--qm-foreground);
	}
</style>
