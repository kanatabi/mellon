import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './render';

// The preview must render the article exactly as the public site will
// (DESIGN §11.4) — the vendored pipeline mirrors earendil's render.ts, and
// these tests pin the pieces of that parity that matter structurally.
describe('preview renderMarkdown — tables', () => {
	it('wraps tables in the .table-wrap scroll box (parity with earendil)', async () => {
		const { html } = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n');
		expect(html).toContain('<div class="table-wrap">');
		expect(html).toContain('<table>');
		expect(html).toContain('</table>\n</div>');
	});
});
