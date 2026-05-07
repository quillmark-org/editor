<script lang="ts">
	import { Menu, Settings, Plus, LogIn, User } from 'lucide-svelte';
	import { page } from '$app/state';
	import Button from '$lib/components/ui/button.svelte';
	import { SidebarButtonSlot } from '$lib/components/Sidebar';
	import { DocumentList } from '$lib/components/DocumentList';
	import BasePopover from '$lib/components/ui/base-popover.svelte';
	import Switch from '$lib/components/ui/switch.svelte';
	import Label from '$lib/components/ui/label.svelte';
	import LoginPopover from './LoginPopover.svelte';
	import BrandTitle from '$lib/components/BrandTitle.svelte';
	import NewDocumentModal from '$lib/components/NewDocumentModal/NewDocumentModal.svelte';
	import { documentStore } from '$lib/stores/documents.svelte';
	import { responsiveStore } from '$lib/stores/responsive.svelte';
	import {
		requestTemplateListRefresh
	} from '$lib/services/templates/template-prefetch.svelte';
	import { onMount } from 'svelte';

	import { userStore } from '$lib/stores/user.svelte';
	import { loginModalStore } from '$lib/stores/login-modal.svelte';
	import type { AuthProviderConfig } from '$lib/services/auth/types';

	type SidebarProps = {
		providers: AuthProviderConfig[];
		newDocDialogOpen?: boolean;
		isExpanded?: boolean;
		onCollapseSidebar?: () => void;
		loginPopoverOpen?: boolean;
		onSignOut?: () => void;
		initialTemplateId?: string;
	};

	let {
		providers,
		newDocDialogOpen = $bindable(false),
		isExpanded = $bindable(false),
		onCollapseSidebar,
		loginPopoverOpen = $bindable(false),
		onSignOut,
		initialTemplateId = $bindable<string | undefined>(undefined),
	}: SidebarProps = $props();

	const brand = $derived(page.data.config.brand);

	// Derived user state from store
	const user = $derived(userStore.user);
	const displayName = $derived(
		user ? (user.name || user.email) : ''
	);
	let advancedMode = $state(false);
	let popoverOpen = $state(false);
	let isDarkMode = $state(true);
	let profilePopoverOpen = $state(false);
	let enableTransitions = $state(false);

	// Use centralized responsive store
	const isNarrowViewport = $derived(responsiveStore.isNarrowViewport);

	// Get existing document names for collision detection
	const existingDocumentNames = $derived(documentStore.documents.map((d) => d.name));


	// Track whether initial localStorage load has occurred to prevent
	// writing default values back to localStorage before we've read them
	let initializedFromStorage = $state(false);

	// Persist sidebar state changes to localStorage (only after initial load)
	$effect(() => {
		if (initializedFromStorage) {
			localStorage.setItem('sidebar-expanded', String(isExpanded));
		}
	});

	onMount(() => {
		// Initialize sidebar state from localStorage or screen size
		// Done in onMount to prevent SSR hydration mismatch - server renders
		// with default (collapsed), then client updates from localStorage
		const savedSidebarState = localStorage.getItem('sidebar-expanded');
		if (savedSidebarState !== null) {
			isExpanded = savedSidebarState === 'true';
		} else {
			// Desktop: expanded, Mobile: collapsed
			isExpanded = window.innerWidth >= 768;
		}
		initializedFromStorage = true;

		// Enable transitions after initial render to prevent animation on load
		setTimeout(() => {
			enableTransitions = true;
			// Remove the global class that forces collapsed state, now that Svelte has taken over
			document.documentElement.classList.remove('sidebar-collapsed');
		}, 100);

		// Load dark mode preference from localStorage
		const savedDarkMode = localStorage.getItem('dark-mode');
		if (savedDarkMode !== null) {
			isDarkMode = savedDarkMode === 'true';
		}
		// Apply dark mode class to document
		updateDarkMode(isDarkMode);

		// Load advanced mode setting (default to false = rich text mode)
		const savedAdvancedMode = localStorage.getItem('editor-mode');
		if (savedAdvancedMode !== null) {
			advancedMode = savedAdvancedMode === 'advanced';
		}
	});

	function handleToggle() {
		isExpanded = !isExpanded;
	}

	/**
	 * Collapse sidebar on mobile after explicit document actions
	 * Centralized helper to keep collapse logic DRY
	 */
	function collapseSidebarOnMobile() {
		if (isNarrowViewport && isExpanded) {
			onCollapseSidebar?.();
		}
	}

	async function handleCreateDocument(name: string, content: string, sourceTemplateId?: string) {
		await documentStore.createDocument(name, content, sourceTemplateId);

		// Collapse sidebar after successful creation
		collapseSidebarOnMobile();
	}

	function handleAdvancedModeChange(value: boolean) {
		advancedMode = value;
		const modeValue = value ? 'advanced' : 'rich';
		localStorage.setItem('editor-mode', modeValue);
		// Dispatch storage event manually for same-tab communication
		window.dispatchEvent(
			new StorageEvent('storage', {
				key: 'editor-mode',
				newValue: modeValue,
				oldValue: value ? 'rich' : 'advanced',
				url: window.location.href,
				storageArea: localStorage
			})
		);
	}

	function updateDarkMode(dark: boolean) {
		if (dark) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}

	function handleDarkModeChange(value: boolean) {
		isDarkMode = value;
		localStorage.setItem('dark-mode', value.toString());
		updateDarkMode(value);
	}

	function handleSignOut() {
		// Close popover first, then delegate to parent
		profilePopoverOpen = false;
		onSignOut?.();
	}

	/**
	 * Throttled refresh of the recommended template list (max once per 30 s).
	 * The cached snapshot stays visible while the refetch is in flight, so the
	 * modal never loses its content. Thumbnails for newly-surfaced entries
	 * miss the app-load warm and fall back to the modal's on-demand render
	 * path.
	 */
	function refreshTemplateList() {
		requestTemplateListRefresh();
	}
