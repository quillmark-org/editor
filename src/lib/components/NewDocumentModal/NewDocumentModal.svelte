<script lang="ts">
	import { browser } from '$app/environment';
	import { Search, Star, FileInput, Loader2, ChevronLeft } from 'lucide-svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import Dialog from '$lib/components/ui/base-dialog.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import { cn } from '$lib/utils/cn';
	import TemplateCard, { type TemplateCardSectionKey } from './TemplateCard.svelte';
	import {
		renderThumbnail,
		THUMBNAIL_CACHE_KEY_PREFIX,
		THUMBNAIL_CACHE_NAME
	} from '$lib/services/thumbnail/service';
	import { generateUniqueName } from '$lib/utils/document-naming';
	import { getErrorMessage } from '$lib/errors';
	import { userStore } from '$lib/stores/user.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { responsiveStore } from '$lib/stores/responsive.svelte';
	import type {
		LibraryTemplateDetail,
		LibraryTemplateListItem,
		LibraryTemplateSortOption
	} from '$lib/services/templates/library-client';
	import {
		listLibraryTemplates,
		listRecentTemplates,
		getLibraryTemplate,
		getStarredTemplateIds,
		starTemplate,
		unstarTemplate
	} from '$lib/services/templates/library-client';
	import {
		prefetchTemplateList,
		getCachedTemplateList
	} from '$lib/services/templates/template-prefetch.svelte';
	import {
		addStarredTemplateId,
		hasStarredTemplateId,
		removeStarredTemplateId,
		replaceStarredTemplateIds
	} from '$lib/services/templates/template-star-hints.svelte';
	import { fade } from 'svelte/transition';

	interface NewDocumentModalProps {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onCreateDocument: (name: string, content: string, sourceTemplateId?: string) => Promise<void>;
		existingDocumentNames?: string[];
		onLoginRequired?: () => void;
		initialTemplateId?: string;
	}

	let {
		open,
		onOpenChange,
		onCreateDocument,
		existingDocumentNames = [],
		onLoginRequired,
		initialTemplateId
	}: NewDocumentModalProps = $props();

	let templates = $state<LibraryTemplateListItem[]>([]);
	let recents = $state<LibraryTemplateListItem[]>([]);
	let listLoading = $state(false);
	let listError = $state<string | null>(null);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	let latestListRequestId = 0;
	let hasLoadedTemplatesOnce = $state(false);
	let showStarredOnly = $state(false);
	let starredFilterLoading = $state(false);
	type GalleryFilter =
		| {
				scope: 'search';
				q: string;
				quillRef?: string[];
				official?: boolean;
				sort?: LibraryTemplateSortOption;
		  }
		| { scope: 'official' }
		| { scope: 'popular' };
	let galleryFilter = $state<GalleryFilter | null>(null);
	let debouncedGalleryFilter = $state<GalleryFilter | null>(null);

	let selectedTemplateId = $state<string | null>(null);
	let selectedCardKey = $state<string | null>(null);
	let shouldScrollSelectedCardIntoView = $state(false);
	let galleryScrollElement = $state<HTMLDivElement | null>(null);
	let homeScrollTopBeforeGallery = $state(0);
	let pendingHomeScrollRestore = $state<number | null>(null);
	let selectedDetail = $state<LibraryTemplateDetail | null>(null);
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);
	let latestDetailRequestId = 0;
	let detailCache = $state<Record<string, LibraryTemplateDetail>>({});
	let documentName = $state('');
	let hasUserEditedName = $state(false);
	let hasUserActivatedSearch = $state(false);
	let isCreating = $state(false);
	let creationError = $state<string | null>(null);

	// Preview state
	let previewHoverCardKey = $state<string | null>(null);
	let quickLookPreview = $state<{
		cardKey: string;
		template: LibraryTemplateListItem;
		section: TemplateCardSectionKey;
	} | null>(null);
	let isQuickLookOpen = $state(false);

	let starredHydrationPromise: Promise<void> | null = null;
	let hasHydratedStarredIds = false;

	/** Unified client starred state shared across modals. */
	function templateIsStarredForUser(templateId: string): boolean {
		return hasStarredTemplateId(templateId);
	}
	let thumbnailUrls = $state<Record<string, string>>({});
	let thumbnailLoading = $state<Record<string, boolean>>({});
	let thumbnailErrors = $state<Record<string, boolean>>({});
	let thumbnailUrlOrder = $state<string[]>([]);
	let detailCacheOrder = $state<string[]>([]);
	let popularTemplateOrder = $state<string[]>([]);
	const HOME_SECTION_MAX_ITEMS = 10;
	const HOME_RECENTS_MAX_ITEMS = 5;
	const HOME_POPULAR_PULL_MAX_ITEMS = 100;
	/** Popular section: stars at 1×, template imports (downloads) at 0.1× */
	const POPULAR_IMPORT_WEIGHT = 0.1;
	const MAX_THUMBNAIL_URLS = 50;
	const MAX_DETAIL_CACHE = 25;
	type SeeAllSectionKey = 'official' | 'popular';
	let seeAllCounts = $state<Record<SeeAllSectionKey, number>>({
		official: 0,
		popular: 0
	});

	type TemplateSectionKey = TemplateCardSectionKey;
	const USAF_DEFAULT_TEMPLATE_TITLE = 'usaf memo';
	const USAF_DEFAULT_QUILL_REF = 'usaf_memo';

	let officialTemplates = $derived(templates.filter((template) => template.is_official));
	let communityTemplates = $derived(templates.filter((template) => !template.is_official));

	let filteredOfficial = $derived(
		showStarredOnly
			? officialTemplates.filter((template) => templateIsStarredForUser(template.id))
			: officialTemplates
	);
	let filteredCommunity = $derived(
		showStarredOnly
			? communityTemplates.filter((template) => templateIsStarredForUser(template.id))
			: communityTemplates
	);
	let popularTemplates = $derived.by(() => {
		const orderIndex = new Map(popularTemplateOrder.map((id, index) => [id, index]));
		return [...filteredCommunity].sort((a, b) => {
			const indexA = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
			const indexB = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
			return indexA - indexB;
		});
	});
	let filteredRecents = $derived(
		showStarredOnly
			? recents.filter((template) => templateIsStarredForUser(template.id))
			: recents
	);
	let officialTotalForSeeAll = $derived(Math.max(seeAllCounts.official, officialTemplates.length));
	let popularTotalForSeeAll = $derived(Math.max(seeAllCounts.popular, communityTemplates.length));

	// Flat list of all starred templates (deduplicated across recents + library)
	let allStarredTemplates = $derived.by(() => {
		if (!showStarredOnly) return [];
		const seen = new SvelteSet<string>();
		const result: LibraryTemplateListItem[] = [];
		for (const template of [...recents, ...templates]) {
			if (templateIsStarredForUser(template.id) && !seen.has(template.id)) {
				seen.add(template.id);
				result.push(template);
			}
		}
		return result;
	});

	let isGalleryMode = $derived(galleryFilter !== null);
	let galleryQuery = $derived(getFilterQuery(galleryFilter).trim());
	let debouncedGalleryQuery = $derived(getFilterQuery(debouncedGalleryFilter).trim());
	let isGalleryTransitioning = $derived(
		isGalleryMode && galleryQuery !== debouncedGalleryQuery && galleryQuery.length > 0
	);
	let activeGalleryFilter = $derived(debouncedGalleryFilter ?? galleryFilter);
	let galleryTemplates = $derived.by(() => {
		if (!isGalleryMode) return [];
		const activeFilter = activeGalleryFilter;
		let source = templates;
		if (activeFilter?.scope === 'official') {
			source = source.filter((template) => template.is_official);
		} else if (activeFilter?.scope === 'popular') {
			source = source.filter((template) => !template.is_official);
		} else if (activeFilter?.scope === 'search') {
			if (activeFilter.official === true) {
				source = source.filter((template) => template.is_official);
			} else if (activeFilter.official === false) {
				source = source.filter((template) => !template.is_official);
			}
		}
		return showStarredOnly ? source.filter((template) => templateIsStarredForUser(template.id)) : source;
	});
	let galleryCardSection = $derived<TemplateSectionKey>(
		getGallerySectionKey(activeGalleryFilter)
	);
	let gallerySectionHeading = $derived<string | null>(
		getGallerySectionHeading(activeGalleryFilter)
	);
	let isSeeAllFilteredSection = $derived(
		activeGalleryFilter?.scope === 'official' || activeGalleryFilter?.scope === 'popular'
	);
	let isGalleryLoadingView = $derived(
		isGalleryMode && galleryTemplates.length === 0 && (isGalleryTransitioning || listLoading)
	);
	let showGalleryEmptyState = $derived(
		isGalleryMode &&
			!isGalleryLoadingView &&
			hasLoadedTemplatesOnce &&
			!listLoading &&
			galleryTemplates.length === 0
	);
	let showHomeEmptyState = $derived(
		!isGalleryMode &&
			hasLoadedTemplatesOnce &&
			!listLoading &&
			(showStarredOnly
				? allStarredTemplates.length === 0
				: filteredOfficial.length === 0 &&
					filteredRecents.length === 0 &&
					popularTemplates.length === 0)
	);

	// Flat ordered list of templates matching render order — used for preview navigation
	let orderedVisibleTemplates = $derived.by(() => {
		type Entry = { template: LibraryTemplateListItem; section: TemplateSectionKey };
		if (isGalleryMode) {
			return galleryTemplates.map((t): Entry => ({ template: t, section: galleryCardSection }));
		}
		const result: Entry[] = [];
		for (const t of filteredRecents.slice(0, HOME_RECENTS_MAX_ITEMS)) result.push({ template: t, section: 'recents' });
		for (const t of filteredOfficial.slice(0, HOME_SECTION_MAX_ITEMS)) result.push({ template: t, section: 'official' });
		for (const t of popularTemplates.slice(0, HOME_SECTION_MAX_ITEMS)) result.push({ template: t, section: 'popular' });
		return result;
	});

	let orderedTemplatesByCardKey = $derived.by(() => {
		const map: Record<string, { template: LibraryTemplateListItem; section: TemplateSectionKey }> = {};
		for (const entry of orderedVisibleTemplates) {
			map[getCardKey(entry.section, entry.template.id)] = entry;
		}
		return map;
	});

	let isMobileViewport = $derived(responsiveStore.isNarrowViewport);

	let isValid = $derived(documentName.trim().length > 0 && selectedDetail !== null);
	let mobileStep = $state<'browse' | 'create'>('browse');

	function formatTemplateDate(value: string | null | undefined): string {
		if (!value) return 'Unknown';
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return 'Unknown';
		return parsed.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function clearThumbnailUrls() {
		for (const url of Object.values(thumbnailUrls)) {
			URL.revokeObjectURL(url);
		}
		thumbnailUrls = {};
		thumbnailLoading = {};
		thumbnailErrors = {};
	}

	async function ensureTemplateDetail(id: string): Promise<LibraryTemplateDetail> {
		const cached = detailCache[id];
		if (cached) {
			return { ...cached, is_starred: templateIsStarredForUser(id) };
		}
		const detail = await getLibraryTemplate(id);
		// Merge star state from the user's starred set (the CDN-cached
		// detail response always has is_starred: false).
		const merged = { ...detail, is_starred: templateIsStarredForUser(id) };
		detailCacheOrder = [...detailCacheOrder, id];
		if (detailCacheOrder.length > MAX_DETAIL_CACHE) {
			const evicted = detailCacheOrder[0];
			detailCacheOrder = detailCacheOrder.slice(1);
			const { [evicted]: _evicted, ...rest } = detailCache;
			detailCache = { ...rest, [id]: merged };
		} else {
			detailCache = { ...detailCache, [id]: merged };
		}
		return merged;
	}

	async function ensureThumbnail(template: LibraryTemplateListItem) {
		if (!browser || thumbnailUrls[template.id] || thumbnailLoading[template.id] || thumbnailErrors[template.id]) {
			return;
		}

		thumbnailLoading = { ...thumbnailLoading, [template.id]: true };
		try {
			let blob: Blob | null = null;
			const hash = template.content_hash ?? template.id;
			const cache = await caches.open(THUMBNAIL_CACHE_NAME);
			const cacheKey = `${THUMBNAIL_CACHE_KEY_PREFIX}${hash}`;
			const cachedResponse = await cache.match(cacheKey);
			if (cachedResponse) {
				blob = await cachedResponse.blob();
			} else {
				const detail = await ensureTemplateDetail(template.id);
				const detailHash = detail.content_hash ?? detail.id;
				blob = await renderThumbnail(detail.content, detailHash);
			}

			if (!blob) {
				throw new Error('Failed to create thumbnail blob');
			}
			const objectUrl = URL.createObjectURL(blob);
			thumbnailUrlOrder = [...thumbnailUrlOrder, template.id];
			if (thumbnailUrlOrder.length > MAX_THUMBNAIL_URLS) {
				const evicted = thumbnailUrlOrder[0];
				thumbnailUrlOrder = thumbnailUrlOrder.slice(1);
				URL.revokeObjectURL(thumbnailUrls[evicted]);
				const { [evicted]: _evicted, ...restUrls } = thumbnailUrls;
				thumbnailUrls = { ...restUrls, [template.id]: objectUrl };
			} else {
				thumbnailUrls = { ...thumbnailUrls, [template.id]: objectUrl };
			}
		} catch (error) {
			console.warn('Failed to render thumbnail', error);
			thumbnailErrors = { ...thumbnailErrors, [template.id]: true };
		} finally {
			thumbnailLoading = { ...thumbnailLoading, [template.id]: false };
		}
	}

	function getFilterQuery(filter: GalleryFilter | null): string {
		if (!filter) return '';
		if (filter.scope === 'search') return filter.q ?? '';
		return '';
	}

	function clearGalleryFilter() {
		galleryFilter = null;
		debouncedGalleryFilter = null;
	}

	function captureHomeScrollPosition() {
		if (!browser || !galleryScrollElement || isGalleryMode) return;
		homeScrollTopBeforeGallery = galleryScrollElement.scrollTop;
	}

	function buildSeeAllFilter(section: SeeAllSectionKey): GalleryFilter {
		switch (section) {
			case 'official':
				return { scope: 'official' };
			case 'popular':
				return { scope: 'popular' };
		}
	}

	function composeFilterWithQuery(filter: GalleryFilter | null, q: string): GalleryFilter | null {
		const normalized = q.trim();
		if (!filter) {
			return normalized ? { scope: 'search', q: normalized, sort: 'recommended' } : null;
		}
		if (filter.scope === 'search') {
			return normalized ? { ...filter, q: normalized } : null;
		}
		if (filter.scope === 'official') {
			return normalized
				? { scope: 'search', q: normalized, official: true, sort: 'recommended' }
				: { scope: 'official' };
		}
		return normalized
			? { scope: 'search', q: normalized, official: false, sort: 'stars' }
			: { scope: 'popular' };
	}

	function getGallerySectionKey(filter: GalleryFilter | null): TemplateSectionKey {
		if (!filter) return 'search';
		if (filter.scope === 'search') {
			if (filter.official === true) return 'official';
			if (filter.official === false) return 'popular';
			return 'search';
		}
		return filter.scope;
	}

	function getGallerySectionHeading(filter: GalleryFilter | null): string | null {
		const section = getGallerySectionKey(filter);
		switch (section) {
			case 'official':
				return 'Official';
			case 'popular':
				return 'Popular';
			default:
				return null;
		}
	}

	function scheduleGalleryFetch(nextFilter: GalleryFilter | null, hasExistingContent: boolean) {
		if (searchTimeout) clearTimeout(searchTimeout);
		const query = getFilterQuery(nextFilter).trim();
		if (!query) {
			debouncedGalleryFilter = nextFilter;
			void fetchGallery(nextFilter, hasExistingContent);
			return;
		}
		searchTimeout = setTimeout(() => {
			debouncedGalleryFilter = nextFilter;
			void fetchGallery(nextFilter, hasExistingContent);
		}, 300);
	}

	/**
	 * Reshape the cached recommended-list snapshot into the home view's
	 * `templates` + `popularTemplateOrder` state. Called both from the
	 * imperative `fetchGallery(null)` path (first open) and from the live-
	 * update `$effect` below (when the snapshot refreshes while the modal is
	 * open).
	 */
	function applyHomeListSnapshot(result: { templates: LibraryTemplateListItem[] }) {
		const homeOfficialTemplates = result.templates
			.filter((template) => template.is_official)
			.slice(0, HOME_SECTION_MAX_ITEMS);
		const homePopularTemplates = result.templates
			.filter((template) => !template.is_official)
			.sort(
				(a, b) =>
					b.star_count + POPULAR_IMPORT_WEIGHT * b.import_count -
					(a.star_count + POPULAR_IMPORT_WEIGHT * a.import_count)
			)
			.slice(0, HOME_POPULAR_PULL_MAX_ITEMS);
		templates = [...homeOfficialTemplates, ...homePopularTemplates];
		popularTemplateOrder = homePopularTemplates.map((template) => template.id);
	}

	async function fetchGallery(filter: GalleryFilter | null, hasExistingContent = false) {
		const requestId = ++latestListRequestId;

		if (!hasExistingContent) {
			listLoading = true;
		}
		if (!hasExistingContent) {
			listError = null;
		}

		try {
			let result: { templates: LibraryTemplateListItem[]; total?: number };
			if (!filter) {
				result = await prefetchTemplateList();
			} else if (filter.scope === 'official') {
				result = await listLibraryTemplates({
					official: true,
					sort: 'recommended',
					limit: 100
				});
			} else if (filter.scope === 'popular') {
				result = await listLibraryTemplates({
					official: false,
					sort: 'stars',
					limit: 100
				});
			} else {
				result = await listLibraryTemplates({
					q: filter.q || undefined,
					quillRef: filter.quillRef,
					official: filter.official,
					sort: filter.sort ?? 'recommended',
					limit: 100
				});
			}
			if (requestId !== latestListRequestId) return;

			// Prime loading states before swapping result sets so newly-mounted cards
			// do not flash the non-loading placeholder for a frame.
			if (filter) {
				for (const template of result.templates.slice(0, 24)) {
					void ensureThumbnail(template);
				}
			}

			if (!filter) {
				applyHomeListSnapshot(result);
				if (userStore.isAuthenticated) {
					try {
						const recentResult = await listRecentTemplates({
							limit: HOME_RECENTS_MAX_ITEMS
						});
						recents = recentResult.templates;
					} catch {
						recents = [];
					}
				} else {
					recents = [];
				}
				try {
					const [officialCountResult, popularCountResult] = await Promise.all([
						listLibraryTemplates({
							official: true,
							sort: 'recommended',
							limit: 1
						}),
						listLibraryTemplates({
							official: false,
							sort: 'stars',
							limit: 1
						})
					]);
					seeAllCounts = {
						...seeAllCounts,
						official: officialCountResult.total,
						popular: popularCountResult.total
					};
				} catch {
					seeAllCounts = {
						...seeAllCounts,
						official: officialTemplates.length,
						popular: communityTemplates.length
					};
				}
			} else if (filter.scope === 'official') {
				templates = result.templates;
				seeAllCounts = { ...seeAllCounts, official: result.total ?? result.templates.length };
			} else if (filter.scope === 'popular') {
				templates = result.templates;
				seeAllCounts = { ...seeAllCounts, popular: result.total ?? result.templates.length };
			} else {
				templates = result.templates;
			}

			void Promise.all(recents.map((template) => ensureThumbnail(template)));

			if (!selectedTemplateId) {
				if (!filter) {
					if (initialTemplateId) {
						const allLoaded = [...recents, ...templates];
						const found = allLoaded.find((t) => t.id === initialTemplateId);
						if (found) {
							const section: TemplateSectionKey = recents.some((t) => t.id === found.id)
								? 'recents'
								: found.is_official
									? 'official'
									: 'popular';
							handleSelectTemplate(found, section);
						} else {
							// Template is outside the home list: fetch its detail then replace
							// the last visible card in its section so the grid stays the same size.
							const officialSnap = templates.filter((t) => t.is_official);
							const popularOrderSnap = popularTemplateOrder.slice();
							try {
								const detail = await ensureTemplateDetail(initialTemplateId);
								if (requestId !== latestListRequestId) return;
								if (detail.is_official) {
									const lastIdx = Math.min(HOME_SECTION_MAX_ITEMS, officialSnap.length) - 1;
									const target = officialSnap[lastIdx];
									if (target) templates = templates.map((t) => (t.id === target.id ? detail : t));
									handleSelectTemplate(detail, 'official');
								} else {
									const lastId = popularOrderSnap[HOME_SECTION_MAX_ITEMS - 1];
									const target = lastId ? templates.find((t) => t.id === lastId) : null;
									if (target) {
										templates = templates.map((t) => (t.id === target.id ? detail : t));
										popularTemplateOrder = popularTemplateOrder.map((id) =>
											id === lastId ? detail.id : id
										);
									}
									handleSelectTemplate(detail, 'popular');
								}
							} catch {
								selectedTemplateId = initialTemplateId;
								void fetchTemplateDetail(initialTemplateId);
							}
						}
					} else {
						const defaultSelection = getDefaultSelection(templates, recents);
						if (defaultSelection) {
							handleSelectTemplate(defaultSelection.template, defaultSelection.section);
						}
					}
				} else {
					const firstTemplate = result.templates[0];
					if (firstTemplate) {
						const section: TemplateSectionKey =
							filter.scope === 'search'
								? 'search'
								: filter.scope === 'official'
									? 'official'
									: 'popular';
						handleSelectTemplate(firstTemplate, section);
					}
				}
			}

			if (showStarredOnly) {
				await ensureStarredIdsLoaded();
			}
		} catch (error) {
			if (requestId !== latestListRequestId) return;
			console.error('Failed to fetch templates:', error);
			if (hasExistingContent) {
				toastStore.error('Failed to refresh templates. Showing cached results.');
			} else {
				listError = getErrorMessage(error, 'Failed to load templates');
			}
		} finally {
			if (requestId === latestListRequestId) {
				listLoading = false;
				hasLoadedTemplatesOnce = true;
			}
		}
	}

	function handleSeeAllClick(section: SeeAllSectionKey) {
		captureHomeScrollPosition();
		const filter = buildSeeAllFilter(section);
		galleryFilter = filter;
		scheduleGalleryFetch(filter, templates.length > 0 || recents.length > 0);
		if (browser && galleryScrollElement) {
			galleryScrollElement.scrollTop = 0;
		}
	}

	async function fetchTemplateDetail(id: string) {
		const requestId = ++latestDetailRequestId;
		detailLoading = true;
		detailError = null;
		try {
			const detail = await ensureTemplateDetail(id);
			// Ignore stale responses from previous selections/open cycles.
			if (requestId !== latestDetailRequestId || selectedTemplateId !== id) return;
			selectedDetail = detail;
			if (!hasUserEditedName) {
				documentName = generateUniqueName(detail.title, existingDocumentNames);
			}
		} catch (error) {
			if (requestId !== latestDetailRequestId) return;
			detailError = getErrorMessage(error, 'Failed to load template details');
			console.error('Failed to fetch template detail:', error);
		} finally {
			if (requestId === latestDetailRequestId) {
				detailLoading = false;
			}
		}
	}

	function openQuickLook(
		entry: { template: LibraryTemplateListItem; section: TemplateSectionKey },
		cardKey: string
	) {
		quickLookPreview = { cardKey, template: entry.template, section: entry.section };
		isQuickLookOpen = true;
		handleSelectTemplate(entry.template, entry.section);
	}

	function closeQuickLook() {
		isQuickLookOpen = false;
	}

	function onQuickLookOutroEnd() {
		if (!isQuickLookOpen) quickLookPreview = null;
	}

	function getCardKey(section: TemplateSectionKey, templateId: string) {
		return `${section}:${templateId}`;
	}

	function isSelectedCard(section: TemplateSectionKey, templateId: string) {
		return selectedCardKey === getCardKey(section, templateId);
	}

	function handleSelectTemplate(
		template: LibraryTemplateListItem,
		section: TemplateSectionKey,
		options: { scrollIntoView?: boolean } = {}
	) {
		shouldScrollSelectedCardIntoView = options.scrollIntoView === true;
		selectedCardKey = getCardKey(section, template.id);
		if (selectedTemplateId === template.id) {
			if (!hasUserEditedName && !documentName.trim() && selectedDetail?.id === template.id) {
				documentName = generateUniqueName(selectedDetail.title, existingDocumentNames);
			}
			return;
		}
		selectedTemplateId = template.id;
		const cachedDetail = detailCache[template.id];
		selectedDetail = cachedDetail ?? null;
		void fetchTemplateDetail(template.id);
	}

	async function handleDoubleClickTemplate(
		template: LibraryTemplateListItem,
		section: TemplateSectionKey
	) {
		handleSelectTemplate(template, section);
		if (selectedDetail?.id !== template.id) {
			detailLoading = true;
			detailError = null;
			try {
				const detail = await ensureTemplateDetail(template.id);
				selectedDetail = detail;
				if (!hasUserEditedName) {
					documentName = generateUniqueName(detail.title, existingDocumentNames);
				}
			} catch (error) {
				detailError = getErrorMessage(error, 'Failed to load template details');
				return;
			} finally {
				detailLoading = false;
			}
		}
		await handleCreate();
	}

	function navigateSelection(direction: -1 | 1): boolean {
		const list = orderedVisibleTemplates;
		if (list.length === 0) return false;

		const currentKey = quickLookPreview?.cardKey ?? selectedCardKey;
		let idx = currentKey
			? list.findIndex((e) => getCardKey(e.section, e.template.id) === currentKey)
			: -1;
		if (idx === -1) idx = direction > 0 ? -1 : list.length;

		const nextIdx = idx + direction;
		if (nextIdx < 0 || nextIdx >= list.length) return false;

		const next = list[nextIdx];
		const nextKey = getCardKey(next.section, next.template.id);
		handleSelectTemplate(next.template, next.section, { scrollIntoView: true });
		if (quickLookPreview) {
			quickLookPreview = { cardKey: nextKey, template: next.template, section: next.section };
			isQuickLookOpen = true;
		}
		// Focus + scroll is handled by the selection-focus effect.
		return true;
	}

	function extractCardKeyFromEventTarget(target: EventTarget | null): string | null {
		if (!(target instanceof HTMLElement)) return null;
		return target.closest<HTMLElement>('[data-card-key]')?.dataset.cardKey ?? null;
	}

	function isTextInputTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tagName = target.tagName;
		if (tagName === 'INPUT' || tagName === 'TEXTAREA') return true;
		return target.isContentEditable;
	}

	function handleModalKeydown(event: KeyboardEvent) {
		if (!open || !browser || isMobileViewport) return;

		if (event.key === ' ') {
			if (isTextInputTarget(event.target)) return;
			if (isQuickLookOpen) {
				event.preventDefault();
				event.stopPropagation();
				closeQuickLook();
				return;
			}
			const focusedCardKey = extractCardKeyFromEventTarget(event.target);
			const previewSourceKey = focusedCardKey ?? previewHoverCardKey ?? selectedCardKey;
			if (!previewSourceKey) return;
			const entry = orderedTemplatesByCardKey[previewSourceKey];
			if (!entry || !thumbnailUrls[entry.template.id]) return;
			event.preventDefault();
			event.stopPropagation();
			openQuickLook(entry, previewSourceKey);
			return;
		}

		if (event.key === 'Escape' && isQuickLookOpen) {
			event.preventDefault();
			event.stopPropagation();
			closeQuickLook();
			return;
		}

		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			if (isTextInputTarget(event.target)) return;
			const direction = event.key === 'ArrowLeft' ? -1 : 1;
			if (navigateSelection(direction)) {
				event.preventDefault();
			}
			return;
		}
	}

	function handlePreviewHoverStart(cardKey: string) {
		previewHoverCardKey = cardKey;
	}

	function handlePreviewHoverEnd(cardKey: string) {
		if (previewHoverCardKey === cardKey) {
			previewHoverCardKey = null;
		}
	}

	function isStaticUsafDefaultTemplate(template: LibraryTemplateListItem) {
		if (!template.is_official) return false;

		const normalizedTitle = template.title.trim().toLowerCase();
		const normalizedQuillRef = (template.quill_ref ?? '').trim().toLowerCase();
		return (
			normalizedQuillRef === USAF_DEFAULT_QUILL_REF && normalizedTitle === USAF_DEFAULT_TEMPLATE_TITLE
		);
	}

	function getDefaultSelection(
		allTemplates: LibraryTemplateListItem[],
		recentTemplates: LibraryTemplateListItem[]
	): { template: LibraryTemplateListItem; section: TemplateSectionKey } | null {
		const newestRecentTemplate = recentTemplates[0];
		if (newestRecentTemplate) {
			return { template: newestRecentTemplate, section: 'recents' };
		}

		const usafDefaultTemplate = allTemplates.find(isStaticUsafDefaultTemplate);
		if (usafDefaultTemplate) {
			return { template: usafDefaultTemplate, section: 'official' };
		}

		const firstOfficialTemplate = allTemplates.find((template) => template.is_official);
		if (firstOfficialTemplate) {
			return { template: firstOfficialTemplate, section: 'official' };
		}

		const firstTemplate = allTemplates[0];
		if (firstTemplate) {
			return {
				template: firstTemplate,
				section: firstTemplate.is_official ? 'official' : 'popular'
			};
		}

		return null;
	}

	function replaceStarredIds(ids: Iterable<string>) {
		replaceStarredTemplateIds(ids);
	}

	async function ensureStarredIdsLoaded(force = false) {
		if (!userStore.isAuthenticated) {
			hasHydratedStarredIds = false;
			replaceStarredIds([]);
			return;
		}
		if (!force && hasHydratedStarredIds) {
			return;
		}
		if (!starredHydrationPromise) {
			starredHydrationPromise = getStarredTemplateIds()
				.then((ids) => {
					hasHydratedStarredIds = true;
					replaceStarredIds(ids);
				})
				.catch(() => {
					hasHydratedStarredIds = false;
					replaceStarredIds([]);
				})
				.finally(() => {
					starredHydrationPromise = null;
				});
		}
		return starredHydrationPromise;
	}

	async function toggleStarredOnly() {
		if (!userStore.isAuthenticated) {
			onLoginRequired?.();
			return;
		}
		showStarredOnly = !showStarredOnly;
		if (showStarredOnly) {
			starredFilterLoading = true;
			try {
				await ensureStarredIdsLoaded();
			} finally {
				starredFilterLoading = false;
			}
		}
	}

	async function handleToggleStar(templateId?: string) {
		const targetId = templateId ?? selectedDetail?.id;
		if (!targetId) return;
		if (!userStore.isAuthenticated) {
			onLoginRequired?.();
			return;
		}

		let currentDetail = detailCache[targetId];
		if (!currentDetail) {
			try {
				currentDetail = await ensureTemplateDetail(targetId);
			} catch {
				toastStore.error('Failed to load template details');
				return;
			}
		}

		const wasStarred = currentDetail.is_starred;
		const prevCount = currentDetail.star_count;

		// Optimistic update — toggle star in both the user's set and the detail cache
		if (wasStarred) {
			removeStarredTemplateId(targetId);
		} else {
			addStarredTemplateId(targetId);
		}

		const nextDetail = {
			...currentDetail,
			is_starred: !wasStarred,
			star_count: wasStarred ? prevCount - 1 : prevCount + 1
		};
		detailCache = { ...detailCache, [nextDetail.id]: nextDetail };
		if (selectedDetail?.id === nextDetail.id) {
			selectedDetail = nextDetail;
		}
		templates = templates.map((template) =>
			template.id === nextDetail.id ? { ...template, star_count: nextDetail.star_count } : template
		);
		recents = recents.map((template) =>
			template.id === nextDetail.id ? { ...template, star_count: nextDetail.star_count } : template
		);

		try {
			const result = wasStarred
				? await unstarTemplate(nextDetail.id)
				: await starTemplate(nextDetail.id);

			const synced = { ...nextDetail, star_count: result.star_count, is_starred: !wasStarred };
			detailCache = { ...detailCache, [synced.id]: synced };
			if (selectedDetail?.id === synced.id) {
				selectedDetail = synced;
			}
			templates = templates.map((template) =>
				template.id === synced.id ? { ...template, star_count: result.star_count } : template
			);
			recents = recents.map((template) =>
				template.id === synced.id ? { ...template, star_count: result.star_count } : template
			);
		} catch (error) {
			// Revert the optimistic shared starred-state update
			if (wasStarred) {
				addStarredTemplateId(targetId);
			} else {
				removeStarredTemplateId(targetId);
			}

			const reverted = {
				...nextDetail,
				is_starred: wasStarred,
				star_count: prevCount
			};
			detailCache = { ...detailCache, [reverted.id]: reverted };
			if (selectedDetail?.id === reverted.id) {
				selectedDetail = reverted;
			}
			templates = templates.map((template) =>
				template.id === reverted.id ? { ...template, star_count: prevCount } : template
			);
			recents = recents.map((template) =>
				template.id === reverted.id ? { ...template, star_count: prevCount } : template
			);
			toastStore.error(getErrorMessage(error, 'Failed to update star'));
		}
	}

	async function handleCreate() {
		if (!isValid || !selectedDetail || isCreating) return;

		isCreating = true;
		creationError = null;
		try {
			await onCreateDocument(documentName.trim(), selectedDetail.content, selectedDetail.id);
			resetAndClose();
		} catch (error) {
			creationError = getErrorMessage(error, 'Failed to create document. Please try again.');
			console.error('Failed to create document:', error);
		} finally {
			isCreating = false;
		}
	}

	function resetAndClose() {
		// Invalidate in-flight detail requests and clear selection state between opens.
		latestDetailRequestId += 1;
		selectedTemplateId = null;
		selectedCardKey = null;
		selectedDetail = null;
		detailLoading = false;
		clearGalleryFilter();
		documentName = '';
		hasUserEditedName = false;
		hasUserActivatedSearch = false;
		isCreating = false;
		previewHoverCardKey = null;
		quickLookPreview = null;
		isQuickLookOpen = false;
		creationError = null;
		listError = null;
		detailError = null;
		showStarredOnly = false;
		if (browser) history.replaceState(null, '', '/');
		homeScrollTopBeforeGallery = 0;
		pendingHomeScrollRestore = null;
		mobileStep = 'browse';
		onOpenChange(false);
	}

	function handleSearchInput(event: Event) {
		hasUserActivatedSearch = true;
		const value = (event.currentTarget as HTMLInputElement).value;
		const nextFilter = composeFilterWithQuery(galleryFilter, value);
		galleryFilter = nextFilter;
		scheduleGalleryFetch(nextFilter, templates.length > 0 || recents.length > 0);
	}

	function handleClearGalleryFilter() {
		pendingHomeScrollRestore = homeScrollTopBeforeGallery;
		clearGalleryFilter();
		void fetchGallery(null, templates.length > 0 || recents.length > 0);
	}

	function handleSubmit(event: Event) {
		event.preventDefault();
		if (isValid && !isCreating) {
			void handleCreate();
		}
	}

	$effect(() => {
		if (open && browser) {
			void fetchGallery(null);
			void ensureStarredIdsLoaded();
		}
		return () => {
			if (searchTimeout) clearTimeout(searchTimeout);
		};
	});

	// Keep detail pane in sync when shared starred state changes without a re-fetch.
	$effect(() => {
		const id = selectedTemplateId;
		if (!id || !selectedDetail || selectedDetail.id !== id) return;
		const nextStar = templateIsStarredForUser(id);
		if (selectedDetail.is_starred === nextStar) return;
		const next = { ...selectedDetail, is_starred: nextStar };
		selectedDetail = next;
		detailCache = { ...detailCache, [id]: next };
	});

	$effect(() => {
		return () => {
			clearThumbnailUrls();
		};
	});

	// Keep the browser URL in sync with the selected template so users can
	// share the link by copying from the address bar at any time.
	$effect(() => {
		if (!open || !browser) return;
		if (selectedTemplateId) {
			history.replaceState(null, '', `/?template=${selectedTemplateId}`);
		}
	});

	// Live-update the home view when the cached recommended list refreshes
	// (sidebar-hover throttled refetch or post-publish invalidate). The
	// snapshot keeps the previous value visible until the new one arrives, so
	// the section swap is silent — no loading flash.
	$effect(() => {
		if (!open || isGalleryMode) return;
		const snapshot = getCachedTemplateList();
		if (!snapshot) return;
		applyHomeListSnapshot(snapshot);
	});

	$effect(() => {
		if (!open || isGalleryMode) return;
		const homePreviewTemplates = showStarredOnly
			? allStarredTemplates
			: [
					...filteredRecents.slice(0, HOME_RECENTS_MAX_ITEMS),
					...filteredOfficial.slice(0, HOME_SECTION_MAX_ITEMS),
					...popularTemplates.slice(0, HOME_SECTION_MAX_ITEMS)
				];
		for (const template of homePreviewTemplates) {
			void ensureThumbnail(template);
		}
	});

	$effect(() => {
		if (!open || !isGalleryMode) return;
		for (const template of galleryTemplates.slice(0, 24)) {
			void ensureThumbnail(template);
		}
	});

	// Keep DOM focus on the selected template card. Skipped when the user is
	// actively typing in a text input so search/document-name entry is not
	// interrupted by async selection changes (e.g. after a search fetch).
	// The search bar is only treated as "active" once the user has actually typed
	// in it — focus-trap auto-focusing it on open should not block the card focus.
	$effect(() => {
		if (!open || !browser || isMobileViewport) return;
		if (!selectedCardKey) return;
		const key = selectedCardKey;
		const shouldScroll = shouldScrollSelectedCardIntoView;
		if (shouldScrollSelectedCardIntoView) {
			shouldScrollSelectedCardIntoView = false;
		}
		const active = document.activeElement;
		const isDocumentNameInput = active instanceof HTMLElement && active.id === 'new-doc-name';
		if (isDocumentNameInput) return;
		if (isTextInputTarget(active) && hasUserActivatedSearch) return;

		requestAnimationFrame(() => {
			const el = document.querySelector<HTMLButtonElement>(
				`[data-card-key="${CSS.escape(key)}"]`
			);
			if (!el) return;
			el.focus({ preventScroll: true });
			if (shouldScroll) {
				el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
			}
		});
	});

	$effect(() => {
		if (!open || !browser || !galleryScrollElement) return;
		if (pendingHomeScrollRestore === null || isGalleryMode) return;
		const restoreTop = pendingHomeScrollRestore;
		pendingHomeScrollRestore = null;
		requestAnimationFrame(() => {
			if (!galleryScrollElement) return;
			galleryScrollElement.scrollTop = restoreTop;
		});
	});

