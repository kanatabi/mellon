import type { Command } from './commands.ts';

/**
 * Command kit (control-center round 2): the three shapes that recur once a
 * second page joins the palette — an EDIT field, a state TOGGLE, a vocabulary
 * SUBMENU — as builders. Extracted the honest way: only after the editor
 * (consumer 1) and the photo detail page (consumer 2) proved the same form;
 * abstractions built on one consumer are usually wrong. Pages stay the
 * owners of WHAT a commit does (the closures); the kit fixes HOW it looks
 * and behaves, so a toggle is a toggle on every page.
 */

/** A seeded EDIT buffer: `✎ Title`-style row writing one text field. */
export function editField(opts: {
	id: string;
	title: string;
	/** The pill word while editing — `title`, `date`, `alt`… (CSS upcases it.) */
	pill: string;
	/** Live current value; the buffer opens SEEDED — you edit, never replace. */
	seed: string;
	/** Date grammar buffer (typed expressions + arrow stepper). */
	date?: boolean;
	/** Date buffer that ACCEPTS ranges (`nov 1..nov 12`, `last week`) —
	 *  filter fields take windows, content fields take one date. */
	range?: boolean;
	/** Return false to REJECT the commit (the buffer stays open). */
	commit: (value: string) => boolean | void;
}): Command {
	return {
		id: opts.id,
		title: opts.title,
		group: 'actions',
		edit: true,
		...(opts.date ? { editKind: 'date' as const } : {}),
		...(opts.range ? { editRange: true } : {}),
		seed: opts.seed,
		pillLabel: opts.pill,
		commit: opts.commit
	};
}

/** A stateful TOGGLE: the hint column answers "what state am I in?" (theme,
 *  vim, wrap, gallery-visible…) before you flip it. `keepOpen` extends the
 *  toggle into a CHAINING edit (form fields: flip, verify, save — without
 *  reopening the palette); plain action toggles close like every row. */
export function stateToggle(opts: {
	id: string;
	title: string;
	on: boolean;
	onHint?: string;
	offHint?: string;
	keepOpen?: boolean;
	run: () => void;
}): Command {
	return {
		id: opts.id,
		title: opts.title,
		group: 'actions',
		shortcut: opts.on ? (opts.onHint ?? 'on') : (opts.offHint ?? 'off'),
		...(opts.keepOpen ? { keepOpen: true } : {}),
		run: opts.run
	};
}

/** A vocabulary SUBMENU: live rows with ✓ marks, keep-open selection, and —
 *  when `create` is provided — the eager `+ create "xyz"` door. The caller
 *  pre-computes hints (counts etc.) per registration; the palette re-reads
 *  the tree, so ✓ flips live. */
export function vocabSubmenu(opts: {
	id: string;
	title: string;
	vocab: { name: string; hint?: string }[];
	isOn: (name: string) => boolean;
	/** What picking does — multi pages TOGGLE, single-home pages SET. */
	pick: (name: string) => void;
	/** The create door: receives the raw filter text; return the new name +
	 *  the creation promise, or null when there's nothing to create (blank,
	 *  already in vocabulary…). */
	create?: (raw: string) => { name: string; ride: Promise<unknown> } | null;
	/** Runs after creation resolves — fold the name into the page's local
	 *  vocabulary AND pick it (the Combobox's ride-until-reload contract). */
	onCreated?: (name: string) => void;
}): Command {
	return {
		id: opts.id,
		title: opts.title,
		group: 'actions',
		children: opts.vocab.map((t) => ({
			id: `${opts.id}.${t.name}`,
			title: t.name,
			group: 'actions' as const,
			shortcut: opts.isOn(t.name) ? '✓ on' : t.hint,
			keepOpen: true,
			run: () => opts.pick(t.name)
		})),
		...(opts.create
			? {
					createChild: (raw: string): Command | null => {
						const door = opts.create!(raw);
						if (!door) return null;
						return {
							id: `${opts.id}.create`,
							title: `+ create “${raw.trim()}”`,
							group: 'actions',
							shortcut: 'then added',
							keepOpen: true,
							run: () => {
								void door.ride.then(() => opts.onCreated?.(door.name)).catch(() => {});
							}
						};
					}
				}
			: {})
	};
}
