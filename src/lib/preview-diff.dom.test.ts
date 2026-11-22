import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { patchPreview } from './preview/preview-diff.ts';
import Fixture from './preview-diff-fixture.svelte';

// The DOM-level patcher: the render stays whole-document (the correctness
// by construction); the APPLICATION touches only the changed block. The
// tests pin the identity guarantees: a no-op mutates nothing, an edit
// replaces exactly one node, hydration (the mermaid pair) survives.
function host(): HTMLElement {
	const d = document.createElement('div');
	document.body.append(d);
	return d;
}
const TITLE = '<h1 data-source-lines="1-1">Title</h1>';
const PARA = '<p data-source-lines="3-3">one</p>';

describe('patchPreview — the incremental preview paint', () => {
	it('the identical html mutates NOTHING (the node instances survive)', () => {
		const c = host();
		const html = TITLE + PARA;
		patchPreview(c, html);
		const before = [...c.children];
		expect(patchPreview(c, html)).toBe(false);
		expect([...c.children]).toEqual(before);
	});

	it('an edit replaces exactly ONE node; the siblings keep their instances', () => {
		const c = host();
		patchPreview(c, TITLE + PARA);
		const before = [...c.children];
		expect(patchPreview(c, TITLE + '<p data-source-lines="3-3">one EDITED</p>')).toBe(true);
		const after = [...c.children];
		expect(after).toHaveLength(2);
		expect(after[0]).toBe(before[0]); // the untouched block = the same node
		expect(after[1]).not.toBe(before[1]); // the edited block = replaced
		expect(after[1].textContent).toBe('one EDITED');
	});

	it('an insertion inserts ONE node and keeps the rest, in order', () => {
		const c = host();
		patchPreview(c, TITLE + PARA);
		const before = [...c.children];
		const inserted = '<p data-source-lines="5-5">inserted</p>';
		expect(patchPreview(c, TITLE + inserted + PARA)).toBe(true);
		const after = [...c.children];
		expect(after).toHaveLength(3);
		expect(after[0]).toBe(before[0]);
		expect(after[2]).toBe(before[1]); // the tail block survives, order kept
		expect(after[1].textContent).toBe('inserted');
	});

	it('a deletion removes ONE node and keeps the rest', () => {
		const c = host();
		patchPreview(c, TITLE + PARA);
		const before = [...c.children];
		expect(patchPreview(c, TITLE)).toBe(true);
		const after = [...c.children];
		expect(after).toHaveLength(1);
		expect(after[0]).toBe(before[0]);
	});

	it('the hydrated MERMAID pair survives a patch that does not touch it', () => {
		const c = host();
		const html =
			TITLE +
			'<pre class="mermaid-src" data-source-lines="3-5" hidden><code>flowchart LR</code></pre>' +
			'<div class="mermaid-box" data-mmd="done">SVG</div>' +
			'<p data-source-lines="7-7">after</p>';
		patchPreview(c, html);
		const pre = c.querySelector('.mermaid-src') as Element;
		const box = c.querySelector('.mermaid-box') as Element;
		// the SAME html again: the pair = the same instances (hydration intact)
		expect(patchPreview(c, html)).toBe(false);
		expect(c.querySelector('.mermaid-src')).toBe(pre);
		expect(c.querySelector('.mermaid-box')).toBe(box);
	});

	it('a MERMAID SOURCE edit swaps the unit (the stale box goes with it)', () => {
		const c = host();
		patchPreview(
			c,
			'<pre class="mermaid-src" data-source-lines="1-3" hidden><code>flowchart LR</code></pre>' +
				'<div class="mermaid-box" data-mmd="done">SVG</div>'
		);
		const oldPre = c.querySelector('.mermaid-src') as Element;
		patchPreview(
			c,
			'<pre class="mermaid-src" data-source-lines="1-3"><code>flowchart TD</code></pre>'
		);
		const pre = c.querySelector('.mermaid-src') as Element;
		expect(pre).not.toBe(oldPre);
		expect(pre.querySelector('code')?.textContent).toBe('flowchart TD');
		expect(c.querySelector('.mermaid-box')).toBeNull(); // the stale box went with the unit
	});

	it('the attr-less blocks (the footnote section) match by content', () => {
		const c = host();
		const section = '<section class="footnotes">the footnotes</section>';
		const html = PARA + section;
		patchPreview(c, html);
		const sec = c.querySelector('.footnotes') as Element;
		expect(patchPreview(c, html)).toBe(false); // the same section html = the same unit
		expect(c.querySelector('.footnotes')).toBe(sec);
	});

	it('the INTEGRATION: the fixture prop path paints through the effect', async () => {
		const { container, rerender } = render(Fixture, { html: TITLE + PARA });
		expect((container.querySelector('.prose') as HTMLElement).textContent).toBe('Titleone');
		await rerender({ html: TITLE + '<p data-source-lines="3-3">one EDITED</p>' });
		expect((container.querySelector('.prose') as HTMLElement).textContent).toBe('Titleone EDITED');
	});
});
