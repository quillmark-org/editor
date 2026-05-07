<script lang="ts">
	import { AlertTriangle } from 'lucide-svelte';
	import Dialog from '$lib/components/ui/base-dialog.svelte';
	import Button from '$lib/components/ui/button.svelte';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		title: string;
		description: string;
		confirmLabel?: string;
		cancelLabel?: string;
		variant?: 'destructive' | 'default';
		loading?: boolean;
		onConfirm: () => void;
	}

	let {
		open,
		onOpenChange,
		title,
		description,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		variant = 'default',
		loading = false,
		onConfirm
	}: Props = $props();
</script>

<Dialog
	{open}
	{onOpenChange}
	{title}
	size="sm"
	hideCloseButton={true}
	closeOnEscape={!loading}
	closeOnOutsideClick={!loading}
>
	{#snippet content()}
		<div class="flex gap-4">
			{#if variant === 'destructive'}
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
					<AlertTriangle class="h-5 w-5 text-destructive" />
				</div>
			{/if}
			<p class="text-sm text-muted-foreground">{description}</p>
		</div>
	{/snippet}

	{#snippet footer()}
		<Button
			variant="ghost"
			onclick={() => onOpenChange(false)}
			disabled={loading}
		>
			{cancelLabel}
		</Button>
		<Button
			variant={variant === 'destructive' ? 'destructive' : 'default'}
			onclick={onConfirm}
			disabled={loading}
		>
			{loading ? `${confirmLabel}...` : confirmLabel}
		</Button>
	{/snippet}
</Dialog>
