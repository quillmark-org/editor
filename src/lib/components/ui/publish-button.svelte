<script lang="ts">
	import { Globe } from 'lucide-svelte';
	import Button from './button.svelte';

	type PublishButtonProps = {
		onPublish: () => void;
		disabled?: boolean;
		disabledTitle?: string;
		/**
		 * Whether to show label text (responsive: hidden on mobile)
		 * @default true
		 */
		showLabel?: boolean;
		/**
		 * Whether the current document is a published template
		 * @default false
		 */
		isTemplate?: boolean;
	};

let {
	onPublish,
	disabled = false,
	disabledTitle = 'No active document to publish',
	showLabel = true,
	isTemplate = false
}: PublishButtonProps = $props();

const baseClasses = 'h-8 rounded-sm border transition-colors';
const filledSuccessClasses =
	'border-border-hover bg-surface text-foreground hover:bg-accent hover:text-foreground';

function handlePublish() {
	if (!disabled) {
		onPublish();
	}
}
</script>

<Button
	variant="ghost"
	size="sm"
	class="{baseClasses} {filledSuccessClasses}"
	onclick={handlePublish}
	disabled={disabled}
	aria-label={isTemplate ? "Manage template" : "Publish template"}
	title={disabled ? disabledTitle : (isTemplate ? 'Manage template' : 'Publish template')}
>
	<Globe class="mr-1 h-4 w-4" />
	{#if showLabel}
		<span class="hidden sm:inline">Publish</span>
	{/if}
</Button>