</script>

<!-- Sidebar -->
<aside
	role="navigation"
	aria-label="Main navigation"
	class="sidebar layout-border-r overflow-hidden overflow-x-hidden border-r border-border bg-surface text-foreground"
	class:sidebar-mobile={isNarrowViewport}
	class:sidebar-desktop={!isNarrowViewport}
	class:sidebar-expanded={isExpanded}
	class:sidebar-animated={enableTransitions}
	style="display: flex; flex-direction: column; flex-shrink: 0; height: 100%; width: {isNarrowViewport ? (isExpanded ? 'var(--sidebar-expanded-width)' : '0') : (isExpanded ? 'var(--sidebar-expanded-width)' : 'var(--sidebar-collapsed-width)')};"
>
	<!-- Title (Desktop: shown with hamburger; Mobile: shown when expanded) -->
	<div class="relative flex items-center" style="height: var(--top-menu-height);">
			<div class="z-canvas-ui relative shrink-0" style="width: 48px;">
				<button
					class="hamburger-button"
					onclick={handleToggle}
					aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
					aria-expanded={isExpanded}
				>
					<Menu class="hamburger-icon" />
				</button>
			</div>

		<span
			class="sidebar-title absolute right-0 left-0 text-center font-mono text-lg whitespace-nowrap text-foreground {isExpanded
				? 'opacity-100'
				: 'opacity-0'}"
		>
			<BrandTitle class="" />
		</span>
	</div>

	<!-- Logo Signature -->
	<div
		class="sidebar-logo-slot layout-border-b border-b border-border"
		class:expanded={isExpanded}
	>
		<a
			href={brand.urls.website}
			target="_blank"
			rel="noopener noreferrer external"
			class="transition-opacity hover:opacity-80"
		>
			<img src={brand.meta.icons.logo} alt="{brand.displayFull} logo" class="sidebar-logo" />
		</a>
	</div>

	<!-- Menu Items -->
	<div class="sidebar-menu-area" style="flex-grow: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
		<!-- New Document button with integrated bottom border -->
		<div class="new-document-section" role="none" onpointerenter={refreshTemplateList} onfocusin={refreshTemplateList}>
			<SidebarButtonSlot
				icon={Plus}
				label="New Document"
				{isExpanded}
				ariaLabel="Create new document"
				onclick={() => { refreshTemplateList(); newDocDialogOpen = true; }}
			/>
			<NewDocumentModal
				open={newDocDialogOpen}
				onOpenChange={(open) => {
					newDocDialogOpen = open;
					if (!open) initialTemplateId = undefined;
				}}
				onCreateDocument={handleCreateDocument}
				{existingDocumentNames}
				onLoginRequired={() => loginModalStore.show('star')}
				{initialTemplateId}
			/>
		</div>

		{#if isExpanded}
			<!-- Scrollable Document List -->
			<div
				class="sidebar-document-list space-y-px overflow-x-hidden overflow-y-auto px-1 pt-2"
				style="flex-grow: 1;"
			>
				<DocumentList
					onAction={collapseSidebarOnMobile}
				/>

				</div>
		{:else}
			<!-- Spacer to push footer to bottom when sidebar is collapsed -->
			<div class="sidebar-spacer" style="flex-grow: 1;"></div>
		{/if}
	</div>

	<!-- User Profile and Settings Section -->
	<div class="sidebar-footer layout-border-t border-t border-border" style="flex-shrink: 0; display: flex; flex-direction: column;">
		<!-- Sign-In Button (Guest Mode) -->
		{#if !user}
			<BasePopover bind:open={loginPopoverOpen} side="right" align="start" sideOffset={0}>
				{#snippet trigger()}
					<SidebarButtonSlot
						icon={LogIn}
						label="Sign in to sync"
						{isExpanded}
						ariaLabel="Sign in to your account"
					/>
				{/snippet}
				{#snippet content()}
					<LoginPopover {providers} />
				{/snippet}
			</BasePopover>
		{/if}

		<!-- User Profile Button (Logged-in Mode) -->
		{#if user}
			<BasePopover bind:open={profilePopoverOpen} side="right" align="start" sideOffset={0}>
				{#snippet trigger()}
					<SidebarButtonSlot
						icon={User}
						label={displayName}
						{isExpanded}
						ariaLabel="User profile: {displayName}"
					/>
				{/snippet}
				{#snippet content()}
					<div class="w-72 px-4">
						<dl class="space-y-4">
							<div>
								<dt class="text-sm font-medium text-muted-foreground">User ID</dt>
								<dd class="font-mono text-sm text-foreground">{user.id}</dd>
							</div>
						</dl>

						<Button
							variant="ghost"
							size="sm"
							class="w-full text-foreground hover:bg-accent hover:text-foreground"
							onclick={handleSignOut}
						>
							Sign Out
						</Button>
					</div>
				{/snippet}
			</BasePopover>
		{/if}

		<!-- Settings Gear Button -->
		<BasePopover bind:open={popoverOpen} side="right" align="end" sideOffset={0}>
			{#snippet trigger()}
				<SidebarButtonSlot
					icon={Settings}
					label="Settings"
					{isExpanded}
					ariaLabel="Open settings"
				/>
			{/snippet}
			{#snippet content()}
				<div class="w-64 px-4">
					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<Label for="dark-mode" class="text-foreground">Dark Mode</Label>
							<Switch
								id="dark-mode"
								bind:checked={isDarkMode}
								onCheckedChange={handleDarkModeChange}
							/>
						</div>

						<div class="flex items-center justify-between">
							<Label for="advanced-mode" class="text-foreground">Advanced Mode</Label>
							<Switch
								id="advanced-mode"
								bind:checked={advancedMode}
								onCheckedChange={handleAdvancedModeChange}
							/>
						</div>
					</div>
				</div>
			{/snippet}
		</BasePopover>
	</div>
</aside>


<style>
	/* Sidebar base styles */
	.sidebar {
		box-shadow: none;
	}

	/* Hamburger toggle button: icon color responds to hover, no background change */
	.hamburger-button {
		width: 100%;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: rgb(from var(--color-foreground) r g b / 0.7);
		cursor: pointer;
		padding: 0;
		transition: color 0.2s;
	}

	.hamburger-button:hover {
		color: var(--color-foreground);
	}

	.hamburger-button:active {
		transform: scale(0.985);
	}

	:global(.hamburger-icon) {
		width: 24px;
		height: 24px;
		flex-shrink: 0;
	}

	.sidebar-animated {
		transition:
			width 300ms cubic-bezier(0.165, 0.85, 0.45, 1),
			box-shadow 300ms cubic-bezier(0.165, 0.85, 0.45, 1);
	}

	.sidebar-animated .sidebar-title {
		transition: opacity 300ms ease;
	}

	/* Desktop mode: relative positioning, pushes layout */
	.sidebar-desktop {
		position: relative;
		z-index: var(--z-canvas-ui, 10);
	}

	/* Mobile mode: fixed positioning, overlays content */
	.sidebar-mobile {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		z-index: var(--z-sidebar, 50);
	}

	/* Expanded state shadow (only on mobile overlay mode) */
	.sidebar-mobile.sidebar-expanded {
		box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
	}

	/* Logo signature slot */
	.sidebar-logo-slot {
		height: 48px;
		min-height: 48px;
		max-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		box-sizing: border-box; /* Ensure padding is included in 48px height to match button slots */
	}

	.sidebar-logo {
		width: 30px;
		height: 30px;
		flex-shrink: 0;
		transition: transform 300ms cubic-bezier(0.165, 0.85, 0.45, 1);
		transform: translateY(-4px);
	}

	/* New Document section - bottom border without affecting button position */
	.new-document-section {
		position: relative;
	}

	.new-document-section::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0.25rem; /* 4px inset - matches sidebar button slot padding */
		right: 0.25rem; /* 4px inset - matches sidebar button slot padding */
		height: 1px;
		background-color: var(--color-border);
	}

	/*
	 * Sidebar flex layout: ALL flex properties are set via inline styles
	 * to bypass Vercel's CSS build pipeline, which corrupts flex properties
	 * in both shorthand and longhand forms when they appear in stylesheet
	 * rules (scoped Svelte <style> blocks or Tailwind utility classes).
	 * Inline styles live in the HTML template and are never processed by
	 * CSS tools, so the browser receives them intact.
	 *
	 * Inline styles applied:
	 *   <aside>:               display:flex; flex-direction:column
	 *   .sidebar-menu-area:    flex-grow:1; display:flex; flex-direction:column
	 *   .sidebar-document-list: flex-grow:1
	 *   .sidebar-spacer:       flex-grow:1
	 *   .sidebar-footer:       flex-shrink:0; display:flex; flex-direction:column
	 *
	 * Additionally, the Tailwind utility classes 'flex', 'flex-col', and
	 * 'shrink-0' have been REMOVED from <aside> to prevent Vercel's
	 * pipeline from generating corrupted CSS rules with !important that
	 * would override even inline styles. Same for 'overflow-hidden' on
	 * .sidebar-menu-area.
	 */

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.sidebar {
			transition-duration: 0.01ms !important;
		}
	}
</style>
