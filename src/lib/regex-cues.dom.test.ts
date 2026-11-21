import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Fixture from './regex-cues-fixture.svelte';

/** The regex cue layer's own doc: the deflist's two accepted forms, the
 *  non-cues, the ALTERNATION proof (three consecutive defs — the g-flag's
 *  lastIndex must not leak across lines), and the code-exclusion zone. */

/** The deco texts, resolved from the decorated spans. */
function decoTexts(container: HTMLElement, cls: string): string[] {
	return [...container.querySelectorAll(`.${cls}`)].map((d) => d.textContent ?? '');
}

describe('the regex-cue layer (what the grammar cannot see)', () => {
	it('the DEFLIST cues fire on both forms, every line, never in code', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			const defs = decoTexts(container, 'cm-line-list');
			// both accepted forms, on THREE consecutive lines (the lastIndex
			// alternation would drop the 2nd/3rd)
			expect(defs).toHaveLength(3);
			// the bare ':' and ': ' lines never cue — every cue has content
			// beyond the colon
			expect(defs.every((t) => /[^\s:]/.test(t))).toBe(true);
		});
	});

	it('the code-exclusion invariant: == and : inside a fence stay undecorated', async () => {
		const { container } = render(Fixture);
		await vi.waitFor(() => {
			const highlights = decoTexts(container, 'cm-block-highlight');
			expect(highlights).toEqual(['==real highlight==']); // the fence's ==comparison== absent
			// ': not a deflist' lives inside the fence — never a deflist cue
			expect(decoTexts(container, 'cm-line-list').every((t) => !t.includes('not a deflist'))).toBe(
				true
			);
		});
	});
});
