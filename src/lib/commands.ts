import { goto } from '$app/navigation';
import type { PaletteMode } from './palette-mode.ts';

/**
 * The command registry (DESIGN §7): pages/sections declare commands, the
 * palette renders them. Adding a page = one entry here — the rail kit's
 * plug-and-play contract, applied to navigation.
 */
export interface Command {
	id: string;
	title: string;
	group: 'go to' | 'actions' | 'open recent' | 'posts' | 'photos' | 'tags';
	shortcut?: string;
	/** Enter drills into these rows IN THE PALETTE instead of closing it —
	 *  the submenu doctrine (§7). A parent with children is never `run`. */
	children?: Command[];
	/** A submenu may synthesize one row from the live filter text — the
	 *  eager-vocabulary door (`+ create "xyz"`). Return null for nothing. */
	createChild?: (query: string) => Command | null;
	/** Enter arms a palette mode instead of closing — declarative, so pages
	 *  never reach into the palette and the palette never sniffs ids.
	 *  Only task modes are armed this way; typed sigils stay user grammar. */
	arm?: PaletteMode;
	/** Arms the EDIT buffer: Enter commits the buffer through `commit`. */
	edit?: boolean;
	/** 'date' turns the buffer into the date grammar (typed expressions +
	 *  arrow-key stepper); anything else is plain text. */
	editKind?: 'text' | 'date';
	/** A date buffer that accepts RANGE results (filter windows); the default
	 *  date field REJECTS them — one field, one date. */
	editRange?: boolean;
	/** The buffer's seed — the field's CURRENT value (registration re-runs
	 *  keep it honest; the palette re-arms fresh on every entry). */
	seed?: string;
	/** The edit buffer's destination. Return false to REJECT the commit —
	 *  the buffer stays open (an invalid date must never eat a keystroke). */
	commit?: (value: string) => boolean | void;
	/** The row runs WITHOUT closing the palette — submenu toggles (✓ flips,
	 *  the list re-reads live, the next tag is already typed). */
	keepOpen?: boolean;
	/** Pill override: `TITLE`/`DATE`/`COVER` says more than the mode's
	 *  generic word when the task names the field. */
	pillLabel?: string;
	/** Which photo-task handler the pick rows call (insert mode; default
	 *  'insert' — 'cover' lands the photo on the thumbnail field instead). */
	task?: 'insert' | 'cover';
	/** Omit for parent (children) and arm rows — everything else must run. */
	run?: () => void;
}

const nav = (id: string, title: string, href: string, shortcut?: string): Command => ({
	id,
	title,
	group: 'go to',
	shortcut,
	run: () => void goto(href)
});

export const baseCommands: Command[] = [
	nav('go.dashboard', 'Dashboard', '/', 'g d'),
	nav('go.posts', 'Posts', '/posts', 'g p'),
	nav('go.photos', 'Photos', '/photos'),
	nav('go.secrets', 'Secrets', '/secrets'),
	nav('go.settings', 'Settings', '/settings'),
	{
		// Global import: the photos page treats ?upload=1 as "open the picker on
		// arrival" — one upload door (the picker), reachable from any route.
		id: 'action.import-image',
		title: 'Import image',
		group: 'actions',
		run: () => void goto('/photos?upload=1')
	}
];

/** Dynamic commands injected by the shell (open-recent, contextual actions). */
export function recentCommands(recent: { slug: string; title: string }[]): Command[] {
	return recent.map((r) => ({
		id: `recent.${r.slug}`,
		title: r.title,
		group: 'open recent' as const,
		run: () => void goto(`/posts/${r.slug}`)
	}));
}
