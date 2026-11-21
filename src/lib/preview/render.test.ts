import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './render';

// The preview must render the article exactly as the public site will
// (DESIGN §11.4) — the vendored pipeline mirrors earendil's render.ts, and
// these tests pin the pieces of that parity that matter structurally.
describe('preview renderMarkdown — tables', () => {
	it('wraps tables in the .table-wrap scroll box (parity with earendil)', async () => {
		const { html } = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n');
		expect(html).toContain('<div class="table-wrap">');
		expect(html).toContain('<table ');
		expect(html).toContain('</table>\n</div>');
	});
});

// SOURCE-LINE ANCHORS (synced scroll): block tokens carry their 1-based
// source ranges — the editor's preview-sync maps scroll through them.
describe('preview renderMarkdown — source-line anchors', () => {
	it('stamps top-level blocks with data-source-lines (1-based ranges)', async () => {
		const { html } = await renderMarkdown('# Hi\n\npara one\n\n```go\nx()\n```\n');
		expect(html).toMatch(/<h1[^>]*data-source-lines="1-1"/);
		expect(html).toMatch(/<p[^>]*data-source-lines="3-3"/);
		// the fence's range INCLUDES the closing fence line (4 lines total)
		expect(html).toMatch(/<pre[^>]*data-source-lines="5-7"/);
	});
	it('anchors tables through the .table-wrap override', async () => {
		const { html } = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n');
		expect(html).toMatch(/<table[^>]*data-source-lines="1-3"/);
	});
	it('anchors mermaid placeholders (the box donates its offset later)', async () => {
		const { html } = await renderMarkdown('```mermaid\nflowchart LR\n  a --> b\n```\n');
		expect(html).toMatch(/<pre class="mermaid-src"[^>]*data-source-lines="1-4"/);
	});
});

// THE FENCE CACHE (the long-doc preview's perf round): Shiki's highlight =
// a pure function of (lang, content) — the same fence renders once, the
// anchor re-injection stays per-render (the position shifts as you type).
describe('preview renderMarkdown — the fence cache', () => {
	it('the SAME fence at two positions: identical highlight, position-fresh anchors', async () => {
		const doc = '```go\nx()\n```\n\nmiddle para\n\n```go\nx()\n```\n';
		const { html } = await renderMarkdown(doc);
		const fences = [...html.matchAll(/<pre[^>]*data-source-lines="([^"]+)"[^>]*>/g)].map(
			(m) => m[1]
		);
		// both fences carry THEIR OWN source range (the cache never leaks one
		// position's anchor into the other's)
		expect(fences).toEqual(['1-3', '7-9']);
		// the highlighted bodies are byte-identical (the cache hit)
		const bodies = [
			...html.matchAll(/<pre[^>]*data-source-lines="[^"]+"[^>]*>([\s\S]*?)<\/pre>/g)
		].map((m) => m[1]);
		expect(bodies[0]).toBe(bodies[1]);
	});
	it('the same content in a DIFFERENT language = a different entry (no cross-lang leakage)', async () => {
		const { html } = await renderMarkdown('```go\nvalue\n```\n\n```python\nvalue\n```\n');
		// the langs' token classes differ inside the highlighted output
		expect(html).not.toBe('');
		const bodies = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => m[1]);
		expect(bodies[0]).not.toBe(bodies[1]);
	});
});
