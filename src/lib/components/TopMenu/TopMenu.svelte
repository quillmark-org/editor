<script lang="ts">
	import TitleBar from './TitleBar.svelte';
	import DocumentActions from './DocumentActions.svelte';
	import type { SaveStatus } from '$lib/utils/auto-save.svelte';

	type TopMenuProps = {
		fileName: string;
		onDownload: () => void;
		onDownloadMarkdown?: () => void;
		saveStatus?: SaveStatus;
		saveError?: string;
		onDocumentInfo?: () => void;
		onRulerToggle?: () => void;
		onPublish?: () => void;
		onShareLink?: () => void;
		hasSuccessfulPreview?: boolean;
		sidebarExpanded?: boolean;
		onToggleSidebar?: () => void;
		onBetaProgramClick?: () => void;
		onFeedbackClick?: () => void;
		onWhatsNewClick?: () => void;
	};

	let {
		fileName,
		onDownload,
		onDownloadMarkdown,
		saveStatus = 'idle',
		saveError,
		onDocumentInfo,
		onRulerToggle,
		onPublish,
		onShareLink,
		hasSuccessfulPreview = false,
		sidebarExpanded = false,
		onToggleSidebar,
		onBetaProgramClick,
		onFeedbackClick,
		onWhatsNewClick
	}: TopMenuProps = $props();
</script>

<div
	class="layout-border-b flex min-w-0 items-center justify-between overflow-hidden border-b border-border bg-surface px-4"
	style="height: var(--top-menu-height);"
>
	<TitleBar
		{fileName}
		{saveStatus}
		{saveError}
		{sidebarExpanded}
		{onToggleSidebar}
	/>

	<DocumentActions
		{onDownload}
		{onDownloadMarkdown}
		{onDocumentInfo}
		{onRulerToggle}
		{onPublish}
		{onShareLink}
		{hasSuccessfulPreview}
		{onBetaProgramClick}
		{onFeedbackClick}
		{onWhatsNewClick}
	/>
</div>
