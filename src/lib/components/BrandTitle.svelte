<script lang="ts">
	import { page } from '$app/state';

	type Props = { class?: string };
	let { class: className = '' }: Props = $props();

	const brand = $derived(page.data.config.brand);
</script>

<span class="brand-title {className}">
	<span class="brand-prefix">{brand.prefix}</span>{brand.suffix}
</span>

<style>
	.brand-prefix {
		color: var(--color-brand);
	}
</style>
