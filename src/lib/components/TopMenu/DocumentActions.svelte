<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const brand = $derived(page.data.config.brand);

	// UI Components
	import Button from '$lib/components/ui/button.svelte';
	import BasePopover from '$lib/components/ui/base-popover.svelte';
	import DownloadButton from '$lib/components/ui/download-button.svelte';
	import PublishButton from '$lib/components/ui/publish-button.svelte';
	import Tooltip from '$lib/components/ui/tooltip.svelte';

	// Icons
	import {
		MoreVertical,
		Ruler,
		FileText,
		Info,
		Shield,
		Scale,
		Share,
		Keyboard
	} from 'lucide-svelte';

	// Modal
	import KeyboardShortcutsModal from '$lib/components/KeyboardShortcutsModal.svelte';

	// Subcomponents
	import AccountMenu from './AccountMenu.svelte';

	// Stores
	import { responsiveStore } from '$lib/stores/responsive.svelte';
	import { documentStore } from '$lib/stores/documents.svelte';
	import { rulerStore } from '$lib/stores/ruler.svelte';
	import { userStore } from '$lib/stores/user.svelte';

	// Version
	import { APP_VERSION } from '$lib/version';
	import { onMount } from 'svelte';

	type DocumentActionsProps = {
		onDownload: () => void;
		onDownloadMarkdown?: () => void;
		onDocumentInfo?: () => void;
		onRulerToggle?: () => void;
		onPublish?: () => void;
		onShareLink?: () => void;
		hasSuccessfulPreview?: boolean;
		onBetaProgramClick?: () => void;
		onFeedbackClick?: () => void;
		onWhatsNewClick?: () => void;
	};

	let {
		onDownload,
		onDownloadMarkdown,
		onDocumentInfo,
		onRulerToggle,
		onPublish,
		onShareLink,
		hasSuccessfulPreview = false,
		onBetaProgramClick,
		onFeedbackClick,
		onWhatsNewClick
	}: DocumentActionsProps = $props();

	const WHATS_NEW_STORAGE_KEY = 'last-seen-changelog-version';

	let dropdownOpen = $state(false);
	let showShortcuts = $state(false);
	let hasUnseenWhatsNew = $state(false);

	onMount(() => {
		const seen = localStorage.getItem(WHATS_NEW_STORAGE_KEY);
		hasUnseenWhatsNew = seen !== APP_VERSION;
	});

	function handleWhatsNewClick() {
		localStorage.setItem(WHATS_NEW_STORAGE_KEY, APP_VERSION);
		hasUnseenWhatsNew = false;
		onWhatsNewClick?.();
	}

	const showWhatsNewDot = $derived(
		hasUnseenWhatsNew && userStore.isAuthenticated && !!onWhatsNewClick
	);

	// Ruler is only available on non-touch devices with an active editor
	const hasActiveEditor = $derived(!!documentStore.activeDocumentId);
	const isTemplate = $derived(documentStore.activeDocument?.published_as != null);
	const isRulerEnabled = $derived(hasActiveEditor && !responsiveStore.isTouchDevice);

	function handleRulerToggle() {
		if (onRulerToggle) {
			onRulerToggle();
		} else {
			rulerStore.toggle();
		}
	}

	function handleShowShortcuts() {
		showShortcuts = true;
		dropdownOpen = false;
	}

	function handlePublish() {
		if (onPublish) {
			onPublish();
		}
	}

	function handleDocumentInfo() {
		onDocumentInfo?.();
		dropdownOpen = false;
	}

	function handleShareLink() {
		onShareLink?.();
		dropdownOpen = false;
	}

	function closeDropdown() {
		dropdownOpen = false;
	}
</script>

