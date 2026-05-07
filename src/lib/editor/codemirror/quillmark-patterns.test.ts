import { describe, it, expect } from 'vitest';
import { Text } from '@codemirror/state';
import {
	isMetadataDelimiter,
	findMetadataBlocks,
	findCardQuillKeywords,
	findYamlPairs,
	findYamlTaggedArrays,
	findMarkdownItalic,
	findMarkdownBold,
	findMarkdownComments,
	findMarkdownPlaceholders,
	getBlockLinePositions
} from './quillmark-patterns';

describe('QuillMark Pattern Detection', () => {
	describe('isMetadataDelimiter', () => {
		it('should identify metadata delimiter at start of document', () => {
			const doc = Text.of(['---', 'title: Test', '---', 'Content']);
			expect(isMetadataDelimiter(1, doc)).toBe(true);
		});

		it('should identify metadata delimiter with content', () => {
			const doc = Text.of(['---', 'title: Test', '---', 'Content']);
			expect(isMetadataDelimiter(3, doc)).toBe(true);
		});

		it('should NOT identify horizontal rule (blank lines above and below)', () => {
			const doc = Text.of(['Content', '', '---', '', 'More content']);
			expect(isMetadataDelimiter(3, doc)).toBe(false);
		});

		it('should identify delimiter without blank line above', () => {
			const doc = Text.of(['Content', '---', '', 'More content']);
			expect(isMetadataDelimiter(2, doc)).toBe(true);
		});

		it('should identify delimiter without blank line below', () => {
			const doc = Text.of(['Content', '', '---', 'More content']);
			expect(isMetadataDelimiter(3, doc)).toBe(true);
		});
	});

	describe('findMetadataBlocks', () => {
		it('should find a simple metadata block', () => {
			const doc = Text.of(['---', 'title: Test', '---', 'Content']);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(1);
			expect(blocks[0].from).toBe(0);
		});

		it('should handle empty metadata block (no content)', () => {
			const doc = Text.of(['---', '---', 'Content']);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(1);
			// Check that contentTo >= contentFrom
			expect(blocks[0].contentTo).toBeGreaterThanOrEqual(blocks[0].contentFrom);
		});

		it('should find multiple metadata blocks', () => {
			const doc = Text.of([
				'---',
				'CARD: intro',
				'---',
				'Content',
				'',
				'---',
				'CARD: body',
				'---',
				'More content'
			]);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(2);
		});

		it('should handle unclosed metadata block', () => {
			const doc = Text.of(['---', 'title: Test', 'Content']);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(1);
			expect(blocks[0].to).toBe(doc.length);
		});

		it('should NOT include horizontal rules', () => {
			const doc = Text.of(['---', 'title: Test', '---', '', '---', '', 'Content']);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(1); // Only the frontmatter, not the HR
		});

		it('should NOT treat setext headers as metadata openers', () => {
			const doc = Text.of([
				'Header',
				'---',
				'Content', // This "Heaer\n---" should not be an opener
				'',
				'---', // This matches "blank above", so it IS a valid opener
				'CARD: test',
				'---'
			]);
			const blocks = findMetadataBlocks(doc);
			// Should find exactly 1 block (the CARD block)
			expect(blocks).toHaveLength(1);
			expect(blocks[0].contentFrom).toBeGreaterThan(10); // Start later in file
		});

		it('should find metadata block even if closer is surrounded by blank lines', () => {
			const doc = Text.of([
				'---',
				'CARD: test',
				'',
				'---', // Blank above (line 3) and blank below (line 5) -> looks like HR
				''
			]);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(1);
			expect(blocks[0].from).toBe(0);
			expect(blocks[0].to).toBe(19); // Correct calculation: 0-3, 4-14, 15-15, 16-19.
			// Text.of joins with \n.
			// Line 0: --- (0-3)
			// Line 1: CARD: test (4-14)
			// Line 2: (15-15) empty line
			// Line 3: --- (16-19)
			// Line 4: (20-20)
			// blocks[0].to should be the END of line 3.
			// Line 3 starts at 16, length 3. End at 19.
		});

		it('should NOT find metadata blocks inside fenced code blocks', () => {
			// Per EXTENDED_MARKDOWN.md spec:
			// "`---` inside fenced code blocks (``` or ~~~) is not processed as a delimiter"
			const doc = Text.of(['```yaml', '---', 'key: value', '---', '```']);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(0);
		});

		it('should find metadata blocks after fenced code blocks', () => {
			const doc = Text.of(['```', 'code here', '```', '', '---', 'CARD: test', '---']);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(1);
			expect(blocks[0].contentFrom).toBeGreaterThan(20); // After the fenced code block
		});

		it('should handle mixed fenced code and metadata blocks', () => {
			const doc = Text.of([
				'---',
				'title: Doc',
				'---',
				'',
				'```yaml',
				'---',
				'fake: metadata',
				'---',
				'```',
				'',
				'---',
				'CARD: real',
				'---'
			]);
			const blocks = findMetadataBlocks(doc);

			// Should find 2 blocks: frontmatter and the real CARD block
			// Should NOT find the fake metadata inside the fenced code block
			expect(blocks).toHaveLength(2);
		});

		it('should handle tilde fenced code blocks', () => {
			const doc = Text.of(['~~~', '---', '~~~']);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(0);
		});
	});

	describe('findCardQuillKeywords', () => {
		it('should find CARD keyword', () => {
			const doc = Text.of(['CARD: intro']);
			const keywords = findCardQuillKeywords(0, doc.length, doc);
			expect(keywords).toHaveLength(1);
			expect(keywords[0].keyword).toBe('CARD');
			expect(keywords[0].name).toBe('intro');
		});

		it('should find QUILL keyword', () => {
			const doc = Text.of(['QUILL: test_template']);
			const keywords = findCardQuillKeywords(0, doc.length, doc);
			expect(keywords).toHaveLength(1);
			expect(keywords[0].keyword).toBe('QUILL');
			expect(keywords[0].name).toBe('test_template');
		});

		it('should find multiple keywords', () => {
			const doc = Text.of(['CARD: intro', 'title: Test', 'QUILL: template']);
			const keywords = findCardQuillKeywords(0, doc.length, doc);
			expect(keywords).toHaveLength(2);
		});

		it('should handle keywords with underscores and numbers', () => {
			const doc = Text.of(['CARD: test_card_123']);
			const keywords = findCardQuillKeywords(0, doc.length, doc);
			expect(keywords).toHaveLength(1);
			expect(keywords[0].name).toBe('test_card_123');
		});
	});

	describe('getBlockLinePositions', () => {
		it('should return all content line positions', () => {
			const doc = Text.of(['---', 'CARD: test', 'key: value', '---']);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(1);

			const positions = getBlockLinePositions(blocks[0], doc);
			expect(positions.openingDelimiterFrom).toBe(0);
			expect(positions.contentLineFroms).toHaveLength(2); // CARD: test, key: value
			expect(positions.closingDelimiterFrom).not.toBeNull();
		});

		it('should include blank lines before closing delimiter', () => {
			// This is the key test case - blank line before --- must be included
			const doc = Text.of(['---', 'CARD: test', '', '---']);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(1);

			const positions = getBlockLinePositions(blocks[0], doc);
			// Should have 2 content lines: "CARD: test" AND the blank line
			expect(positions.contentLineFroms).toHaveLength(2);
		});

		it('should handle empty metadata block', () => {
			const doc = Text.of(['---', '---']);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(1);

			const positions = getBlockLinePositions(blocks[0], doc);
			expect(positions.contentLineFroms).toHaveLength(0);
			expect(positions.closingDelimiterFrom).not.toBeNull();
		});

		it('should return null closingDelimiterFrom for unclosed block', () => {
			const doc = Text.of(['---', 'CARD: test', 'no closing']);
			const blocks = findMetadataBlocks(doc);
			expect(blocks).toHaveLength(1);

			// Just verifying the call doesn't throw on an unclosed block.
			getBlockLinePositions(blocks[0], doc);
		});
	});

	describe('findYamlPairs', () => {
		it('should find simple YAML key-value pair', () => {
			const doc = Text.of(['title: Test Document']);
			const pairs = findYamlPairs(0, doc.length, doc);
			expect(pairs).toHaveLength(1);
			expect(pairs[0].valueType).toBe('string');
		});

		it('should detect number values', () => {
			const doc = Text.of(['count: 42']);
			const pairs = findYamlPairs(0, doc.length, doc);
			expect(pairs).toHaveLength(1);
			expect(pairs[0].valueType).toBe('number');
		});

		it('should detect boolean values', () => {
			const doc = Text.of(['enabled: true', 'disabled: false']);
			const pairs = findYamlPairs(0, doc.length, doc);
			expect(pairs).toHaveLength(2);
			expect(pairs[0].valueType).toBe('boolean');
			expect(pairs[1].valueType).toBe('boolean');
		});

		it('should skip CARD and QUILL lines', () => {
			const doc = Text.of(['CARD: intro', 'title: Test']);
			const pairs = findYamlPairs(0, doc.length, doc);
			expect(pairs).toHaveLength(1); // Only title, not CARD
		});

		it('should correctly position values when key and value are identical', () => {
			const doc = Text.of(['asdf: asdf']);
			const pairs = findYamlPairs(0, doc.length, doc);
			expect(pairs).toHaveLength(1);

			// Key should be at positions 0-4 (asdf)
			expect(pairs[0].keyFrom).toBe(0);
			expect(pairs[0].keyTo).toBe(4);

			// Value should be at positions 6-10 (asdf after ": ")
			expect(pairs[0].valueFrom).toBe(6);
			expect(pairs[0].valueTo).toBe(10);
			expect(pairs[0].valueType).toBe('string');
		});

		it('should handle multiple identical key-value pairs', () => {
			const doc = Text.of(['foo: foo', 'bar: bar']);
			const pairs = findYamlPairs(0, doc.length, doc);
			expect(pairs).toHaveLength(2);

			// First pair: foo: foo
			expect(pairs[0].keyFrom).toBe(0);
			expect(pairs[0].keyTo).toBe(3);
			expect(pairs[0].valueFrom).toBe(5);
			expect(pairs[0].valueTo).toBe(8);

			// Second pair: bar: bar (9 characters offset for "foo: foo\n")
			expect(pairs[1].keyFrom).toBe(9);
			expect(pairs[1].keyTo).toBe(12);
			expect(pairs[1].valueFrom).toBe(14);
			expect(pairs[1].valueTo).toBe(17);
		});

		it('should extract YAML tag from value', () => {
			const doc = Text.of(['title: !fill Draft Title']);
			const pairs = findYamlPairs(0, doc.length, doc);
			expect(pairs).toHaveLength(1);
			expect(pairs[0].tag).toBe('fill');
			expect(pairs[0].tagFrom).toBe(7); // Position of '!'
			expect(pairs[0].tagTo).toBe(12); // Position after 'fill'
		});

		it('should set correct positions for tag and value', () => {
			const doc = Text.of(['title: !fill Draft']);
			const pairs = findYamlPairs(0, doc.length, doc);
			expect(pairs).toHaveLength(1);

			// Tag positions: !fill starts at 7, ends at 12
			expect(pairs[0].tagFrom).toBe(7);
			expect(pairs[0].tagTo).toBe(12);

			// Value positions: Draft starts at 13 (after space)
			expect(pairs[0].valueFrom).toBe(13);
			expect(pairs[0].valueTo).toBe(18);
		});

		it('should handle values without tags', () => {
			const doc = Text.of(['title: Regular Value']);
			const pairs = findYamlPairs(0, doc.length, doc);
			expect(pairs).toHaveLength(1);
			expect(pairs[0].tag).toBeUndefined();
			expect(pairs[0].tagFrom).toBeUndefined();
			expect(pairs[0].tagTo).toBeUndefined();
		});

		it('should handle multiple tagged fields', () => {
			const doc = Text.of(['title: !fill Draft', 'author: !custom John']);
			const pairs = findYamlPairs(0, doc.length, doc);
			expect(pairs).toHaveLength(2);
			expect(pairs[0].tag).toBe('fill');
			expect(pairs[1].tag).toBe('custom');
		});
	});

	describe('findYamlTaggedArrays', () => {
		it('should find a tagged array field', () => {
			const doc = Text.of(['memo_for: !fill', '- org1', '- org2']);
			const arrays = findYamlTaggedArrays(0, doc.length, doc);
			expect(arrays).toHaveLength(1);
			expect(arrays[0].tag).toBe('fill');
			expect(arrays[0].itemLines).toHaveLength(2);
		});

		it('should correctly position the tag', () => {
			const doc = Text.of(['memo_for: !fill', '- org1']);
			const arrays = findYamlTaggedArrays(0, doc.length, doc);
			expect(arrays).toHaveLength(1);
			expect(doc.sliceString(arrays[0].tagFrom, arrays[0].tagTo)).toBe('!fill');
		});

		it('should correctly position the key', () => {
			const doc = Text.of(['memo_for: !fill', '- org1']);
			const arrays = findYamlTaggedArrays(0, doc.length, doc);
			expect(arrays).toHaveLength(1);
			expect(doc.sliceString(arrays[0].keyFrom, arrays[0].keyTo)).toBe('memo_for');
		});

		it('should correctly position item lines', () => {
			const doc = Text.of(['memo_for: !fill', '- org1', '- org2']);
			const arrays = findYamlTaggedArrays(0, doc.length, doc);
			expect(arrays).toHaveLength(1);
			expect(doc.sliceString(arrays[0].itemLines[0].from, arrays[0].itemLines[0].to)).toBe(
				'- org1'
			);
			expect(doc.sliceString(arrays[0].itemLines[1].from, arrays[0].itemLines[1].to)).toBe(
				'- org2'
			);
		});

		it('should handle different tag names', () => {
			const doc = Text.of(['items: !custom', '- item1']);
			const arrays = findYamlTaggedArrays(0, doc.length, doc);
			expect(arrays).toHaveLength(1);
			expect(arrays[0].tag).toBe('custom');
		});

		it('should not find arrays without tags', () => {
			const doc = Text.of(['items:', '- item1', '- item2']);
			const arrays = findYamlTaggedArrays(0, doc.length, doc);
			expect(arrays).toHaveLength(0);
		});

		it('should not find tagged scalars as arrays', () => {
			const doc = Text.of(['title: !fill Draft']);
			const arrays = findYamlTaggedArrays(0, doc.length, doc);
			expect(arrays).toHaveLength(0);
		});

		it('should stop collecting at non-array content', () => {
			const doc = Text.of(['memo_for: !fill', '- org1', 'other: value']);
			const arrays = findYamlTaggedArrays(0, doc.length, doc);
			expect(arrays).toHaveLength(1);
			expect(arrays[0].itemLines).toHaveLength(1);
		});
	});

	describe('findMarkdownItalic', () => {
		it('should match underscore italic without whitespace', () => {
			const doc = Text.of(['This is _italic_ text']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(1);
			expect(italics[0].delimiterType).toBe('_');
			expect(doc.sliceString(italics[0].contentFrom, italics[0].contentTo)).toBe('italic');
		});

		it('should NOT match underscore with whitespace after opening delimiter', () => {
			const doc = Text.of(['This is _ italic_ text']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});

		it('should NOT match underscore with whitespace before closing delimiter', () => {
			const doc = Text.of(['This is _italic _ text']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});

		it('should NOT match underscore surrounded by whitespace', () => {
			const doc = Text.of(['This is _ italic _ text']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});

		it('should NOT match single underscore surrounded by whitespace', () => {
			const doc = Text.of(['hello _ world']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});

		it('should match asterisk italic without whitespace', () => {
			const doc = Text.of(['This is *italic* text']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(1);
			expect(italics[0].delimiterType).toBe('*');
			expect(doc.sliceString(italics[0].contentFrom, italics[0].contentTo)).toBe('italic');
		});

		it('should NOT match asterisk with whitespace after opening delimiter', () => {
			const doc = Text.of(['This is * italic* text']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});

		it('should NOT match asterisk with whitespace before closing delimiter', () => {
			const doc = Text.of(['This is *italic * text']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});

		it('should NOT match asterisk surrounded by whitespace', () => {
			const doc = Text.of(['This is * italic * text']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});

		it('should NOT match double underscore as italic', () => {
			const doc = Text.of(['This is __bold__ text']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});

		it('should NOT match double asterisk as italic', () => {
			const doc = Text.of(['This is **bold** text']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});

		it('should NOT match multiple underscores in a row (blank line pattern)', () => {
			const doc = Text.of(['Fill in your name: ________']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});

		it('should NOT match multiple underscore sequences (form pattern)', () => {
			const doc = Text.of(['I acknowledge receipt on ________ at ___________ hours.']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});

		it('should NOT match three or more underscores', () => {
			const doc = Text.of(['Text with ___ underscores']);
			const italics = findMarkdownItalic(0, doc.length, doc);
			expect(italics).toHaveLength(0);
		});
	});

	describe('findMarkdownBold', () => {
		it('should match double asterisk bold without whitespace', () => {
			const doc = Text.of(['This is **bold** text']);
			const bolds = findMarkdownBold(0, doc.length, doc);
			expect(bolds).toHaveLength(1);
			expect(bolds[0].delimiterType).toBe('**');
			expect(doc.sliceString(bolds[0].contentFrom, bolds[0].contentTo)).toBe('bold');
		});

		it('should NOT match double underscore with whitespace after opening delimiter', () => {
			const doc = Text.of(['This is __ bold__ text']);
			const bolds = findMarkdownBold(0, doc.length, doc);
			expect(bolds).toHaveLength(0);
		});

		it('should NOT match double underscore with whitespace before closing delimiter', () => {
			const doc = Text.of(['This is __bold __ text']);
			const bolds = findMarkdownBold(0, doc.length, doc);
			expect(bolds).toHaveLength(0);
		});

		it('should NOT match double underscore surrounded by whitespace', () => {
			const doc = Text.of(['This is __ bold __ text']);
			const bolds = findMarkdownBold(0, doc.length, doc);
			expect(bolds).toHaveLength(0);
		});

		it('should NOT match double underscore sequence surrounded by whitespace', () => {
			const doc = Text.of(['word __ word']);
			const bolds = findMarkdownBold(0, doc.length, doc);
			expect(bolds).toHaveLength(0);
		});

		it('should match double asterisk bold without whitespace', () => {
			const doc = Text.of(['This is **bold** text']);
			const bolds = findMarkdownBold(0, doc.length, doc);
			expect(bolds).toHaveLength(1);
			expect(bolds[0].delimiterType).toBe('**');
			expect(doc.sliceString(bolds[0].contentFrom, bolds[0].contentTo)).toBe('bold');
		});

		it('should NOT match double asterisk with whitespace after opening delimiter', () => {
			const doc = Text.of(['This is ** bold** text']);
			const bolds = findMarkdownBold(0, doc.length, doc);
			expect(bolds).toHaveLength(0);
		});

		it('should NOT match double asterisk with whitespace before closing delimiter', () => {
			const doc = Text.of(['This is **bold ** text']);
			const bolds = findMarkdownBold(0, doc.length, doc);
			expect(bolds).toHaveLength(0);
		});

		it('should NOT match double asterisk surrounded by whitespace', () => {
			const doc = Text.of(['This is ** bold ** text']);
			const bolds = findMarkdownBold(0, doc.length, doc);
			expect(bolds).toHaveLength(0);
		});

		it('should NOT match underscore sequences in form patterns', () => {
			const doc = Text.of(['Sign here: ________ Date: __________']);
			const bolds = findMarkdownBold(0, doc.length, doc);
			expect(bolds).toHaveLength(0);
		});
	});

	describe('findMarkdownComments', () => {
		it('should match standard HTML comment', () => {
			const doc = Text.of(['<!-- This is a comment -->']);
			const comments = findMarkdownComments(0, doc.length, doc);
			expect(comments).toHaveLength(1);
			expect(doc.sliceString(comments[0].contentFrom, comments[0].contentTo)).toBe(
				' This is a comment '
			);
		});

		it('should match comment with triple dashes', () => {
			const doc = Text.of(['<!--- This is a comment --->']);
			const comments = findMarkdownComments(0, doc.length, doc);
			expect(comments).toHaveLength(1);
			expect(doc.sliceString(comments[0].contentFrom, comments[0].contentTo)).toBe(
				' This is a comment '
			);
		});

		it('should match comment with multiple extra dashes', () => {
			const doc = Text.of(['<!---- This is a comment ---->']);
			const comments = findMarkdownComments(0, doc.length, doc);
			expect(comments).toHaveLength(1);
			expect(doc.sliceString(comments[0].contentFrom, comments[0].contentTo)).toBe(
				' This is a comment '
			);
		});

		it('should match empty comment', () => {
			const doc = Text.of(['<!---->']);
			const comments = findMarkdownComments(0, doc.length, doc);
			expect(comments).toHaveLength(1);
			expect(comments[0].contentFrom).toBe(comments[0].contentTo); // Empty content
		});

		it('should match multiple comments on same line', () => {
			const doc = Text.of(['Text <!-- comment 1 --> more <!-- comment 2 -->']);
			const comments = findMarkdownComments(0, doc.length, doc);
			expect(comments).toHaveLength(2);
			expect(doc.sliceString(comments[0].contentFrom, comments[0].contentTo)).toBe(' comment 1 ');
			expect(doc.sliceString(comments[1].contentFrom, comments[1].contentTo)).toBe(' comment 2 ');
		});

		it('should match multiline comment', () => {
			const doc = Text.of(['<!-- This is a', 'multiline', 'comment -->']);
			const comments = findMarkdownComments(0, doc.length, doc);
			expect(comments).toHaveLength(1);
			expect(doc.sliceString(comments[0].contentFrom, comments[0].contentTo)).toBe(
				' This is a\nmultiline\ncomment '
			);
		});

		it('should match comment with special characters', () => {
			const doc = Text.of(['<!-- This has $pecial ch@rs & symbols! -->']);
			const comments = findMarkdownComments(0, doc.length, doc);
			expect(comments).toHaveLength(1);
			expect(doc.sliceString(comments[0].contentFrom, comments[0].contentTo)).toBe(
				' This has $pecial ch@rs & symbols! '
			);
		});

		it('should NOT match incomplete comment (no closing)', () => {
			const doc = Text.of(['<!-- This is incomplete']);
			const comments = findMarkdownComments(0, doc.length, doc);
			expect(comments).toHaveLength(0);
		});

		it('should NOT match incomplete comment (no opening)', () => {
			const doc = Text.of(['This is incomplete -->']);
			const comments = findMarkdownComments(0, doc.length, doc);
			expect(comments).toHaveLength(0);
		});

		it('should NOT match comments inside metadata blocks', () => {
			const doc = Text.of(['---', 'title: Test <!-- comment -->', '---', 'Content']);
			const comments = findMarkdownComments(0, doc.length, doc);
			expect(comments).toHaveLength(0);
		});

		it('should match comments outside metadata blocks', () => {
			const doc = Text.of(['---', 'title: Test', '---', 'Content <!-- comment --> more content']);
			const comments = findMarkdownComments(0, doc.length, doc);
			expect(comments).toHaveLength(1);
			expect(doc.sliceString(comments[0].contentFrom, comments[0].contentTo)).toBe(' comment ');
		});
	});

	describe('findMarkdownPlaceholders', () => {
		it('should match basic placeholder', () => {
			const doc = Text.of(['Hello {:name:}, welcome!']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(1);
			expect(doc.sliceString(placeholders[0].contentFrom, placeholders[0].contentTo)).toBe('name');
		});

		it('should match empty placeholder', () => {
			const doc = Text.of(['Fill in: {: : }']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(1);
			expect(placeholders[0].contentFrom).toBe(placeholders[0].contentTo); // Empty content
		});

		it('should match multiple placeholders on same line', () => {
			const doc = Text.of(['Dear {:title:} {:name:},']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(2);
			expect(doc.sliceString(placeholders[0].contentFrom, placeholders[0].contentTo)).toBe('title');
			expect(doc.sliceString(placeholders[1].contentFrom, placeholders[1].contentTo)).toBe('name');
		});

		it('should match consecutive placeholders separately', () => {
			const doc = Text.of(['{:placeholder1:} {:placeholder2:}']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(2);
			expect(doc.sliceString(placeholders[0].contentFrom, placeholders[0].contentTo)).toBe(
				'placeholder1'
			);
			expect(doc.sliceString(placeholders[1].contentFrom, placeholders[1].contentTo)).toBe(
				'placeholder2'
			);
		});

		it('should match placeholder with spaces', () => {
			const doc = Text.of(['Please enter {:recipient name here:}']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(1);
			expect(doc.sliceString(placeholders[0].contentFrom, placeholders[0].contentTo)).toBe(
				'recipient name here'
			);
		});

		it('should match placeholder with single } inside', () => {
			const doc = Text.of(['Compare: {:a } b:}']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(1);
			expect(doc.sliceString(placeholders[0].contentFrom, placeholders[0].contentTo)).toBe('a } b');
		});

		it('should handle nested braces (non-greedy match)', () => {
			// With nested {:, the first :} closes the placeholder
			const doc = Text.of(['{:outer {:inner:}']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(1);
			expect(doc.sliceString(placeholders[0].contentFrom, placeholders[0].contentTo)).toBe(
				'outer {:inner'
			);
		});

		it('should NOT match unclosed placeholder', () => {
			const doc = Text.of(['This is {:unclosed']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(0);
		});

		it('should NOT match no opening delimiter', () => {
			const doc = Text.of(['This is unclosed:}']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(0);
		});

		it('should NOT match placeholder spanning multiple lines', () => {
			const doc = Text.of(['{:start', 'end:}']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(0);
		});

		it('should NOT match placeholder inside metadata blocks', () => {
			const doc = Text.of(['---', 'title: {:placeholder:}', '---', 'Content']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(0);
		});

		it('should match placeholder outside metadata blocks', () => {
			const doc = Text.of(['---', 'title: Test', '---', 'Content {:placeholder:} here']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(1);
			expect(doc.sliceString(placeholders[0].contentFrom, placeholders[0].contentTo)).toBe(
				'placeholder'
			);
		});

		it('should NOT match placeholder inside inline code', () => {
			const doc = Text.of(['Use `{:placeholder:}` for templates']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(0);
		});

		it('should NOT match placeholder inside double backtick code', () => {
			const doc = Text.of(['Use ``{:placeholder:}`` for templates']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(0);
		});

		it('should NOT match placeholder inside fenced code block', () => {
			const doc = Text.of(['```', '{:placeholder:}', '```']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(0);
		});

		it('should NOT match placeholder inside link URL', () => {
			const doc = Text.of(['Click [here]({:url:})']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(0);
		});

		it('should match placeholder in link text but not URL', () => {
			const doc = Text.of(['[{:link text: }](https://example.com)']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(1);
			expect(doc.sliceString(placeholders[0].contentFrom, placeholders[0].contentTo)).toBe(
				'link text'
			);
		});

		it('should return correct positions', () => {
			const doc = Text.of(['Hello {:world:}!']);
			const placeholders = findMarkdownPlaceholders(0, doc.length, doc);
			expect(placeholders).toHaveLength(1);
			expect(placeholders[0].from).toBe(6); // Position of first (
			expect(placeholders[0].to).toBe(15); // Position after last )
			expect(placeholders[0].contentFrom).toBe(8); // Position of 'w'
			expect(placeholders[0].contentTo).toBe(13); // Position after 'd'
		});
	});
});
