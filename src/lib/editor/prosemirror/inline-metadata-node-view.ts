/**
 * ProseMirror NodeView for inline_metadata nodes.
 * Renders a minimal visual separator that allows cursor navigation,
 * while the actual editing is done through the CardMetadataWidget.
 */

import type { Node } from 'prosemirror-model';
import { createNodeViewFactory } from './configurable-node-view';

/**
 * Factory function to create inline_metadata NodeView
 * Uses the ConfigurableNodeView pattern.
 */
export const createInlineMetadataNodeView = createNodeViewFactory({
	tagName: 'div',
	className: 'pm-inline-metadata',

	// Base styles
	style: `
		height: 2px;
		margin: 0.5rem 0;
		background: linear-gradient(90deg, transparent, hsl(var(--border) / 0.5), transparent);
		border-radius: 1px;
		opacity: 0.6;
		pointer-events: none;
	`,

	render: (dom: HTMLElement, node: Node) => {
		dom.setAttribute('data-metadata', node.attrs.content as string);
	},

	selection: {
		onSelect: (dom: HTMLElement) => {
			dom.style.opacity = '1';
			dom.style.background =
				'linear-gradient(90deg, transparent, hsl(var(--accent) / 0.6), transparent)';
		},
		onDeselect: (dom: HTMLElement) => {
			dom.style.opacity = '0.6';
			dom.style.background =
				'linear-gradient(90deg, transparent, hsl(var(--border) / 0.5), transparent)';
		}
	}
});
