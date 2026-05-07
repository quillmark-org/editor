<script lang="ts">
	import {
		FlaskConical,
		MessageSquareHeart,
		Sparkles,
		Mail,
		Loader2,
		Check,
		Lock,
		Globe
	} from 'lucide-svelte';
	import Dialog from '$lib/components/ui/base-dialog.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		userEmail?: string;
	}

	let { open, onOpenChange, userEmail }: Props = $props();

	let isSubmitting = $state(false);
	let wantsBetaProgram = $state(false);

	$effect(() => {
		if (!open) return;
		const savedStatus = localStorage.getItem('beta-program-status');
		wantsBetaProgram = savedStatus === 'accepted';
	});

	async function persistPreference(nextValue: boolean) {
		isSubmitting = true;
		wantsBetaProgram = nextValue;
		const response = nextValue ? 'accepted' : 'declined';
		try {
			const res = await fetch('/api/beta-program', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ response })
			});

			if (!res.ok) throw new Error('Request failed');

			localStorage.setItem('beta-program-status', response);

			if (response === 'accepted') {
				toastStore.success('Welcome to the Beta Program!');
			} else {
				toastStore.success('Beta program preference updated.');
			}
		} catch {
			toastStore.error('Something went wrong. Please try again.');
		} finally {
			isSubmitting = false;
		}
	}

	function handleToggle(nextValue: boolean) {
		if (isSubmitting || nextValue === wantsBetaProgram) return;
		void persistPreference(nextValue);
	}
</script>

<Dialog {open} onOpenChange={onOpenChange} size="sm" scoped>
	{#snippet header()}
		<div class="flex items-center gap-3">
			<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
				<FlaskConical class="h-5 w-5" />
			</div>
			<div>
				<h2 class="text-lg font-semibold text-foreground">Join the Beta Program</h2>
			</div>
		</div>
	{/snippet}

	{#snippet content()}
		<div class="space-y-6">
			<p class="text-sm text-muted-foreground">
				Help shape the future of the app. As a beta tester, you'll get early access to new features and a direct line to the team.
			</p>

			<!-- Benefits -->
			<div class="space-y-3">
				<div class="flex items-start gap-3">
					<div class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent">
						<Sparkles class="h-3.5 w-3.5 text-accent-foreground" />
					</div>
					<div class="text-sm text-muted-foreground">
						Preview new features before everyone else
					</div>
				</div>
				<div class="flex items-start gap-3">
					<div class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent">
						<MessageSquareHeart class="h-3.5 w-3.5 text-accent-foreground" />
					</div>
					<div class="text-sm text-muted-foreground">
						Your feedback gets priority and directly influences development
					</div>
				</div>
				<div class="flex items-start gap-3">
					<div class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent">
						<Mail class="h-3.5 w-3.5 text-accent-foreground" />
					</div>
					<div class="text-sm text-muted-foreground">
						Occasional updates sent to
						{#if userEmail}
							<span class="font-medium text-foreground">{userEmail}</span>
						{:else}
							your email
						{/if}
					</div>
				</div>
			</div>

				<div role="radiogroup" aria-label="Beta program preference">
					<button
						type="button"
						role="radio"
						aria-checked={!wantsBetaProgram}
						disabled={isSubmitting}
						onclick={() => handleToggle(false)}
						class="flex w-full items-center gap-3 rounded-t-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-accent/50 disabled:cursor-not-allowed"
					>
						<Lock class="h-5 w-5 shrink-0 text-muted-foreground" />
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium text-foreground">Not now</div>
							<div class="text-xs text-muted-foreground">Opt out of beta updates</div>
						</div>
						<div class="flex h-5 w-5 shrink-0 items-center justify-center">
							{#if isSubmitting && !wantsBetaProgram}
								<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
							{:else if !wantsBetaProgram}
								<Check class="h-5 w-5 text-primary" />
							{:else}
								<span class="h-5 w-5" aria-hidden="true"></span>
							{/if}
						</div>
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={wantsBetaProgram}
						disabled={isSubmitting}
						onclick={() => handleToggle(true)}
						class="flex w-full items-center gap-3 rounded-b-lg border border-t-0 border-border bg-surface p-4 text-left transition-colors hover:bg-accent/50 disabled:cursor-not-allowed"
					>
						<Globe class="h-5 w-5 shrink-0 text-muted-foreground" />
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium text-foreground">Join beta updates</div>
							<div class="text-xs text-muted-foreground">Get early feature previews and updates</div>
						</div>
						<div class="flex h-5 w-5 shrink-0 items-center justify-center">
							{#if isSubmitting && wantsBetaProgram}
								<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
							{:else if wantsBetaProgram}
								<Check class="h-5 w-5 text-primary" />
							{:else}
								<span class="h-5 w-5" aria-hidden="true"></span>
							{/if}
						</div>
					</button>
				</div>
			</div>
	{/snippet}
</Dialog>
