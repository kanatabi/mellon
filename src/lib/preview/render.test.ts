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
