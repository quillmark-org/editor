<script lang="ts">
	import Dialog from '$lib/components/ui/base-dialog.svelte';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}

	let { open = $bindable(), onOpenChange }: Props = $props();

	// Detect Mac vs Windows/Linux for displaying correct modifier key
	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
	const modKey = isMac ? '⌘' : 'Ctrl';
</script>

<Dialog
	{open}
	{onOpenChange}
	title="Keyboard Shortcuts"
	size="md"
>
	{#snippet content()}
		<div class="space-y-6 text-sm">
			<!-- Document Actions -->
			<section>
				<h3 class="mb-2 font-medium text-foreground">Document</h3>
				<div class="space-y-1">
					<div class="flex items-center justify-between py-1">
						<span class="text-muted-foreground">Save</span>
						<kbd class="kbd">{modKey} + S</kbd>
					</div>
				</div>
			</section>

			<!-- Fill Field Navigation -->
			<section>
				<h3 class="mb-2 font-medium text-foreground">Fill Field Navigation</h3>
				<div class="space-y-1">
					<div class="flex items-center justify-between py-1">
						<span class="text-muted-foreground">Next field</span>
						<kbd class="kbd">{modKey} + .</kbd>
					</div>
					<div class="flex items-center justify-between py-1">
						<span class="text-muted-foreground">Previous field</span>
						<kbd class="kbd">{modKey} + Shift + .</kbd>
					</div>
				</div>
			</section>

			<!-- Text Formatting -->
			<section>
				<h3 class="mb-2 font-medium text-foreground">Text Formatting</h3>
				<div class="space-y-1">
					<div class="flex items-center justify-between py-1">
						<span class="text-muted-foreground">Bold</span>
						<kbd class="kbd">{modKey} + B</kbd>
					</div>
					<div class="flex items-center justify-between py-1">
						<span class="text-muted-foreground">Italic</span>
						<kbd class="kbd">{modKey} + I</kbd>
					</div>
					<div class="flex items-center justify-between py-1">
						<span class="text-muted-foreground">Underline</span>
						<kbd class="kbd">{modKey} + U</kbd>
					</div>
				</div>
			</section>
		</div>
	{/snippet}
</Dialog>

<style>
	.kbd {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 0.75rem;
		background-color: var(--color-muted);
		border: 1px solid var(--color-border);
		border-radius: 0.375rem;
		color: var(--color-muted-foreground);
	}
</style>
