import { describe, expect, it } from 'vitest';
import { importMarkdown, importMarkdownFile } from './import-markdown.ts';

describe('importMarkdown — the Obsidian/Notion → draft mapping', () => {
	it('the frontmatter maps: the title/date win, the body = the rest', () => {
		const md = `---
title: My Obsidian Note
date: 2026-05-14
tags: [a, b]
custom: ignored
---

## Real content

text
`;
		const out = importMarkdown(md);
		expect(out.title).toBe('My Obsidian Note');
		expect(out.date).toBe('2026-05-14');
		expect(out.content).toContain('## Real content');
		expect(out.content).not.toContain('title:');
	});

	it('NO frontmatter: the title = the first H1, stripped from the content', () => {
		const out = importMarkdown('# The Headline\n\nbody text\n');
		expect(out.title).toBe('The Headline');
		expect(out.content).not.toContain('# The Headline');
		expect(out.content).toContain('body text');
	});

	it('the frontmatter title BEATS the H1 (and the H1 stays in the content then)', () => {
		const out = importMarkdown('---\ntitle: FM Title\n---\n\n# The Headline\n\nbody\n');
		expect(out.title).toBe('FM Title');
		expect(out.content).toContain('# The Headline');
	});

	it('neither frontmatter nor H1: the honest fallback title', () => {
		const out = importMarkdown('just text\n');
		expect(out.title).toBe('Imported draft');
		expect(out.content).toContain('just text');
	});

	it('the malformed frontmatter = prose, not a crash', () => {
		const md = '---\ntitle: [unclosed\n---\n\nbody\n';
		const out = importMarkdown(md);
		expect(out.title).toBe('Imported draft');
		expect(out.content).toContain('body');
	});

	it('the date accepts the Obsidian shapes, rejects the junk (today = the fallback)', () => {
		expect(importMarkdown('---\ndate: 2026-05-14 09:30\n---\nx\n').date).toBe('2026-05-14');
		const junk = importMarkdown('---\ndate: not-a-date\n---\nx\n');
		expect(junk.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // today
	});
});

describe('importMarkdownFile — the picker boundary', () => {
	it('rejects non-markdown picks with a readable message', async () => {
		const file = new File(['x'], 'photo.png', { type: 'image/png' });
		await expect(importMarkdownFile(file)).rejects.toThrow('pick a .md');
	});

	it('rejects an empty file', async () => {
		const file = new File([''], 'empty.md');
		await expect(importMarkdownFile(file)).rejects.toThrow('empty');
	});

	it('a real .md flows through the mapping', async () => {
		const file = new File(['---\ntitle: From the picker\n---\n\nbody\n'], 'note.md');
		const out = await importMarkdownFile(file);
		expect(out.title).toBe('From the picker');
	});
});
