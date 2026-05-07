<script lang="ts">
	/**
	 * Portal component for rendering content at document.body level
	 * When disabled, renders inline (for scoped positioning)
	 */
	interface PortalProps {
		disabled?: boolean;
		children?: import('svelte').Snippet;
	}

	let { disabled = false, children }: PortalProps = $props();

	function portal(node: HTMLElement) {
		if (disabled) return;

		document.body.appendChild(node);

		return {
			destroy() {
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
			}
		};
	}
</script>

{#if children}
	{#if disabled}
		{@render children()}
	{:else}
		<div style="display: contents" use:portal>
			{@render children()}
		</div>
	{/if}
{/if}
