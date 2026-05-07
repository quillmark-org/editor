<script lang="ts">
	import { Megaphone, Sparkles, MessageSquareHeart, Wrench, ChevronRight } from 'lucide-svelte';
	import { page } from '$app/state';
	import Sheet from '$lib/components/ui/base-sheet.svelte';
	import { parseChangelog, type ChangelogVersion } from '$lib/utils/changelog';
	import changelogRaw from '../../../CHANGELOG.md?raw';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}

	let { open, onOpenChange }: Props = $props();

	const brand = $derived(page.data.config.brand);

	const versions: ChangelogVersion[] = parseChangelog(changelogRaw);
	const latest = versions[0];
	const older = versions.slice(1);
</script>

<Sheet {open} {onOpenChange} side="right" hideCloseButton={false}>
	{#snippet header()}
		<div class="flex items-center gap-3">
			<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
				<Megaphone class="h-5 w-5" />
			</div>
			<div>
				<h2 class="text-lg font-semibold text-foreground">What's new in {brand.displayFull}</h2>
				<p class="mt-0.5 text-sm text-muted-foreground">
					We build {brand.displayFull} with your feedback. Here's what's shipped recently.
				</p>
			</div>
		</div>
	{/snippet}

	{#snippet content()}
		{#if !latest}
			<p class="text-sm text-muted-foreground">No release notes available yet.</p>
		{:else}
			<div class="space-y-8">
				<section aria-label="Latest version v{latest.version}">
					<div class="mb-3 flex items-center gap-2">
						<span class="rounded-md bg-accent px-2 py-0.5 font-mono text-xs text-accent-foreground">
							v{latest.version}
						</span>
						<span class="text-xs uppercase tracking-wide text-muted-foreground">Latest</span>
					</div>

					{#if latest.fromYourFeedback.length > 0}
						<div class="mb-4 rounded-md border-l-2 border-primary bg-primary/5 p-3">
							<div class="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
								<MessageSquareHeart class="h-4 w-4" />
								<span>From your feedback</span>
							</div>
							<ul class="space-y-1.5 pl-6 text-sm text-foreground">
								{#each latest.fromYourFeedback as item (item)}
									<li class="list-disc">{item}</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if latest.added.length > 0}
						<div class="mb-4">
							<div class="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
								<Sparkles class="h-4 w-4 text-muted-foreground" />
								<span>New</span>
							</div>
							<ul class="space-y-1.5 pl-6 text-sm text-muted-foreground">
								{#each latest.added as item (item)}
									<li class="list-disc">{item}</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if latest.fixed.length > 0}
						<div>
							<div class="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
								<Wrench class="h-4 w-4 text-muted-foreground" />
								<span>Fixed</span>
							</div>
							<ul class="space-y-1.5 pl-6 text-sm text-muted-foreground">
								{#each latest.fixed as item (item)}
									<li class="list-disc">{item}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</section>

				{#if older.length > 0}
					<section aria-label="Previous versions" class="border-t border-border pt-6">
						<h3 class="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
							Previous releases
						</h3>
						<div class="space-y-2">
							{#each older as v (v.version)}
								<details class="group rounded-md border border-border">
									<summary
										class="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-mono text-foreground hover:bg-accent"
									>
										<span>v{v.version}</span>
										<ChevronRight
											class="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90"
										/>
									</summary>
									<div class="space-y-4 border-t border-border px-3 py-3">
										{#if v.fromYourFeedback.length > 0}
											<div class="rounded-md border-l-2 border-primary bg-primary/5 p-3">
												<div class="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
													<MessageSquareHeart class="h-4 w-4" />
													<span>From your feedback</span>
												</div>
												<ul class="space-y-1.5 pl-6 text-sm text-foreground">
													{#each v.fromYourFeedback as item (item)}
														<li class="list-disc">{item}</li>
													{/each}
												</ul>
											</div>
										{/if}

										{#if v.added.length > 0}
											<div>
												<div class="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
													<Sparkles class="h-4 w-4 text-muted-foreground" />
													<span>New</span>
												</div>
												<ul class="space-y-1.5 pl-6 text-sm text-muted-foreground">
													{#each v.added as item (item)}
														<li class="list-disc">{item}</li>
													{/each}
												</ul>
											</div>
										{/if}

										{#if v.fixed.length > 0}
											<div>
												<div class="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
													<Wrench class="h-4 w-4 text-muted-foreground" />
													<span>Fixed</span>
												</div>
												<ul class="space-y-1.5 pl-6 text-sm text-muted-foreground">
													{#each v.fixed as item (item)}
														<li class="list-disc">{item}</li>
													{/each}
												</ul>
											</div>
										{/if}
									</div>
								</details>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		{/if}
	{/snippet}
</Sheet>
