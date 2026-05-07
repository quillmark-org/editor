<script lang="ts">
	import { FlaskConical, MessageSquare, Megaphone } from 'lucide-svelte';
	import { userStore } from '$lib/stores/user.svelte';

	type AccountMenuProps = {
		onBetaProgramClick?: () => void;
		onFeedbackClick?: () => void;
		onWhatsNewClick?: () => void;
		hasUnseenWhatsNew?: boolean;
		onClose?: () => void;
	};

	let {
		onBetaProgramClick,
		onFeedbackClick,
		onWhatsNewClick,
		hasUnseenWhatsNew = false,
		onClose
	}: AccountMenuProps = $props();

	const showDivider = $derived(
		userStore.isAuthenticated && !!(onBetaProgramClick || onFeedbackClick || onWhatsNewClick)
	);
</script>

{#if showDivider}
	<div class="my-2 border-t border-border"></div>
{/if}

{#if userStore.isAuthenticated && onBetaProgramClick}
	<button
		class="menu-item"
		onclick={() => {
			onClose?.();
			onBetaProgramClick();
		}}
	>
		<FlaskConical class="mr-2 h-4 w-4" />
		Beta Program
	</button>
{/if}

{#if userStore.isAuthenticated && onFeedbackClick}
	<button
		type="button"
		class="menu-item"
		onclick={() => {
			onClose?.();
			onFeedbackClick();
		}}
	>
		<MessageSquare class="mr-2 h-4 w-4" />
		Give Feedback
	</button>
{/if}

{#if userStore.isAuthenticated && onWhatsNewClick}
	<button
		type="button"
		class="menu-item"
		onclick={() => {
			onClose?.();
			onWhatsNewClick();
		}}
	>
		<Megaphone class="mr-2 h-4 w-4" />
		<span>What's New</span>
		{#if hasUnseenWhatsNew}
			<span class="ml-auto h-2 w-2 rounded-full bg-primary" aria-label="New updates available"></span>
		{/if}
	</button>
{/if}