<div class="flex items-center gap-2">
	<Tooltip content="Ruler Tool" delay={350} position="bottom" offset={4} class="p-1 text-xs text-foreground/50">
		<Button
			variant="outline"
			size="sm"
			class="h-7 w-7 border-border-hover bg-surface p-0 text-muted-foreground hover:bg-accent hover:text-foreground disabled:border-border disabled:text-muted-foreground/60"
			onclick={handleRulerToggle}
			disabled={!isRulerEnabled}
			aria-label="Ruler Tool"
			title="Ruler Tool"
		>
			<Ruler class="h-3.5 w-3.5" />
		</Button>
	</Tooltip>

	<Tooltip content="Document Stats" delay={350} position="bottom" offset={4} class="p-1 text-xs text-foreground/50">
		<Button
			variant="outline"
			size="sm"
			class="h-7 w-7 border-border-hover bg-surface p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
			disabled={!hasActiveEditor}
			onclick={handleDocumentInfo}
			aria-label="Document Stats"
			title="Document Stats"
		>
			<FileText class="h-3.5 w-3.5" />
		</Button>
	</Tooltip>

	<PublishButton
		onPublish={handlePublish}
		disabled={!hasActiveEditor}
		{isTemplate}
	/>

	<DownloadButton
		{onDownload}
		{onDownloadMarkdown}
		disabled={!hasSuccessfulPreview}
	/>

	<!-- Meatball Menu -->
	<BasePopover bind:open={dropdownOpen} side="bottom" align="end" closeOnOutsideClick={true}>
		{#snippet trigger()}
			<Tooltip content="Menu" position="bottom" delay={500} offset={4} class="p-1 text-xs text-foreground/50">
				<div class="relative">
					<Button
						variant="ghost"
						size="sm"
						class="h-8 w-8 p-0 text-foreground/80 hover:bg-accent hover:text-foreground"
						aria-label={showWhatsNewDot ? 'More options (new updates available)' : 'More options'}
					>
						<MoreVertical class="h-4 w-4" />
					</Button>
					{#if showWhatsNewDot}
						<span
							class="pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-surface"
							aria-hidden="true"
						></span>
					{/if}
				</div>
			</Tooltip>
		{/snippet}
		{#snippet content()}
			<div class="-my-3 min-w-56 px-2 py-1">
				<!-- Tools -->
				<button class="menu-item" onclick={handleShowShortcuts} aria-label="Keyboard Shortcuts" title="Keyboard Shortcuts">
					<Keyboard class="mr-2 h-4 w-4" />
					Keyboard Shortcuts
				</button>
				<button
					class="menu-item"
					disabled={!hasActiveEditor}
					onclick={handleShareLink}
				>
					<Share class="mr-2 h-4 w-4" />
					Share Link
				</button>
				<!-- About & Legal -->
				<a
					href={brand.urls.about}
					target="_blank"
					rel="noopener noreferrer external"
					class="menu-item no-style"
					onclick={closeDropdown}
				>
					<Info class="mr-2 h-4 w-4" />
					About Us
				</a>
				{#if page.data.config.classification.useInternalTerms}
					<a
						href={resolve('/terms')}
						class="menu-item no-style"
						onclick={closeDropdown}
					>
						<Scale class="mr-2 h-4 w-4" />
						Terms & Privacy
					</a>
				{:else}
					<a
						href={brand.urls.terms}
						target="_blank"
						rel="noopener noreferrer external"
						class="menu-item no-style"
						onclick={closeDropdown}
					>
						<Scale class="mr-2 h-4 w-4" />
						Terms of Use
					</a>
					<a
						href={brand.urls.privacy}
						target="_blank"
						rel="noopener noreferrer external"
						class="menu-item no-style"
						onclick={closeDropdown}
					>
						<Shield class="mr-2 h-4 w-4" />
						Privacy Policy
					</a>
				{/if}

				<!-- Account section: Beta Program, Feedback, What's New -->
				<AccountMenu
					{onBetaProgramClick}
					{onFeedbackClick}
					onWhatsNewClick={onWhatsNewClick ? handleWhatsNewClick : undefined}
					hasUnseenWhatsNew={showWhatsNewDot}
					onClose={closeDropdown}
				/>
			</div>
		{/snippet}
	</BasePopover>
</div>

<!-- Keyboard Shortcuts Modal -->
<KeyboardShortcutsModal bind:open={showShortcuts} onOpenChange={(open) => (showShortcuts = open)} />
