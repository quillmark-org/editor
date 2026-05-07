<script lang="ts">
	import {
		Bold,
		Italic,
		Underline,
		Strikethrough,
		Code,
		Link,
		List,
		ListOrdered,
	} from 'lucide-svelte';
	import ToolbarButton from './ToolbarButton.svelte';
	import ToolbarSeparator from './ToolbarSeparator.svelte';
	import ToolbarContainer from './ToolbarContainer.svelte';

	interface Props {
		onFormat: (type: string) => void;
	}

	let { onFormat }: Props = $props();
</script>

<ToolbarContainer>
	<div class="flex items-center gap-1">
		<!-- Formatting Group -->
		<ToolbarButton
			onclick={() => onFormat('bold')}
			title="Bold"
			icon={Bold}
		/>

		<ToolbarButton
			onclick={() => onFormat('italic')}
			title="Italic"
			icon={Italic}
		/>

		<ToolbarButton
			onclick={() => onFormat('underline')}
			title="Underline"
			icon={Underline}
		/>

		<ToolbarSeparator />

		<ToolbarButton
			onclick={() => onFormat('strikethrough')}
			title="Strikethrough"
			icon={Strikethrough}
		/>

		<ToolbarButton
			onclick={() => onFormat('code')}
			title="Inline Code"
			icon={Code}
		/>

		<ToolbarButton
			onclick={() => onFormat('link')}
			title="Hyperlink"
			icon={Link}
		/>

		<ToolbarSeparator />

		<!-- List Group -->
		<ToolbarButton
			onclick={() => onFormat('bulletList')}
			title="Bullet List"
			icon={List}
		/>
		<ToolbarButton
			onclick={() => onFormat('numberedList')}
			title="Numbered List"
			icon={ListOrdered}
		/>
	</div>
</ToolbarContainer>
