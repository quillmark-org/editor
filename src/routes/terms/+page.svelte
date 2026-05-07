<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const brand = $derived(page.data.config.brand);
</script>

<svelte:head>
	<title>Terms of Use</title>
</svelte:head>

<div class="flex h-full flex-col items-center overflow-hidden bg-background px-4 py-4">
	<!-- Main Content - Scrollable Container -->
	<div class="w-full max-w-4xl min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface px-8 py-6 shadow-xs">
		<div class="space-y-5">
			<h1 class="text-2xl font-bold text-foreground">USG Warning and Consent Banner</h1>

			<div class="space-y-4 text-sm text-foreground/90">
				<p>
					You are accessing a U.S. Government (USG) Information System (IS) that is provided for
					USG-authorized use only. By using this IS (which includes any device attached to this IS),
					you consent to the following conditions: The USG routinely intercepts and monitors
					communications on this IS for purposes including, but not limited to, penetration testing,
					COMSEC monitoring, network operations and defense, personnel misconduct (PM), law
					enforcement (LE), and counterintelligence (CI) investigations.
				</p>

				<p>
					At any time, the USG may inspect and seize data stored on this IS. Communications using, or
					data stored on, this IS are not private, are subject to routine monitoring, interception,
					and search, and may be disclosed or used for any USG authorized purpose. This IS includes
					security measures (e.g., authentication and access controls) to protect USG interests--not
					for your personal benefit or privacy.
				</p>

				<p>
					Notwithstanding the above, using this IS does not constitute consent to PM, LE or CI
					investigative searching or monitoring of the content of privileged communications, or work
					product, related to personal representation or services by attorneys, psychotherapists, or
					clergy, and their assistants. Such communications and work product are private and
					confidential. See User Agreement for details.
				</p>
			</div>

			<!-- System Data Section -->
			<div class="border-t border-border pt-6">
				<h2 class="mb-4 text-lg font-semibold text-foreground">
					System Data is Protected by the Privacy Act of 1974
				</h2>

				<div class="space-y-3 text-sm text-foreground/90">
					<p class="font-medium">All System Users must:</p>

					<ul class="list-inside list-disc space-y-2 pl-4">
						<li>
							Ensure the data is not posted, stored, or available in any way for uncontrolled access
							on any media.
						</li>
						<li>
							Ensure that data is protected at all times as required by the Privacy Act of 1974 (5
							USC 552a(I)(3)) as amended and other applicable DOD regulatory and statutory authority;
							data will not be shared with unauthorized personnel and contractors; data from the
							application, or any information derived from the application, shall not be published,
							disclosed, released, revealed, shown, sold, rented, leased or loaned to anyone outside
							of the performance of official duties without prior approval by the designated Authorizing Official
							or their authorized representatives.
						</li>
						<li>
							Delete or destroy data from downloaded or printed reports upon completion of the
							requirement for their use on individual projects.
						</li>
						<li>
							Ensure distribution of data from this application is restricted to those with a
							need-to-know. In no case shall data be shared with persons or entities that do not
							provide documented Proof of a need-to-know.
						</li>
					</ul>
				</div>
			</div>

			<!-- Criminal Penalties Warning -->
			<div class="rounded-md border border-warning-border bg-warning-background p-4">
				<p class="text-sm text-warning-foreground">
					Be aware that criminal penalties under section 1106(a) of the Social Security Act (42 USC
					1306(a)), including possible imprisonment, may apply with respect to any disclosure of
					information in the application that is inconsistent with the terms of application access.
					The user further acknowledges that criminal penalties under the Privacy Act (5 USC
					552a(I)(3)) may apply if it is determined that the user has knowingly and willfully obtained
					access to the application under false pretenses.
				</p>
			</div>

			<!-- Final Statement -->
			<div class="border-t border-border pt-6">
				<p class="text-center text-sm font-medium text-foreground">
					Under the Privacy Act of 1974, You Must Safeguard Personnel Information Retrieved Through
					This System.
				</p>
			</div>

			<!-- Back Link -->
			<div class="pt-4 text-center">
				<a href={resolve('/')} class="text-sm text-primary underline-offset-4 hover:underline">
					&larr; Return to Application
				</a>
			</div>
		</div>
	</div>

	<!-- Footer -->
	<div class="mt-4 shrink-0 text-center text-xs text-muted-foreground">
		<p>&copy; {new Date().getFullYear()} {brand.copyright}. All rights reserved.</p>
	</div>
</div>
