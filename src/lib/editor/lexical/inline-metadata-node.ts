/**
 * Custom Lexical node representing a hidden YAML inline-metadata block
 * (rendered as a thin gradient separator). Mirrors the legacy ProseMirror
 * `inline_metadata` node — atomic, non-editable, content stored verbatim.
 */

import {
	$applyNodeReplacement,
	DecoratorNode,
	type DOMConversionMap,
	type DOMConversionOutput,
	type DOMExportOutput,
	type EditorConfig,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread
} from 'lexical';

export type SerializedInlineMetadataNode = Spread<
	{
		content: string;
		type: 'inline-metadata';
		version: 1;
	},
	SerializedLexicalNode
>;

export class InlineMetadataNode extends DecoratorNode<null> {
	__content: string;

	static getType(): string {
		return 'inline-metadata';
	}

	static clone(node: InlineMetadataNode): InlineMetadataNode {
		return new InlineMetadataNode(node.__content, node.__key);
	}

	constructor(content: string = '', key?: NodeKey) {
		super(key);
		this.__content = content;
	}

	getContent(): string {
		return this.getLatest().__content;
	}

	setContent(content: string): this {
		const writable = this.getWritable();
		writable.__content = content;
		return writable;
	}

	isInline(): boolean {
		return false;
	}

	isKeyboardSelectable(): boolean {
		return true;
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const dom = document.createElement('div');
		dom.className = 'qm-inline-metadata';
		dom.setAttribute('data-metadata', this.__content);
		dom.title = 'Inline metadata block (hidden)';
		return dom;
	}

	updateDOM(prevNode: this, dom: HTMLElement): boolean {
		if (prevNode.__content !== this.__content) {
			dom.setAttribute('data-metadata', this.__content);
		}
		return false;
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement('div');
		element.className = 'qm-inline-metadata';
		element.setAttribute('data-metadata', this.__content);
		return { element };
	}

	static importDOM(): DOMConversionMap | null {
		return {
			div: (domNode: HTMLElement) => {
				if (!domNode.classList.contains('qm-inline-metadata')) return null;
				return {
					conversion: (el: HTMLElement): DOMConversionOutput => ({
						node: $createInlineMetadataNode(el.getAttribute('data-metadata') ?? '')
					}),
					priority: 1
				};
			}
		};
	}

	static importJSON(serialized: SerializedInlineMetadataNode): InlineMetadataNode {
		return $createInlineMetadataNode(serialized.content);
	}

	exportJSON(): SerializedInlineMetadataNode {
		return {
			...super.exportJSON(),
			content: this.__content,
			type: 'inline-metadata',
			version: 1
		};
	}

	// DecoratorNode requires decorate(); rendering happens in createDOM, so
	// nothing extra is needed here.
	decorate(): null {
		return null;
	}
}

export function $createInlineMetadataNode(content: string = ''): InlineMetadataNode {
	return $applyNodeReplacement(new InlineMetadataNode(content));
}

export function $isInlineMetadataNode(
	node: LexicalNode | null | undefined
): node is InlineMetadataNode {
	return node instanceof InlineMetadataNode;
}
