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

/** The metadata tab's field universe: the rail fields MINUS the body — the
 *  body's home is the markdown tab (a body row here rendered the whole
 *  document twice — walked 2026-11-21). The DIALOG keeps the full list
 *  (FIELD_LABELS — its job is naming what a save touches, body included). */
const METADATA_FIELDS = FIELD_LABELS.filter(({ key }) => key !== 'content');

export type FieldRow = {
	key: keyof PostDraft;
	label: string;
	from: string;
	to: string;
	status: 'changed' | 'same';
};

/** The metadata tab: the vault-compare table shape — one row per rail field
 *  with a status chip (fixed-shape fields ⇒ only changed/same occur), saved
 *  value left, pending right. Unchanged fields stay visible (the page's
 *  Hide-unchanged toggle filters them). */
export function fieldRows(pending: PostDraft, head: PostDraft): FieldRow[] {
	return METADATA_FIELDS.map(({ key, label }) => {
		const from = fieldValue(head, key);
		const to = fieldValue(pending, key);
		return { key, label, from, to, status: from === to ? 'same' : 'changed' };
	});
}

export const METADATA_FIELD_COUNT = METADATA_FIELDS.length;

/** The markdown tab: aligned two-pane rows over the raw body (left = saved,
 *  right = pending). Full documents pair fine — the LCS is review-aid sized. */
export function splitMarkdown(base: PostDraft, pending: PostDraft): SplitRow[] {
	return alignDiff(diffLines(base.content, pending.content));
}

export type DiffRegion = { kind: 'rows'; rows: SplitRow[] } | { kind: 'gap'; count: number };

/** The "Changed only" view: the aligned rows COLLAPSED to the change regions
 *  — ±`context` lines around every change, `gap` bands naming what was
 *  skipped. The full-document split's noise (a 45-line document showing one
 *  trailing edit) is the failure this exists for; empty adds (a trailing
 *  newline) ride inside a region block, never as invisible lone rows. */
export function splitRegions(base: PostDraft, pending: PostDraft, context = 2): DiffRegion[] {
	const rows = splitMarkdown(base, pending);
	const kept = new Set<number>();
	rows.forEach((r, i) => {
		if (r.left?.kind !== 'same' || r.right?.kind !== 'same') {
			for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) {
				kept.add(j);
			}
		}
	});
	if (kept.size === 0) return rows.length ? [{ kind: 'gap', count: rows.length }] : [];

	const regions: DiffRegion[] = [];
	let buf: SplitRow[] = [];
	let prev = -1;
	for (const i of [...kept].sort((a, b) => a - b)) {
		if (prev >= 0 && i - prev > 1) {
			regions.push({ kind: 'rows', rows: buf });
			regions.push({ kind: 'gap', count: i - prev - 1 });
			buf = [];
		}
		buf.push(rows[i]);
		prev = i;
	}
	if (buf.length) regions.push({ kind: 'rows', rows: buf });
	return regions;
}
