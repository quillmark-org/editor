<script lang="ts">
	import {
		MessageSquareHeart,
		CheckCircle2,
		AlertTriangle
	} from 'lucide-svelte';
	import Dialog from '$lib/components/ui/base-dialog.svelte';
	import Button from '$lib/components/ui/button.svelte';

	type FeedbackType = 'bug' | 'feature';
	type Status = 'idle' | 'loading' | 'success' | 'error';
type FeedbackField = 'title' | 'description';

	const TITLE_MIN = 1;
	const TITLE_MAX = 120;
	const DESCRIPTION_MIN = 10;
	const DESCRIPTION_MAX = 5000;

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}

	let { open, onOpenChange }: Props = $props();

	let feedbackType = $state<FeedbackType>('bug');
	let title = $state('');
	let description = $state('');
	let status = $state<Status>('idle');
	let errorMessage = $state('');
let fieldErrors = $state<Partial<Record<FeedbackField, string>>>({});
let formValidationMessage = $state('');

const titleTrimmedLength = $derived(title.trim().length);
const descriptionTrimmedLength = $derived(description.trim().length);

const titleFieldMessage = $derived(fieldErrors.title ?? '');
const descriptionFieldMessage = $derived(fieldErrors.description ?? '');

const titleShowError = $derived(!!fieldErrors.title);
const descriptionShowError = $derived(!!fieldErrors.description);

	const canSubmit = $derived(
		titleTrimmedLength >= TITLE_MIN &&
			descriptionTrimmedLength >= DESCRIPTION_MIN &&
			status !== 'loading'
	);

	function resetForm() {
		feedbackType = 'bug';
		title = '';
		description = '';
		status = 'idle';
		errorMessage = '';
	fieldErrors = {};
	formValidationMessage = '';
	}

	function handleOpenChange(next: boolean) {
		onOpenChange(next);
		if (!next) {
			setTimeout(resetForm, 150);
		}
	}

	function detectBrowser(ua: string): string {
		try {
			// Order matters: Edge and Opera masquerade as Chrome; test them first.
			const checks: Array<{ name: string; regex: RegExp }> = [
				{ name: 'Edge', regex: /Edg\/([\d.]+)/ },
				{ name: 'Opera', regex: /OPR\/([\d.]+)/ },
				{ name: 'Chrome', regex: /Chrome\/([\d.]+)/ },
				{ name: 'Firefox', regex: /Firefox\/([\d.]+)/ },
				{ name: 'Safari', regex: /Version\/([\d.]+).*Safari/ }
			];
			for (const { name, regex } of checks) {
				const match = ua.match(regex);
				if (match) return `${name} ${match[1]}`;
			}
		} catch {
			// fall through
		}
		return 'unknown';
	}

	function detectOS(ua: string, platform: string): string {
		try {
			if (/Windows NT/.test(ua)) return 'Windows';
			if (/Android/.test(ua)) return 'Android';
			if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
			if (/Mac OS X/.test(ua)) return 'macOS';
			if (/Linux/.test(ua)) return 'Linux';
			if (platform) return platform;
		} catch {
			// fall through
		}
		return 'unknown';
	}

	function collectEnvironment(): Record<string, string> | undefined {
		if (typeof window === 'undefined') return undefined;
		const ua = navigator.userAgent ?? '';
		const platform = navigator.platform ?? '';
		return {
			browser: detectBrowser(ua),
			os: detectOS(ua, platform),
			route: window.location.pathname,
			screen: `${window.innerWidth}x${window.innerHeight}`
		};
	}

	async function handleSubmit(event?: Event) {
		event?.preventDefault();
		if (!canSubmit) return;
		status = 'loading';
		errorMessage = '';
		formValidationMessage = '';
		fieldErrors = {};

		const payload = {
			type: feedbackType,
			title: title.trim(),
			description: description.trim(),
			environment: collectEnvironment()
		};

		try {
			const res = await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = (await res.json().catch(() => null)) as
				| {
						error?: {
							code?: string;
							message?: string;
							fields?: Record<string, string>;
						};
				  }
				| null;
			if (!res.ok) {
				const error = data?.error;
				const isValidationError = error?.code === 'VALIDATION_ERROR' || !!error?.fields;
				if (isValidationError) {
					const nextFieldErrors: Partial<Record<FeedbackField, string>> = {};
					if (error?.fields?.title) nextFieldErrors.title = error.fields.title;
					if (error?.fields?.description) nextFieldErrors.description = error.fields.description;
					fieldErrors = nextFieldErrors;
					formValidationMessage =
						error?.message ?? 'Please review the highlighted fields and try again.';
					status = 'idle';
					return;
				}
				throw new Error('Request failed');
			}
			status = 'success';
		} catch {
			status = 'error';
			errorMessage = 'Something went wrong submitting your feedback. Please try again.';
		}
	}

	function handleTryAgain() {
		status = 'idle';
		errorMessage = '';
	}

