<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { documentStore } from '$lib/stores/documents.svelte';
	import { responsiveStore } from '$lib/stores/responsive.svelte';
	import { rulerStore } from '$lib/stores/ruler.svelte';
	import { AutoSave } from '$lib/utils/auto-save.svelte';
	import { Sidebar, SidebarBackdrop } from '$lib/components/Sidebar';
	import { TopMenu } from '$lib/components/TopMenu';
	import { DocumentEditor } from '$lib/components/Editor';
	import PromoteToPublishModal from '$lib/components/PromoteToPublishModal.svelte';
	import BetaRecruitmentModal from '$lib/components/BetaRecruitmentModal.svelte';
	import BetaFeedbackModal from '$lib/components/BetaFeedbackModal.svelte';
	import WhatsNewSheet from '$lib/components/WhatsNewSheet.svelte';
	import { loginClient } from '$lib/services/auth';
	import { overlayStore } from '$lib/stores/overlay.svelte';
	import type { AuthProviderConfig } from '$lib/services/auth/types';
	import { usePageInitialization } from '$lib/features/editor-page/use-page-initialization.svelte';
	import { useExportActions } from '$lib/features/editor-page/use-export-actions.svelte';

	import { editorModalCommandsStore } from '$lib/stores/editor-modal-commands.svelte';
	import { loginModalStore } from '$lib/stores/login-modal.svelte';
	import { userStore } from '$lib/stores/user.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Access providers from layout data
	const providers = $derived<AuthProviderConfig[]>(page.data.providers || []);

	let autoSave = new AutoSave();
	let showPromoteToPublishModal = $state(false);
	let promoteAfter = $state<'publish' | 'share'>('publish');
	let showBetaRecruitmentModal = $state(false);
	let showBetaFeedbackModal = $state(false);
	let showWhatsNewSheet = $state(false);
	let loginPopoverOpen = $state(false);

	const documentName = $derived(documentStore.activeDocument?.name ?? '');
	let hasSuccessfulPreview = $state(false);
	let newDocDialogOpen = $state(false);
	let initialTemplateId = $state<string | undefined>(undefined);
	let sidebarExpanded = $state(true);
	let mobileView = $state<'editor' | 'preview'>('editor');

	const disableMobile = $derived(page.data.config.features.mobile === false);
	const isNarrowViewport = $derived(responsiveStore.isNarrowViewport);
	const isPortraitViewport = $derived(responsiveStore.isPortraitViewport);
	const showMobileDisabledScreen = $derived(
		disableMobile && (isNarrowViewport || isPortraitViewport)
	);


	function openEditorModal(modal: 'info' | 'import' | 'publish' | 'share') {
		editorModalCommandsStore.openModal(modal);
		if (responsiveStore.isNarrowViewport) {
			mobileView = 'preview';
		}
		rulerStore.setActive(false);
	}

	function handleDocumentInfo() {
		openEditorModal('info');
	}

	function handleMobileViewChange(view: 'editor' | 'preview') {
		mobileView = view;
	}

	function handlePreviewStatusChange(status: boolean) {
		hasSuccessfulPreview = status;
	}

	function handleBetaProgramClick() {
		showBetaRecruitmentModal = true;
	}

	function handleFeedbackClick() {
		showBetaFeedbackModal = true;
	}

	const { initializePage } = usePageInitialization({
		getData: () => data,
		getUrl: () => page.url,
		clearOpenQuery: () => goto(resolve('/'), { replaceState: true })
	});

	const { handleDownload: runDownload, handleDownloadMarkdown } = useExportActions();

	onMount(() => {
		void initializePage();
		const templateId = page.url.searchParams.get('template');
		if (templateId) {
			initialTemplateId = templateId;
			newDocDialogOpen = true;
		}
	});

	async function handleDownload() {
		if (!hasSuccessfulPreview) return;
		await runDownload();
	}

	function handleRulerToggle() {
		editorModalCommandsStore.closeAll();
		rulerStore.toggle();
	}

	function handlePublish() {
		// If guest, show login prompt
		if (documentStore.isGuest) {
			loginModalStore.show('publish', { documentName });
			return;
		}

		// If logged in but document is local, prompt to promote
		if (documentStore.activeDocumentId && documentStore.activeSource === 'local') {
			promoteAfter = 'publish';
			showPromoteToPublishModal = true;
			return;
		}

		openEditorModal('publish');
	}

	function handleShareLink() {
		// Sharing requires a cloud-backed account document.
		// For local documents, route users to the feature login prompt instead of opening Share modal.
		if (documentStore.activeSource === 'local') {
			// Guests need to sign in first; logged-in users should be prompted to promote.
			if (documentStore.isGuest) {
				loginModalStore.show('share', { documentName });
				return;
			}

			promoteAfter = 'share';
			showPromoteToPublishModal = true;
			return;
		}

		openEditorModal('share');
	}

	function handlePromoteSuccess() {
		// After successful promotion, open the intended modal
		if (promoteAfter === 'share') {
			openEditorModal('share');
		} else {
			openEditorModal('publish');
		}
	}

	function handleCollapseSidebar() {
		sidebarExpanded = false;
	}

	async function handleSignOut() {
		try {
			// signOut redirects to callbackUrl, which triggers beforeunload if dirty
			await loginClient.signOut();
		} catch (error) {
			console.error('Sign out failed:', error);
		}
	}

	$effect(() => {
		if (isNarrowViewport && sidebarExpanded) {
			// Register sidebar as an overlay so 'Escape' closes it via global.escape handler
			// Use 'popover' priority (1300) so it closes AFTER modals (1500) are closed
			overlayStore.register('sidebar-mobile', 'popover', handleCollapseSidebar, { suppressAutoClose: true });
			return () => overlayStore.unregister('sidebar-mobile');
		}
	});
