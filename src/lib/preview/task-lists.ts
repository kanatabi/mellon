/**
 * task-lists.ts — the VENDORED replacement for markdown-it-task-lists
 * (2026-11-21): the 2016 package is CJS-only, and vite 8's dev module-runner
 * inlines it as ESM — its `module.exports` exploded as "module is not
 * defined" and killed the whole /api/preview in dev (the built app bundled
 * it fine — the staging walks never saw it). Rather than fight the runner's
 * dependency policy, we vendor the ~20 lines we actually used, ESM-pure.
 *
 * Behavior contract (identical to the package, pinned by render.test.ts):
 *  - a list item whose inline content begins with `[ ] `/`[x]`/`[X]`
 *    becomes a task item: the `<li>` gains `task-list-item`, the checkbox
 *    input replaces the bracket token (`checked` for x/X, always `disabled`);
 *  - the enclosing list gains `contains-task-list`;
 *  - the brackets and the space are REMOVED from the visible text.
 */
import type { MarkdownIt, StateCore } from 'markdown-it';

/** The item's leading `[ ]`/`[x]` marker — the inline text to strip. */
const TASK_RE = /^\[([ xX])\] +/;

export function taskListsPlugin(md: MarkdownIt): void {
	md.core.ruler.after('inline', 'task_lists', (state: StateCore) => {
		const tokens = state.tokens;
		for (let i = 2; i < tokens.length; i++) {
			if (tokens[i].type !== 'inline' || !tokens[i].content) continue;
			// the item's inline sits inside a (hidden) paragraph token for
			// LOOSE lists and directly inside the item for TIGHT ones —
			// step past the paragraph either way
			const itemIdx = tokens[i - 1].type === 'paragraph_open' ? i - 2 : i - 1;
			if (tokens[itemIdx]?.type !== 'list_item_open') continue; // only list items
			const match = TASK_RE.exec(tokens[i].content);
			if (!match) continue;

			const checked = match[1].toLowerCase() === 'x';
			// strip the bracket marker from the item's inline content
			tokens[i].content = tokens[i].content.slice(match[0].length);
			// the INLINE token's parsed children live in `children` (NOT
			// `tokens` — the silent-skip bug of the first port, walked)
			const children = tokens[i].children;
			if (!children || children.length === 0) continue;
			const child = children[0];
			if (child?.type === 'text') child.content = child.content.replace(TASK_RE, '');

			// the checkbox: a real input, first child of the item's content
			const box = new state.Token('html_inline', '', 0);
			box.content = `<input class="task-list-item-checkbox" ${checked ? 'checked="" ' : ''}disabled="" type="checkbox"> `;
			children.unshift(box);

			tokens[itemIdx].attrJoin('class', 'task-list-item');
			// the ITEM's parent list (ul/ol) — walk back to its opening token
			for (let j = itemIdx - 1; j >= 0; j--) {
				if (tokens[j].type === 'list_item_open' || tokens[j].type === 'paragraph_open') continue;
				if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'ordered_list_open') {
					tokens[j].attrJoin('class', 'contains-task-list');
					break;
				}
			}
		}
		return true;
	});
}