function clearFieldError(field: FeedbackField) {
	if (!fieldErrors[field]) return;
	const nextFieldErrors = { ...fieldErrors };
	delete nextFieldErrors[field];
	fieldErrors = nextFieldErrors;
}

function handleTitleInput() {
	clearFieldError('title');
	if (formValidationMessage) formValidationMessage = '';
}

function handleDescriptionInput() {
	clearFieldError('description');
	if (formValidationMessage) formValidationMessage = '';
}

	function handleClose() {
		handleOpenChange(false);
	}

	const inputClass =
		'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60';
	const labelClass = 'mb-1 block text-sm font-medium text-foreground';
</script>

<Dialog open={open} onOpenChange={handleOpenChange} size="md">
	{#snippet header()}
		<div class="flex items-center gap-3">
			<div
				class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"
			>
				<MessageSquareHeart class="h-5 w-5" />
			</div>
			<div>
				<h2 class="text-lg font-semibold text-foreground">Share feedback</h2>
				<p class="text-xs text-muted-foreground">
					Tell us about bugs or ideas.
				</p>
			</div>
		</div>
	{/snippet}

	{#snippet content()}
		<div aria-live="polite" class="sr-only">
			{#if status === 'loading'}Submitting feedback…{/if}
			{#if status === 'success'}Feedback submitted successfully.{/if}
			{#if status === 'error'}{errorMessage}{/if}
		</div>

		{#if status === 'success'}
			<div class="flex flex-col items-center gap-4 py-6 text-center">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success"
				>
					<CheckCircle2 class="h-6 w-6" />
				</div>
				<div>
					<h3 class="text-base font-semibold text-foreground">Thanks for your feedback!</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						We read every submission. You may hear from us if we need more details.
					</p>
				</div>
				<Button onclick={handleClose}>Close</Button>
			</div>
		{:else if status === 'error'}
			<div class="flex flex-col items-center gap-4 py-6 text-center">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
				>
					<AlertTriangle class="h-6 w-6" />
				</div>
				<div>
					<h3 class="text-base font-semibold text-foreground">Submission failed</h3>
					<p class="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
				</div>
				<div class="flex gap-2">
					<Button variant="outline" onclick={handleClose}>Close</Button>
					<Button onclick={handleTryAgain}>Try again</Button>
				</div>
			</div>
		{:else}
			<form class="space-y-4" onsubmit={handleSubmit} novalidate>
				<div>
					<label for="feedback-type" class={labelClass}>Type</label>
					<select
						id="feedback-type"
						class={inputClass}
						bind:value={feedbackType}
						disabled={status === 'loading'}
					>
						<option value="bug">Bug</option>
						<option value="feature">Feature request</option>
					</select>
				</div>

				<div>
					<label for="feedback-title" class={labelClass}>
						Title <span aria-hidden="true" class="text-destructive">*</span>
					</label>
					<input
						id="feedback-title"
						type="text"
						class={inputClass}
						placeholder="Brief summary"
						bind:value={title}
						oninput={handleTitleInput}
						required
						aria-required="true"
						maxlength={TITLE_MAX}
						aria-invalid={titleShowError}
						aria-describedby={titleShowError ? 'feedback-title-error' : undefined}
						disabled={status === 'loading'}
					/>
					{#if titleShowError}
						<p id="feedback-title-error" class="mt-1 text-xs text-destructive">
							{titleFieldMessage}
						</p>
					{/if}
				</div>

				<div>
					<label for="feedback-description" class={labelClass}>
						Description <span aria-hidden="true" class="text-destructive">*</span>
					</label>
					<textarea
						id="feedback-description"
						class={inputClass}
						rows="4"
						placeholder="What happened, or what would you like to happen?"
						bind:value={description}
						oninput={handleDescriptionInput}
						required
						aria-required="true"
						maxlength={DESCRIPTION_MAX}
						aria-invalid={descriptionShowError}
						aria-describedby={descriptionShowError
							? 'feedback-description-hint feedback-description-error'
							: 'feedback-description-hint'}
						disabled={status === 'loading'}
					></textarea>
					<p id="feedback-description-hint" class="mt-1 text-xs text-muted-foreground">
						{DESCRIPTION_MIN}–{DESCRIPTION_MAX} characters
					</p>
					{#if descriptionShowError}
						<p id="feedback-description-error" class="mt-1 text-xs text-destructive">
							{descriptionFieldMessage}
						</p>
					{/if}
				</div>

				{#if formValidationMessage && status !== 'loading'}
					<p class="text-xs text-destructive">{formValidationMessage}</p>
				{/if}

				<div class="flex justify-end gap-2 pt-2">
					<Button
						variant="outline"
						onclick={handleClose}
						disabled={status === 'loading'}
						type="button"
					>
						Cancel
					</Button>
					<Button type="submit" disabled={!canSubmit} loading={status === 'loading'}>
						{status === 'loading' ? 'Submitting…' : 'Submit feedback'}
					</Button>
				</div>
			</form>
		{/if}
	{/snippet}
</Dialog>