</script>

{#if showMobileDisabledScreen}
	<div class="flex h-full w-full items-center justify-center bg-background px-6">
		<div class="max-w-lg text-center space-y-3">
			<h1 class="text-2xl font-semibold tracking-tight">Mobile version coming soon</h1>
			<p class="text-muted-foreground">
				This experience is currently optimized for desktop and landscape layouts. Please use a
				larger screen or rotate your device to continue.
			</p>
		</div>
	</div>
{:else}
	<div class="flex h-full w-full bg-background">
		<Sidebar
			{providers}
			bind:newDocDialogOpen
			bind:isExpanded={sidebarExpanded}
			bind:loginPopoverOpen
			bind:initialTemplateId
			onCollapseSidebar={handleCollapseSidebar}
			onSignOut={handleSignOut}
		/>

		<SidebarBackdrop visible={isNarrowViewport && sidebarExpanded} onClick={handleCollapseSidebar} />

		<main
			class="z-content flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden"
		>
			<TopMenu
				fileName={documentName}
				onDownload={handleDownload}
				onDownloadMarkdown={handleDownloadMarkdown}
				saveStatus={autoSave.saveState.status}
				saveError={autoSave.saveState.errorMessage}
				onDocumentInfo={handleDocumentInfo}
				onRulerToggle={handleRulerToggle}
				onPublish={handlePublish}
				onShareLink={handleShareLink}
				{hasSuccessfulPreview}
				{sidebarExpanded}
				onToggleSidebar={() => (sidebarExpanded = !sidebarExpanded)}
				onBetaProgramClick={handleBetaProgramClick}
				onFeedbackClick={data.feedbackSubmissionEnabled ? handleFeedbackClick : undefined}
				onWhatsNewClick={() => (showWhatsNewSheet = true)}
			/>

			<div class="flex flex-1 min-h-0 overflow-hidden" role="main" aria-label="Document editor">
				<DocumentEditor
					documentId={documentStore.activeDocumentId ?? null}
					hasActiveDocument={!!documentStore.activeDocumentId}
					{autoSave}
					onPreviewStatusChange={handlePreviewStatusChange}
					onCreateNewDocument={() => (newDocDialogOpen = true)}
					{mobileView}
					onMobileViewChange={handleMobileViewChange}
					isDocumentsLoading={documentStore.isLoading}
				/>
			</div>
		</main>
	</div>
{/if}


<PromoteToPublishModal
	open={showPromoteToPublishModal}
	onOpenChange={(open) => (showPromoteToPublishModal = open)}
	{documentName}
	onPromoteSuccess={handlePromoteSuccess}
/>


<BetaRecruitmentModal
	open={showBetaRecruitmentModal}
	onOpenChange={(open) => (showBetaRecruitmentModal = open)}
	userEmail={userStore.user?.email}
/>


{#if data.feedbackSubmissionEnabled}
	<BetaFeedbackModal
		open={showBetaFeedbackModal}
		onOpenChange={(open) => (showBetaFeedbackModal = open)}
	/>
{/if}


<WhatsNewSheet
	open={showWhatsNewSheet}
	onOpenChange={(open) => (showWhatsNewSheet = open)}
/>
