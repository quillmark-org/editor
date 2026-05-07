/**
 * Svelte action for detecting clicks outside an element
 * Usage: <div use:clickOutside={() => close()}>
 */
export function clickOutside(
	node: HTMLElement,
	callback: (event: MouseEvent) => void,
	ignoreNodes: (HTMLElement | undefined)[] = []
): { destroy: () => void } {
	function handleClick(event: MouseEvent) {
		const target = event.target as Node;

		// Map ignored nodes and check if target is inside any of them
		const isIgnored = ignoreNodes.some((ignoreNode) => ignoreNode && ignoreNode.contains(target));

		if (node && !node.contains(target) && !isIgnored && !event.defaultPrevented) {
			callback(event);
		}
	}

	// Add listener with a slight delay to avoid triggering on the same click that opens the element
	setTimeout(() => {
		document.addEventListener('click', handleClick, true);
	}, 0);

	return {
		destroy() {
			document.removeEventListener('click', handleClick, true);
		}
	};
}
