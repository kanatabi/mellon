/**
 * Vendored from earendil src/lib/markdown/render.ts (DESIGN §10: shared-theme
 * extraction deferred; snapshot + periodic reconcile). Deviation (journal
 * 2026-11-08): mermaid fences render as SOURCE-REVEAL here (the editor's
 * preview does not need the client-render pipeline; authors see exactly the
 * fenced source that lumen will store — Route B honesty). The TOC extraction
 * stays exported: the editor's outline uses it.
 */
import MarkdownIt, { type MarkdownIt as MarkdownItInstance, type Token } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import container from 'markdown-it-container';
import taskLists from 'markdown-it-task-lists';
import markdownItShiki from '@shikijs/markdown-it';
import type { BuiltinLanguage } from 'shiki';
import DOMPurify from 'isomorphic-dompurify';

export interface TocEntry {
	id: string;
	text: string;
	depth: 2 | 3;
}

const SHIKI_LANGS: BuiltinLanguage[] = [
	'go',
	'rust',
	'clojure',
	'javascript',
	'typescript',
	'python',
	'bash',
	'yaml',
	'json',
	'dockerfile',
	'hcl'
];

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
md.use(anchor, { level: [2, 3] });
md.use(taskLists);
md.use(container, 'grid', {
	render: (tokens, idx) =>
		tokens[idx].nesting === 1 ? '<div class="article-grid columns-2 md:columns-3">\n' : '</div>\n'
});

// Tables ride a horizontal-scroll wrapper (`.preview .prose .table-wrap` in
// layout.css) — parity with earendil's render.ts: a wide table's min-content
// beats the preview column and no wrap rule can shrink intrinsic sizing.
// The attrs render through (the source-line anchor below lands on <table>).
md.renderer.rules.table_open = (tokens, idx) => {
	const token = tokens[idx];
	const attrs = (token.attrs ?? []).map(([k, v]) => ` ${k}="${v}"`).join('');
	return `<div class="table-wrap">\n<table${attrs}>\n`;
};
md.renderer.rules.table_close = () => '</table>\n</div>\n';

// SOURCE-LINE ANCHORS (synced scroll, 2026-11-21): block tokens carry
// token.map = the [startLine, endLine] they came from — the editor's
// preview-sync maps the editor viewport onto the rendered blocks (and back)
// through these. Top-level blocks only (nested tokens re-anchor their
// parents' ranges — noise); 1-based lines (the editor's Ln counter).
// Inert without the editor (earendil serves it; nothing reads it there).
md.core.ruler.push('source_line_anchors', (state) => {
	for (const token of state.tokens) {
		// nesting -1 = the closing tag (already covered by its opener);
		// 0 = singletons (fence, hr, code_block) — they anchor themselves
		if (token.map && token.level === 0 && token.nesting >= 0) {
			token.attrSet('data-source-lines', `${token.map[0] + 1}-${token.map[1]}`);
		}
	}
	return true;
});

let engine: Promise<MarkdownItInstance> | null = null;
function markdownEngine(): Promise<MarkdownItInstance> {
	if (!engine) {
		engine = markdownItShiki({
			themes: { light: 'github-light', dark: 'github-dark' },
			defaultColor: false,
			langs: SHIKI_LANGS,
			fallbackLanguage: 'text' as BuiltinLanguage
		}).then((shiki) => {
			md.use(shiki);
			// mermaid fences skip Shiki: show the source (see header deviation).
			// `mermaid` fences skip Shiki entirely: emit a placeholder the client
			// action hydrates. The escaped source doubles as the no-JS fallback.
			// Attrs render through (the source-line anchor; the box donates its
			// offset once hydrated — preview-sync's sibling rule).
			const shikiFence = md.renderer.rules.fence!;
			md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
				if (tokens[idx].info.trim().split(/\s+/)[0] === 'mermaid') {
					const token = tokens[idx];
					const attrs = (token.attrs ?? []).map(([k, v]) => ` ${k}="${v}"`).join('');
					return `<pre class="mermaid-src"${attrs}><code>${escapeHtml(token.content)}</code></pre>\n`;
				}
				// the Shiki renderer builds its own <pre> and DROPS token attrs —
				// re-inject the source-line anchor (synced scroll needs fences)
				const out = shikiFence(tokens, idx, opts, env, self);
				const token = tokens[idx];
				if (token.map && token.level === 0) {
					return out.replace(
						'<pre',
						`<pre data-source-lines="${token.map[0] + 1}-${token.map[1]}"`
					);
				}
				return out;
			};
			return md;
		});
	}
	return engine;
}

export async function renderMarkdown(markdown: string): Promise<{ html: string; toc: TocEntry[] }> {
	const instance = await markdownEngine();
	const env = {};
	const tokens = instance.parse(markdown, env);
	const toc = extractToc(tokens);
	const html = instance.renderer.render(tokens, instance.options, env);
	return { html: DOMPurify.sanitize(html), toc };
}

function extractToc(tokens: Token[]): TocEntry[] {
	const toc: TocEntry[] = [];
	for (const [index, token] of tokens.entries()) {
		if (token.type !== 'heading_open') continue;
		const depth = token.tag === 'h2' ? 2 : token.tag === 'h3' ? 3 : null;
		const id = token.attrGet('id');
		if (!depth || typeof id !== 'string' || id === '') continue;
		const inline = tokens[index + 1];
		const text =
			inline?.type === 'inline'
				? (inline.children ?? [])
						.filter((child) => child.type === 'text' || child.type === 'code_inline')
						.map((child) => child.content)
						.join('')
				: '';
		toc.push({ id, text, depth });
	}
	return toc;
}
