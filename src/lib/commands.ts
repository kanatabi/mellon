import { goto } from '$app/navigation';

/**
 * The command registry (DESIGN §7): pages/sections declare commands, the
 * palette renders them. Adding a page = one entry here — the rail kit's
 * plug-and-play contract, applied to navigation.
 */
export interface Command {
	id: string;
	title: string;
	group: 'go to' | 'actions' | 'open recent';
	shortcut?: string;
	run: () => void;
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
	nav('go.settings', 'Settings', '/settings')
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