</script>

<svelte:document onkeydown={handleModalKeydown} />

{#if open}
	<Dialog
		{open}
		onOpenChange={(val) => {
			if (!val) resetAndClose();
		}}
		hideCloseButton={false}
	closeOnEscape={!isCreating && !isQuickLookOpen}
		closeOnOutsideClick={!isCreating}
		size={isMobileViewport ? 'fullscreen' : 'panel'}
		class={isMobileViewport ? 'new-doc-mobile-dialog' : undefined}
		headerClass={isMobileViewport ? 'px-3 py-2' : 'px-5 py-2'}
	>
		{#snippet header()}
			{#if isMobileViewport && mobileStep === 'create'}
				<h2 class="text-lg font-semibold text-foreground">New Document</h2>
			{:else}
				<div
					class={cn(
						'flex w-full min-w-0 items-center gap-3',
						isMobileViewport ? 'flex-col items-stretch gap-2' : 'justify-between'
					)}
				>
					<h2 class="shrink-0 text-lg font-semibold text-foreground">New Document</h2>
					<div
						class={cn('flex min-w-0 items-center gap-2', isMobileViewport ? 'w-full' : 'shrink-0')}
					>
						{#if isGalleryMode}
							<button
								type="button"
								class="inline-flex h-8 items-center rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
								onclick={handleClearGalleryFilter}
							>
								<ChevronLeft class="mr-1 h-3.5 w-3.5" />
								Back
							</button>
						{/if}
						<div class={cn('relative min-w-0', isMobileViewport ? 'min-w-0 flex-1' : 'w-64')}>
							<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								type="text"
								placeholder="Search templates"
								value={galleryQuery}
								oninput={handleSearchInput}
								class="h-8 w-full rounded-md border border-border bg-background py-1 pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
							/>
						</div>
						<Button
							variant={showStarredOnly ? 'default' : 'outline'}
							size="sm"
							class={cn('h-8 shrink-0', isMobileViewport && 'px-2')}
							onclick={toggleStarredOnly}
						>
							<Star class={cn('h-4 w-4', !isMobileViewport && 'mr-1', showStarredOnly && 'fill-yellow-400 text-yellow-400')} />
							{#if !isMobileViewport}
								Starred
							{/if}
						</Button>
					</div>
				</div>
			{/if}
		{/snippet}

		{#snippet content()}
			{#if isMobileViewport && mobileStep === 'create'}
				<!-- Mobile: Step 2 – name and create -->
				<div class="new-doc-mobile-create">
					<button type="button" class="new-doc-mobile-back" onclick={() => (mobileStep = 'browse')}>
						<ChevronLeft class="h-4 w-4" />
						Back to templates
					</button>
					<div class="new-doc-mobile-create-body">
						{#if selectedDetail}
							<div class="new-doc-mobile-template-card">
								{#if thumbnailUrls[selectedDetail.id]}
									<img
										src={thumbnailUrls[selectedDetail.id]}
										alt={selectedDetail.title}
										class="new-doc-mobile-thumb"
									/>
								{:else}
									<div class="new-doc-mobile-thumb-placeholder">
										{#if thumbnailLoading[selectedDetail.id]}
											<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
										{/if}
									</div>
								{/if}
								<div class="new-doc-mobile-template-info">
									<h3 class="text-base font-semibold text-foreground">{selectedDetail.title}</h3>
									<p class="text-xs text-muted-foreground">
										by {selectedDetail.is_official ? 'TongueToQuill' : selectedDetail.owner_display_name}
									</p>
									{#if selectedDetail.description}
										<p class="mt-1 line-clamp-3 text-sm text-muted-foreground">{selectedDetail.description}</p>
									{/if}
									<div class="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
										<button
											type="button"
											class="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
											aria-pressed={selectedDetail.is_starred}
											onclick={() => handleToggleStar(selectedDetail?.id)}
										>
											<Star class={cn('h-3.5 w-3.5', selectedDetail.is_starred && 'fill-yellow-400 text-yellow-400')} />
											{selectedDetail.star_count}
										</button>
										<span class="inline-flex items-center gap-1">
											<FileInput class="h-3.5 w-3.5" />{selectedDetail.import_count}
										</span>
									</div>
								</div>
							</div>
						{:else if detailLoading}
							<div class="flex items-center justify-center py-8">
								<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						{:else if detailError}
							<div class="px-2 text-sm text-destructive">{detailError}</div>
						{/if}
						<form class="new-doc-mobile-form" onsubmit={handleSubmit}>
							<div class="new-doc-detail-actions">
								<Input
									id="new-doc-name"
									type="text"
									bind:value={documentName}
									onkeydown={() => {
										hasUserEditedName = true;
									}}
									placeholder="Enter document name"
									disabled={isCreating}
									class="h-10"
								/>
								<Button
									variant="default"
									class="h-10 shrink-0 px-5"
									onclick={handleCreate}
									disabled={!isValid || isCreating}
									type="submit"
								>
									{isCreating ? 'Creating...' : 'Create'}
								</Button>
							</div>
							{#if creationError}
								<p class="text-xs text-destructive">{creationError}</p>
							{/if}
						</form>
					</div>
				</div>
			{:else}
				<!-- Desktop layout or Mobile: Step 1 – browse templates -->
				<div class={cn('new-doc-layout', isMobileViewport && 'new-doc-layout-mobile-browse')}>
					{#if !isMobileViewport}
						<div class="new-doc-detail-column">
							<div class="new-doc-detail-scroll">
								{#if !selectedTemplateId && (!hasLoadedTemplatesOnce || listLoading)}
									<!-- Suppress empty-state copy during initial gallery load to avoid a flash before auto-selection. -->
								{:else if !selectedTemplateId}
									<div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
										<p class="text-base font-medium text-foreground">Select a template to begin</p>
										<p class="text-sm text-muted-foreground">Choose from official or community templates.</p>
									</div>
								{:else if selectedDetail}
									<div class="new-doc-detail-content p-4">
										<div class="new-doc-detail-meta space-y-2">
											<div class="space-y-1">
												<h3 class="text-lg font-semibold text-foreground">{selectedDetail.title}</h3>
												<p class="text-sm text-muted-foreground">
													by {selectedDetail.is_official ? 'TongueToQuill' : selectedDetail.owner_display_name}
												</p>
											</div>

											{#if selectedDetail.description}
												<p class="line-clamp-8 text-sm text-muted-foreground">{selectedDetail.description}</p>
											{/if}

											<p class="text-xs text-muted-foreground">
												<span class="font-medium text-foreground">Format:</span>
												<span class="font-mono">{selectedDetail.quill_ref || 'Unknown'}</span>
											</p>
											<p class="text-xs text-muted-foreground">
												<span class="font-medium text-foreground">Updated:</span>
												<span>{formatTemplateDate(selectedDetail.updated_at)}</span>
											</p>

											<div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
												<button
													type="button"
													class="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
													aria-pressed={selectedDetail.is_starred}
													onclick={() => handleToggleStar(selectedDetail?.id)}
												>
													<Star class={cn('h-4 w-4', selectedDetail.is_starred && 'fill-yellow-400 text-yellow-400')} />
													{selectedDetail.star_count}
												</button>
												<span class="inline-flex items-center gap-1"><FileInput class="h-4 w-4" />{selectedDetail.import_count}</span>
												{#if detailLoading}
													<span class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide">
														<Loader2 class="h-3 w-3 animate-spin" />Refreshing
													</span>
												{/if}
											</div>
										</div>
									</div>
								{:else if detailLoading}
									<div class="flex h-full items-center justify-center">
										<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
									</div>
								{:else if detailError}
									<div class="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
										{detailError}
									</div>
								{/if}
							</div>
							<form class="new-doc-detail-footer" onsubmit={handleSubmit}>
								<div class="new-doc-detail-actions">
									<Input
										id="new-doc-name"
										type="text"
										bind:value={documentName}
										onkeydown={() => {
											hasUserEditedName = true;
										}}
										placeholder="Enter document name"
										disabled={isCreating}
										class="h-8"
									/>
									<Button
										variant="default"
										size="sm"
										class="h-8 shrink-0"
										onclick={handleCreate}
										disabled={!isValid || isCreating}
										type="submit"
									>
										{isCreating ? 'Creating...' : 'Create'}
									</Button>
								</div>
								{#if creationError}
									<p class="text-xs text-destructive">{creationError}</p>
								{/if}
							</form>
						</div>
					{/if}

					<div
						class={cn('new-doc-gallery-column', isMobileViewport && 'new-doc-gallery-column-mobile')}
						role="region"
						aria-label="Template gallery"
					>
						<div
							class={cn('new-doc-gallery-scroll', isMobileViewport && 'new-doc-gallery-scroll-mobile')}
							bind:this={galleryScrollElement}
						>
						{#if listError}
							<div class="p-4 text-center text-sm text-destructive">
								{listError}
								<button
									type="button"
									class="mt-2 block w-full text-xs text-muted-foreground underline hover:text-foreground"
									onclick={() => void fetchGallery(debouncedGalleryFilter ?? galleryFilter, templates.length > 0 || recents.length > 0)}
								>
									Retry
								</button>
							</div>
						{:else if starredFilterLoading}
							<div class="flex items-center justify-center p-8">
								<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
								<span class="ml-2 text-sm text-muted-foreground">Loading starred templates...</span>
							</div>
						{:else if isGalleryMode}
							{#if isGalleryLoadingView}
								<div class="flex items-center justify-center p-8">
									<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
									<span class="ml-2 text-sm text-muted-foreground">Loading templates...</span>
								</div>
							{:else if showGalleryEmptyState}
								<div class="p-8 text-center text-sm text-muted-foreground">No templates found</div>
							{:else}
								<div class="template-section">
									{#if gallerySectionHeading}
										<div class="template-section-header">
											{#if isSeeAllFilteredSection}
												<h3 class="template-section-heading">
													<button
														type="button"
														class="template-section-filter-pill"
														aria-label={`Clear ${gallerySectionHeading} filter`}
														onclick={handleClearGalleryFilter}
													>
														<ChevronLeft class="h-3.5 w-3.5" />
														<span>{gallerySectionHeading}</span>
													</button>
												</h3>
											{:else}
												<h3 class="template-section-heading">{gallerySectionHeading}</h3>
											{/if}
										</div>
									{/if}
									<div class="template-grid">
										{#each galleryTemplates as template (template.id)}
											<TemplateCard
												{template}
												section={galleryCardSection}
												cardKey={getCardKey(galleryCardSection, template.id)}
												isSelected={isSelectedCard(galleryCardSection, template.id)}
												thumbnailUrl={thumbnailUrls[template.id]}
												isThumbnailLoading={thumbnailLoading[template.id] ?? false}
												isStarred={templateIsStarredForUser(template.id)}
												onSelect={() => {
													handleSelectTemplate(template, galleryCardSection);
													if (isMobileViewport) mobileStep = 'create';
												}}
												onDoubleClick={() => void handleDoubleClickTemplate(template, galleryCardSection)}
												onToggleStar={() => void handleToggleStar(template.id)}
												onHoverStart={() => handlePreviewHoverStart(getCardKey(galleryCardSection, template.id))}
												onHoverEnd={() => handlePreviewHoverEnd(getCardKey(galleryCardSection, template.id))}
											/>
										{/each}
									</div>
								</div>
							{/if}
						{:else}
							{#if filteredRecents.length > 0}
								<div class="template-section">
									<div class="template-section-header">
										<h3 class="template-section-heading">Recents</h3>
									</div>
									<div class="template-grid">
										{#each filteredRecents.slice(0, HOME_RECENTS_MAX_ITEMS) as template (template.id)}
											<TemplateCard
												{template}
												section="recents"
												cardKey={getCardKey('recents', template.id)}
												isSelected={isSelectedCard('recents', template.id)}
												thumbnailUrl={thumbnailUrls[template.id]}
												isThumbnailLoading={thumbnailLoading[template.id] ?? false}
												isStarred={templateIsStarredForUser(template.id)}
												onSelect={() => {
													handleSelectTemplate(template, 'recents');
													if (isMobileViewport) mobileStep = 'create';
												}}
												onDoubleClick={() => void handleDoubleClickTemplate(template, 'recents')}
												onToggleStar={() => void handleToggleStar(template.id)}
												onHoverStart={() => handlePreviewHoverStart(getCardKey('recents', template.id))}
												onHoverEnd={() => handlePreviewHoverEnd(getCardKey('recents', template.id))}
											/>
										{/each}
									</div>
								</div>
							{/if}

							{#if filteredOfficial.length > 0}
								<div class="template-section">
									<div class="template-section-header">
										<h3 class="template-section-heading">Official</h3>
										<button
											type="button"
											class="template-see-all-link"
											onclick={() => handleSeeAllClick('official')}
										>
											See all ({officialTotalForSeeAll})
										</button>
									</div>
									<div class="template-grid">
										{#each filteredOfficial.slice(0, HOME_SECTION_MAX_ITEMS) as template (template.id)}
											<TemplateCard
												{template}
												section="official"
												cardKey={getCardKey('official', template.id)}
												isSelected={isSelectedCard('official', template.id)}
												thumbnailUrl={thumbnailUrls[template.id]}
												isThumbnailLoading={thumbnailLoading[template.id] ?? false}
												isStarred={templateIsStarredForUser(template.id)}
												onSelect={() => {
													handleSelectTemplate(template, 'official');
													if (isMobileViewport) mobileStep = 'create';
												}}
												onDoubleClick={() => void handleDoubleClickTemplate(template, 'official')}
												onToggleStar={() => void handleToggleStar(template.id)}
												onHoverStart={() => handlePreviewHoverStart(getCardKey('official', template.id))}
												onHoverEnd={() => handlePreviewHoverEnd(getCardKey('official', template.id))}
											/>
										{/each}
									</div>
								</div>
							{/if}

							{#if popularTemplates.length > 0}
								<div class="template-section">
									<div class="template-section-header">
										<h3 class="template-section-heading">Popular</h3>
										<button
											type="button"
											class="template-see-all-link"
											onclick={() => handleSeeAllClick('popular')}
										>
											See all ({popularTotalForSeeAll})
										</button>
									</div>
									<div class="template-grid">
										{#each popularTemplates.slice(0, HOME_SECTION_MAX_ITEMS) as template (template.id)}
											<TemplateCard
												{template}
												section="popular"
												cardKey={getCardKey('popular', template.id)}
												isSelected={isSelectedCard('popular', template.id)}
												thumbnailUrl={thumbnailUrls[template.id]}
												isThumbnailLoading={thumbnailLoading[template.id] ?? false}
												isStarred={templateIsStarredForUser(template.id)}
												onSelect={() => {
													handleSelectTemplate(template, 'popular');
													if (isMobileViewport) mobileStep = 'create';
												}}
												onDoubleClick={() => void handleDoubleClickTemplate(template, 'popular')}
												onToggleStar={() => void handleToggleStar(template.id)}
												onHoverStart={() => handlePreviewHoverStart(getCardKey('popular', template.id))}
												onHoverEnd={() => handlePreviewHoverEnd(getCardKey('popular', template.id))}
											/>
										{/each}
									</div>
								</div>
							{:else if showHomeEmptyState}
								<div class="p-8 text-center text-sm text-muted-foreground">
									{showStarredOnly ? 'No starred templates' : 'No templates found'}
								</div>
							{/if}
						{/if}
						</div>

						{#if !isMobileViewport}
							{#if quickLookPreview && isQuickLookOpen}
								<button
									class="quick-look-overlay"
									type="button"
									aria-label="Close preview"
									transition:fade={{ duration: 150 }}
									onoutroend={onQuickLookOutroEnd}
									onclick={closeQuickLook}
								>
									{#if thumbnailUrls[quickLookPreview.template.id]}
										<div class="quick-look-image-wrap" role="presentation" onclick={(e) => e.stopPropagation()}>
											<img
												src={thumbnailUrls[quickLookPreview.template.id]}
												alt={quickLookPreview.template.title}
												class="quick-look-image"
											/>
										</div>
									{:else}
										<div class="quick-look-placeholder">
											<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
										</div>
									{/if}
								</button>
							{/if}

						{/if}
					</div>
				</div>
			{/if}
		{/snippet}
	</Dialog>
{/if}

<style>
	/* ── Desktop layout ────────────────────────────────────────────── */
	.new-doc-layout {
		display: grid;
		grid-template-columns: 300px minmax(0, 1fr);
		height: 100%;
		min-height: 0;
	}

	.new-doc-detail-column {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border);
		min-height: 0;
	}

	.new-doc-detail-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.new-doc-detail-footer {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.625rem;
		border-top: 1px solid var(--color-border);
	}

	.new-doc-detail-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.new-doc-detail-content {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	.new-doc-detail-meta {
		padding-bottom: 0.375rem;
	}

	.new-doc-gallery-column {
		position: relative;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-height: 0;
	}

	.new-doc-gallery-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0.75rem;
	}

	/* ── Quick Look overlay ────────────────────────────────────────── */
	.quick-look-overlay {
		position: absolute;
		inset: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		background: color-mix(in oklab, var(--color-background) 88%, transparent);
		backdrop-filter: blur(1px);
		cursor: zoom-out;
		border: none;
		width: 100%;
	}

	.quick-look-image-wrap {
		display: contents;
	}

	.quick-look-image {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
		box-shadow: 0 8px 32px color-mix(in oklab, var(--color-foreground) 18%, transparent);
		cursor: default;
	}

	.quick-look-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 8rem;
		height: 8rem;
	}

	/* ── Detail pane infotip ───────────────────────────────────────── */
	.detail-infotip {
		padding: 0.3rem 0.75rem;
		font-size: 0.6875rem;
		color: var(--color-muted-foreground);
		text-align: center;
		pointer-events: none;
		opacity: 0;
		transition: opacity 120ms ease;
		flex-shrink: 0;
	}

	.detail-infotip-visible {
		opacity: 1;
	}

	/* ── Template grid ─────────────────────────────────────────────── */
	.template-section {
		margin-bottom: 1rem;
	}

	.template-section:last-child {
		margin-bottom: 0;
	}

	.template-section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.375rem;
	}

	.template-section-heading {
		font-size: 0.9375rem;
		font-weight: 700;
		color: var(--color-foreground);
	}

	.template-section-filter-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.55rem;
		border: 1px solid color-mix(in oklab, var(--color-primary) 22%, var(--color-border));
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-primary) 8%, var(--color-surface-elevated));
		color: var(--color-foreground);
		font: inherit;
		line-height: 1.2;
		cursor: pointer;
		transition:
			background-color 120ms ease,
			border-color 120ms ease;
	}

	.template-section-filter-pill:hover {
		background: color-mix(in oklab, var(--color-primary) 13%, var(--color-surface-elevated));
		border-color: color-mix(in oklab, var(--color-primary) 36%, var(--color-border));
	}

	.template-section-filter-pill:focus-visible {
		outline: 2px solid color-mix(in oklab, var(--color-primary) 50%, transparent);
		outline-offset: 2px;
	}

	.template-see-all-link {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-muted-foreground);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.template-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.75rem;
	}

	/* ── Mobile: Step 1 – browse (single-scroll, no nested overflow) ─ */
	.new-doc-layout-mobile-browse {
		display: block;
	}

	.new-doc-gallery-column-mobile {
		/* Override desktop flex/overflow — the dialog content scrolls on mobile */
		display: block;
		overflow: visible;
	}

	.new-doc-gallery-scroll-mobile {
		overflow-y: visible;
		padding: 0.625rem;
	}

	@media (max-width: 767px) {
		.template-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.5rem;
		}

		.template-section {
			margin-bottom: 0.875rem;
		}
	}

	/* ── Mobile: Step 2 – create ───────────────────────────────────── */
	.new-doc-mobile-create {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.new-doc-mobile-back {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-muted-foreground);
		background: none;
		border: none;
		cursor: pointer;
		transition: color 120ms ease;
	}

	.new-doc-mobile-back:hover {
		color: var(--color-foreground);
	}

	.new-doc-mobile-create-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.new-doc-mobile-template-card {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-muted) 25%, var(--color-surface-elevated));
	}

	.new-doc-mobile-thumb {
		width: 72px;
		height: 72px;
		object-fit: contain;
		border-radius: 0.375rem;
		border: 1px solid var(--color-border);
		flex-shrink: 0;
		background: var(--color-muted);
	}

	.new-doc-mobile-thumb-placeholder {
		width: 72px;
		height: 72px;
		border-radius: 0.375rem;
		border: 1px solid var(--color-border);
		background: var(--color-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.new-doc-mobile-template-info {
		flex: 1;
		min-width: 0;
	}

	.new-doc-mobile-form {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.detail-infotip {
			transition: none;
		}
	}
</style>
