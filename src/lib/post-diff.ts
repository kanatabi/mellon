/**
 * post-diff.ts — the PURE heart of the post editor's diff surfaces (the
 * save-confirm dialog's field list and the /posts/[slug]/diff page). Takes
 * arbitrary snapshot PAIRS — never the buffer type — so the same functions
 * diff head-vs-pending today and version-N-vs-version-M tomorrow, when
 * lumen holds post history. Everything offline-testable, like the house.
 */
import { alignDiff, diffLines, type SplitRow } from './diff.ts';
import type { PostDraft } from './api/types.ts';

/** Field order = rail order. `slug` is absent: immutable after creation,
 *  and the diff page only exists for saved posts. */
export const FIELD_LABELS: Array<{ key: keyof PostDraft; label: string }> = [
	{ key: 'title', label: 'title' },
	{ key: 'subtitle', label: 'subtitle' },
	{ key: 'preview', label: 'preview' },
	{ key: 'date', label: 'date' },
	{ key: 'tags', label: 'tags' },
	{ key: 'content', label: 'body' },
	{ key: 'thumbnail', label: 'cover' }
];

function fieldValue(draft: PostDraft, key: keyof PostDraft): string {
	if (key === 'tags') return draft.tags.join(', ');
	if (key === 'thumbnail') return draft.thumbnail ?? '';
	return String(draft[key] ?? '');
}

/** Head detail → draft shape (the diff page's saved/left side). Copies tags:
 *  the caller may mutate the result without touching the server data. */
export function toDraft(detail: PostDraft): PostDraft {
	return {
		slug: detail.slug,
		title: detail.title,
		subtitle: detail.subtitle,
		preview: detail.preview,
		date: detail.date,
		tags: [...detail.tags],
		content: detail.content,
		thumbnail: detail.thumbnail
	};
}

/** The save-confirm dialog's list — attribute NAMES only (owner call
 *  2026-11-21): the values live on the diff page, the dialog just answers
 *  "what would this save touch?". */
export function changedFieldNames(draft: PostDraft, head: PostDraft): string[] {
	return FIELD_LABELS.filter(({ key }) => fieldValue(draft, key) !== fieldValue(head, key)).map(
		({ label }) => label
	);
}

export type FieldRow = { key: keyof PostDraft; label: string; from: string; to: string };

/** The metadata tab: one row per CHANGED field — saved value left, pending
 *  value right (the two-pane split earns its keep on documents, not on five
 *  scalars). Unchanged fields are a count, not rows. */
export function fieldRows(pending: PostDraft, head: PostDraft): FieldRow[] {
	return FIELD_LABELS.filter(({ key }) => fieldValue(pending, key) !== fieldValue(head, key)).map(
		({ key, label }) => ({
			key,
			label,
			from: fieldValue(head, key),
			to: fieldValue(pending, key)
		})
	);
}

/** The markdown tab: aligned two-pane rows over the raw body (left = saved,
 *  right = pending). Full documents pair fine — the LCS is review-aid sized. */
export function splitMarkdown(base: PostDraft, pending: PostDraft): SplitRow[] {
	return alignDiff(diffLines(base.content, pending.content));
}
