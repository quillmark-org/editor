import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './parser';
import { serializeMarkdown } from './serializer';

describe('QuillMark Parser', () => {
	it('parses underline syntax', () => {
		const markdown = 'This is <u>underlined</u> text.';
		const doc = parseMarkdown(markdown);

		// Expected structure: paragraph -> [text "This is ", text "underlined" (marked), text " text."]
		expect(doc).toBeDefined();
		const paragraph = doc?.firstChild;
		expect(paragraph?.type.name).toBe('paragraph');

		// Find the underlined node
		let foundUnderline = false;
		paragraph?.content.forEach((node) => {
			if (node.text === 'underlined') {
				const hasUnderline = node.marks.some((m) => m.type.name === 'underline');
				if (hasUnderline) foundUnderline = true;
			}
		});

		expect(foundUnderline).toBe(true);
	});

	it('preserves double curly braces as plain text', () => {
		// Double curly braces are no longer placeholders and should be preserved as plain text
		const md = 'Hello {{world}}';
		const doc = parseMarkdown(md);

		expect(doc.toJSON()).toEqual({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'Hello {{world}}' }]
				}
			]
		});
	});

	it('preserves double curly braces with email-like content', () => {
		// This ensures {{email@example.com}} does NOT become
		// <mailto:email@example.com> (single chevrons) due to autolink
		const md = '{{airman.snuffy@us.af.mil}}';
		const doc = parseMarkdown(md);

		expect(doc.toJSON()).toEqual({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: '{{airman.snuffy@us.af.mil}}' }]
				}
			]
		});
	});

	it('strips inline markdown comments', () => {
		const md = 'Hello <!-- secret --> world';
		const doc = parseMarkdown(md);

		expect(doc.toJSON()).toEqual({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'Hello  world' }]
				}
			]
		});
		expect(doc.textContent).toBe('Hello  world');
	});

	it('strips multiline markdown comments', () => {
		const md = `Start
<!-- hidden
multiline -->
End`;
		const doc = parseMarkdown(md);

		expect(doc.toJSON()).toEqual({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'Start' }]
				},
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'End' }]
				}
			]
		});
		expect(doc.textContent).toBe('StartEnd');
	});

	it('removes markdown comments during parse and serialize', () => {
		const md = 'Alpha <!-- hidden --> Beta';
		const doc = parseMarkdown(md);
		const serialized = serializeMarkdown(doc);

		expect(serialized).toBe('Alpha  Beta');
	});

	it('parses inline metadata blocks', () => {
		const md = `---
key: value
other: 123
---`;
		const doc = parseMarkdown(md);

		expect(doc.toJSON()).toEqual({
			type: 'doc',
			content: [
				{
					type: 'inline_metadata',
					attrs: { content: 'key: value\nother: 123' }
				}
			]
		});
	});

	it('parses inline metadata blocks with surrounding content', () => {
		const md = `Start text

---
key: value
---

End text`;
		const doc = parseMarkdown(md);

		expect(doc.toJSON()).toEqual({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'Start text' }]
				},
				{
					type: 'inline_metadata',
					attrs: { content: 'key: value' }
				},
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'End text' }]
				}
			]
		});
	});

	it('parses standard horizontal rules as text (feature disabled)', () => {
		// Just one HR
		const md = `Text

---

More Text`;
		const doc = parseMarkdown(md);

		// [REMEDIATION] Spec Alignment: HR is disabled and treated as plain text (or metadata delimiter if valid)
		// Here '---' typically becomes a paragraph with text "---" or part of previous paragraph depending on spacing/parsing?
		// Since input has blank lines, it's likely a separate paragraph.
		const json = doc.toJSON();
		// content[0] = Text
		// content[1] = Paragraph("---")
		expect(json.content[1].type).toBe('paragraph');
		expect(json.content[1].content[0].text).toBe('---');
	});

	// =============================================================================
	// List Tests
	// =============================================================================

	it('parses bullet lists', () => {
		const md = `- Item 1
- Item 2
- Item 3`;
		const doc = parseMarkdown(md);

		expect(doc.firstChild?.type.name).toBe('bullet_list');
		expect(doc.firstChild?.childCount).toBe(3);

		// Verify first item content
		const firstItem = doc.firstChild?.firstChild;
		expect(firstItem?.type.name).toBe('list_item');
		expect(firstItem?.textContent).toBe('Item 1');
	});

	it('parses ordered lists', () => {
		const md = `1. First
2. Second
3. Third`;
		const doc = parseMarkdown(md);

		expect(doc.firstChild?.type.name).toBe('ordered_list');
		expect(doc.firstChild?.childCount).toBe(3);

		// Verify first item content
		const firstItem = doc.firstChild?.firstChild;
		expect(firstItem?.type.name).toBe('list_item');
		expect(firstItem?.textContent).toBe('First');
	});

	it('parses nested bullet lists', () => {
		const md = `- Parent 1
  - Child 1a
  - Child 1b
- Parent 2`;
		const doc = parseMarkdown(md);

		expect(doc.firstChild?.type.name).toBe('bullet_list');
		expect(doc.firstChild?.childCount).toBe(2);

		// First item should have a nested list
		const firstItem = doc.firstChild?.firstChild;
		expect(firstItem?.type.name).toBe('list_item');

		// The nested list is the second child of the list_item
		let hasNestedList = false;
		firstItem?.forEach((child) => {
			if (child.type.name === 'bullet_list') {
				hasNestedList = true;
				expect(child.childCount).toBe(2);
			}
		});
		expect(hasNestedList).toBe(true);
	});

	it('parses list with + marker', () => {
		// This tests the + marker which is valid CommonMark
		const md = `+ Item A
+ Item B`;
		const doc = parseMarkdown(md);

		expect(doc.firstChild?.type.name).toBe('bullet_list');
		expect(doc.firstChild?.childCount).toBe(2);
	});

	it('parses mixed nested list types', () => {
		const md = `- Bullet parent
  1. Ordered child 1
  2. Ordered child 2`;
		const doc = parseMarkdown(md);

		expect(doc.firstChild?.type.name).toBe('bullet_list');

		// First item should have a nested ordered list
		const firstItem = doc.firstChild?.firstChild;
		let hasNestedOrderedList = false;
		firstItem?.forEach((child) => {
			if (child.type.name === 'ordered_list') {
				hasNestedOrderedList = true;
				expect(child.childCount).toBe(2);
			}
		});
		expect(hasNestedOrderedList).toBe(true);
	});

	// =============================================================================
	// Table Tests
	// =============================================================================

	it('parses a table with headers and body cells', () => {
		const md = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;
		const doc = parseMarkdown(md);
		const json = doc.toJSON();

		expect(json.content[0].type).toBe('table');
		const rows = json.content[0].content;
		expect(rows).toHaveLength(2);

		// Header row
		expect(rows[0].type).toBe('table_row');
		expect(rows[0].content[0].type).toBe('table_header');
		expect(rows[0].content[0].content[0].content[0].text).toBe('Header 1');
		expect(rows[0].content[1].type).toBe('table_header');
		expect(rows[0].content[1].content[0].content[0].text).toBe('Header 2');

		// Body row
		expect(rows[1].type).toBe('table_row');
		expect(rows[1].content[0].type).toBe('table_cell');
		expect(rows[1].content[0].content[0].content[0].text).toBe('Cell 1');
		expect(rows[1].content[1].type).toBe('table_cell');
		expect(rows[1].content[1].content[0].content[0].text).toBe('Cell 2');
	});

	it('parses a table with multiple body rows', () => {
		const md = `| A | B |
|---|---|
| 1 | 2 |
| 3 | 4 |`;
		const doc = parseMarkdown(md);
		const json = doc.toJSON();

		const rows = json.content[0].content;
		expect(rows).toHaveLength(3);
		expect(rows[0].content[0].type).toBe('table_header');
		expect(rows[1].content[0].type).toBe('table_cell');
		expect(rows[2].content[0].type).toBe('table_cell');
		expect(rows[2].content[1].content[0].content[0].text).toBe('4');
	});

	it('wraps table cell content in paragraphs (block+ content model)', () => {
		const md = `| H |
|---|
| C |`;
		const doc = parseMarkdown(md);
		const json = doc.toJSON();

		// Header cell: table_header → paragraph → text
		const headerCell = json.content[0].content[0].content[0];
		expect(headerCell.type).toBe('table_header');
		expect(headerCell.content[0].type).toBe('paragraph');
		expect(headerCell.content[0].content[0].text).toBe('H');

		// Body cell: table_cell → paragraph → text
		const bodyCell = json.content[0].content[1].content[0];
		expect(bodyCell.type).toBe('table_cell');
		expect(bodyCell.content[0].type).toBe('paragraph');
		expect(bodyCell.content[0].content[0].text).toBe('C');
	});

	it('parses table with inline formatting in cells', () => {
		const md = `| **Bold** | *Italic* |
|----------|----------|
| Normal   | <u>Under</u>|`;
		const doc = parseMarkdown(md);
		const json = doc.toJSON();

		// Header cell with bold
		const headerCell = json.content[0].content[0].content[0];
		expect(headerCell.content[0].content[0].marks[0].type).toBe('strong');

		// Body cell with underline
		const bodyCell = json.content[0].content[1].content[1];
		expect(bodyCell.content[0].content[0].marks[0].type).toBe('underline');
	});
});
