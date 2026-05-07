<script lang="ts">
	import { page } from '$app/state';

	const brand = $derived(page.data.config.brand);

	interface Props {
		/**
		 * Page-specific title. If provided, it will be formatted using the brand's titleTemplate.
		 * If omitted, brand.meta.defaultTitle is used.
		 */
		title?: string;
		/**
		 * Page-specific description. If omitted, brand.meta.description is used.
		 */
		description?: string;
	}

	let { title, description }: Props = $props();

	const computedTitle = $derived(
		title ? brand.meta.titleTemplate.replace('%s', title) : brand.meta.defaultTitle
	);
	const computedDescription = $derived(description ?? brand.meta.description);
	const canonicalUrl = $derived(`${page.url.origin}${page.url.pathname}`);
</script>

<svelte:head>
	<title>{computedTitle}</title>
	<meta name="description" content={computedDescription} />
	<meta name="keywords" content={brand.meta.keywords} />
	<link rel="icon" href={brand.meta.icons.favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#09090B" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content={brand.meta.ogSiteName} />
	<link rel="apple-touch-icon" href={brand.meta.icons.pwa192} />

	<!-- Open Graph -->
	<meta property="og:title" content={computedTitle} />
	<meta property="og:description" content={computedDescription} />
	<meta property="og:site_name" content={brand.meta.ogSiteName} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={canonicalUrl} />
	<link rel="canonical" href={canonicalUrl} />
</svelte:head>
