import { describe, expect, it } from 'vitest';
import { cueFor } from './cm-cues.ts';

// The mark-cue mapping — PURE (the dom test would need CM's viewport; the
// mapping is the contract). Every family the pipeline parses has a cue;
// content nodes (Paragraph, Text…) map to null — the whole point.
describe('cueFor — the node→cue map', () => {
	it('headings, quotes, code, lists, tables, links carry their cues', () => {
		expect(cueFor('HeaderMark')).toBe('cm-cue-heading');
		expect(cueFor('QuoteMark')).toBe('cm-cue-quote');
		expect(cueFor('CodeMark')).toBe('cm-cue-code');
		expect(cueFor('ListMark')).toBe('cm-cue-list');
		expect(cueFor('TableDelimiter')).toBe('cm-cue-table');
		expect(cueFor('LinkMark')).toBe('cm-cue-link');
	});

	it('EmphasisMark disambiguates by PARENT: `**` is bold, `*` is italic', () => {
		expect(cueFor('EmphasisMark', 'StrongEmphasis')).toBe('cm-cue-bold');
		expect(cueFor('EmphasisMark', 'Emphasis')).toBe('cm-cue-italic');
		expect(cueFor('EmphasisMark')).toBeNull(); // unknown parent: no cue, no guess
	});

	it('strikethrough rides its own mark (the GFM extension)', () => {
		expect(cueFor('StrikethroughMark')).toBe('cm-cue-strike');
	});

	it('CONTENT nodes map to null — the not-WYSIWYG guarantee', () => {
		for (const content of [
			'Paragraph',
			'Text',
			'Heading',
			'StrongEmphasis',
			'Emphasis',
			'InlineCode',
			'FencedCode',
			'BulletList',
			'OrderedList',
			'Blockquote',
			'Image',
			'Table',
			'HorizontalRule'
		]) {
			expect(cueFor(content)).toBeNull();
		}
	});
});
