<script lang="ts">
	import FieldHeader from './FieldHeader.svelte';
	import { generateUniqueId } from '$lib/utils/unique-id';
	import { cn } from '$lib/utils/cn';
	import { Calendar } from 'lucide-svelte';

	interface Props {
		value: string;
		label: string;
		description?: string;
		required?: boolean;
		placeholder?: string;
		error?: string;
		onDirty?: () => void;
	}

	let {
		value = $bindable(),
		label,
		description,
		required = false,
		placeholder = 'YYYY-MM-DD',
		error,
		onDirty
	}: Props = $props();

	const inputId = generateUniqueId('field');

	function handleLabelClick() {
		document.getElementById(inputId)?.focus();
	}

	function isValidIsoCalendarDate(iso: string): boolean {
		const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!m) return false;
		const y = parseInt(m[1], 10);
		const mo = parseInt(m[2], 10) - 1;
		const d = parseInt(m[3], 10);
		const dt = new Date(y, mo, d);
		return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d;
	}

	// rawDate drives the hidden native date picker (must be YYYY-MM-DD or empty).
	let rawDate = $state('');
	// textValue drives the visible text input.
	let textValue = $state('');
	let nativeDateEl: HTMLInputElement | null = $state(null);
	let isInternalChange = false;

	// Sync both inputs when bound value changes externally.
	$effect(() => {
		if (isInternalChange) return;

		const isPlaceholderOrEmpty = !value || value.includes('XX');
		textValue = isPlaceholderOrEmpty ? '' : value;
		rawDate = !isPlaceholderOrEmpty && isValidIsoCalendarDate(value) ? value : '';
	});

	function commit(val: string) {
		if (value === val) return;
		isInternalChange = true;
		value = val;
		rawDate = val;
		textValue = val;
		onDirty?.();
		setTimeout(() => {
			isInternalChange = false;
		}, 0);
	}

	// Native date picker change → commit the selected ISO date.
	function handleDateChange(e: Event) {
		const val = (e.target as HTMLInputElement).value;
		commit(val);
	}

	// Text input change → update value; only sync picker when entry is a valid ISO date.
	function handleTextInput(e: Event) {
		const val = (e.target as HTMLInputElement).value;
		isInternalChange = true;
		textValue = val;
		value = val;
		rawDate = isValidIsoCalendarDate(val) ? val : '';
		onDirty?.();
		setTimeout(() => {
			isInternalChange = false;
		}, 0);
	}

	// Open the native date picker via the calendar button.
	function openDatePicker() {
		if (!nativeDateEl) return;
		if (typeof nativeDateEl.showPicker === 'function') {
			nativeDateEl.showPicker();
		} else {
			try {
				nativeDateEl.click();
			} catch (e) {
				console.warn('DateField: unable to open native date picker', e);
			}
		}
	}
</script>

<div class="field-layout-grid">
	<FieldHeader
		{label}
		{required}
		{description}
		error={!!error}
		onLabelClick={handleLabelClick}
	/>
	<div class="date-field-wrapper">
		<!-- Primary text input for manual date entry -->
		<input
			id={inputId}
			type="text"
			value={textValue}
			oninput={handleTextInput}
			{placeholder}
			aria-label={label}
			aria-invalid={!!error}
			class={cn(
				'field-input flex w-full rounded-sm border border-input bg-muted-background py-2 pl-3 pr-10 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'
			)}
		/>

		<!-- Calendar button that opens the native date picker -->
		<button
			type="button"
			onclick={openDatePicker}
			aria-label="Open date picker"
			class="date-picker-btn"
		>
			<Calendar size={16} aria-hidden="true" />
		</button>

		<!-- Hidden native date picker — provides the browser's date selection UI -->
		<input
			bind:this={nativeDateEl}
			type="date"
			value={rawDate}
			onchange={handleDateChange}
			tabindex="-1"
			aria-hidden="true"
			class="date-picker-hidden"
		/>
	</div>
	{#if error}
		<p class="field-error">{error}</p>
	{/if}
</div>

<style>
	.date-field-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.date-picker-btn {
		position: absolute;
		right: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		color: var(--qm-muted-foreground, currentColor);
		opacity: 0.6;
		border-radius: 0.25rem;
		transition: opacity 0.15s;
	}

	.date-picker-btn:hover {
		opacity: 1;
	}

	.date-picker-hidden {
		position: absolute;
		right: 0.5rem;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
		overflow: hidden;
	}
</style>
