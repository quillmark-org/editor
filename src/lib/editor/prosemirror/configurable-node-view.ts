/**
 * specific solutions for specific nodes.
 *
 * This allows us to delete ~200 lines of duplicate boilerplate code across
 * PlaceholderNodeView, CommentNodeView, and InlineMetadataNodeView.
 */

import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';

/**
 * Configuration interface for defining a NodeView's behavior
 */
export interface NodeViewConfig {
	/** HTML tag name for the root element (default: 'span') */
	tagName?: string;

	/** CSS class name(s) to apply to the root element */
	className: string;

	/** Initial inline styles to apply */
	style?: string;

	/**
	 * Render content and attributes into the DOM element.
	 * Called during construction and update.
	 */
	render?: (dom: HTMLElement, node: PMNode) => void;

	/**
	 * Optional interaction handlers
	 */
	interactive?: {
		/** Click handler */
		onClick?: (
			view: EditorView,
			getPos: () => number | undefined,
			node: PMNode,
			dom: HTMLElement,
			event: MouseEvent
		) => void;

		/** Hover handlers */
		onHover?: (dom: HTMLElement, isHovering: boolean) => void;
	};

	/**
	 * Selection state visual handlers
	 */
	selection?: {
		/** Called when the node is selected */
		onSelect?: (dom: HTMLElement) => void;

		/** Called when the node is deselected */
		onDeselect?: (dom: HTMLElement) => void;
	};

	/**
	 * Custom ignoreMutation logic.
	 * If not provided, defaults to true (not editable).
	 */
	ignoreMutation?: (mutation: MutationRecord | { type: 'selection'; target: Node }) => boolean;

	/**
	 * Helper to determine if update should succeed.
	 * Defaults to checking if node.type matches.
	 */
	shouldUpdate?: (newNode: PMNode, oldNode: PMNode) => boolean;
}

/**
 * A generic, configurable NodeView implementation
 */
export class ConfigurableNodeView implements NodeView {
	dom: HTMLElement;
	protected node: PMNode;
	protected view: EditorView;
	protected getPos: () => number | undefined;
	protected config: NodeViewConfig;

	constructor(
		node: PMNode,
		view: EditorView,
		getPos: () => number | undefined,
		config: NodeViewConfig
	) {
		this.node = node;
		this.view = view;
		this.getPos = getPos;
		this.config = config;

		// 1. Create DOM
		this.dom = document.createElement(config.tagName || 'span');
		this.dom.className = config.className;
		if (config.style) {
			this.dom.style.cssText = config.style;
		}

		// 2. Initial Render
		if (config.render) {
			config.render(this.dom, node);
		}

		// 3. Attach Event Listeners
		this.attachListeners();
	}

	private attachListeners() {
		// Click Handler
		if (this.config.interactive?.onClick) {
			this.dom.addEventListener('click', (e) => {
				// Prevent default browser behavior/selection changes if we're handling it
				e.preventDefault();
				e.stopPropagation();

				const pos = this.getPos();
				if (pos !== undefined && this.config.interactive!.onClick) {
					this.config.interactive!.onClick(this.view, this.getPos, this.node, this.dom, e);
				}
			});
		}

		// Hover Handlers
		if (this.config.interactive?.onHover) {
			this.dom.addEventListener('mouseenter', () => {
				this.config.interactive!.onHover!(this.dom, true);
			});
			this.dom.addEventListener('mouseleave', () => {
				this.config.interactive!.onHover!(this.dom, false);
			});
		}
	}

	/**
	 * Standard ProseMirror update method
	 */
	update(node: PMNode): boolean {
		// Custom update check
		if (this.config.shouldUpdate) {
			if (!this.config.shouldUpdate(node, this.node)) return false;
		} else {
			// Default check: type equivalence
			if (node.type !== this.node.type) return false;
		}

		this.node = node;

		// re-render content
		if (this.config.render) {
			this.config.render(this.dom, node);
		}

		return true;
	}

	/**
	 * Selection handling
	 */
	selectNode(): void {
		if (this.config.selection?.onSelect) {
			this.config.selection.onSelect(this.dom);
		}
	}

	deselectNode(): void {
		if (this.config.selection?.onDeselect) {
			this.config.selection.onDeselect(this.dom);
		}
	}

	/**
	 * Boilerplate: Stop events from bubbling to editor
	 * If we have a click handler, we already stopped it there.
	 * For other events inside this atom, we generally want to stop them
	 * so ProseMirror doesn't try to handle cursor motion etc inside our atom.
	 */
	stopEvent(_event: Event): boolean {
		return true;
	}

	/**
	 * Boilerplate: Ignore DOM mutations (we handle updates via update())
	 */
	ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
		if (this.config.ignoreMutation) {
			return this.config.ignoreMutation(mutation);
		}
		return true;
	}

	destroy(): void {
		// Cleanup if needed (listeners on this.dom are auto-removed by browser when dom is removed)
	}
}

/**
 * Factory helper to create a NodeView factory function
 */
export function createNodeViewFactory(
	config:
		| NodeViewConfig
		| ((node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeViewConfig)
) {
	return (node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
		const resolvedConfig = typeof config === 'function' ? config(node, view, getPos) : config;
		return new ConfigurableNodeView(node, view, getPos, resolvedConfig);
	};
}
