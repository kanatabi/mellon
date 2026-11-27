import {
	FileText,
	GitCompareArrows,
	House,
	Images,
	KeyRound,
	LayoutGrid,
	ListTodo,
	Tag,
	Users
} from 'lucide-svelte';
import type { Command } from './commands.ts';

/**
 * The destination table — ONE truth for the rail AND the palette.
 *
 * Before this module the rail owned `SCOPED_NAV` inline and the palette kept a
 * hand-copied route list in `commands.ts`; the copies drifted (the palette
 * offered Users at a dead `/settings/users`, and Vault/Compare/Users to
 * principals the rail correctly hid). The shell now renders the rail from
 * this table and derives the palette's `go to` rows from the SAME filtered
 * groups — scope gates cannot disagree because there is one gate.
 */
export interface Destination {
	/** Stable palette id (`go.*`); never derived from the href, so a route
	 *  move does not orphan recent-command habits. */
	id: string;
	href: string;
	icon: typeof House;
	label: string;
	/** Palette search text when the rail's label is terser than the door
	 *  (`Vault · edit values`). Falls back to `label`. */
	paletteTitle?: string;
	hue: string;
	/** Display-only today (no sequence handler exists) — kept for the rows
	 *  that already advertise one. */
	shortcut?: string;
}

export interface DestinationGroup {
	label: string;
	/** The historical single-scope requirement. */
	scope?: string;
	/** ANY-OF requirement (the tasks trio). */
	scopes?: string[];
	items: Destination[];
}

export const DESTINATION_GROUPS: DestinationGroup[] = [
	// the DASHBOARD is the home (the widget-home round): every authenticated
	// user gets it — it renders widgets for whatever scopes they hold
	{
		label: 'Home',
		items: [
			{
				id: 'go.dashboard',
				href: '/',
				icon: House,
				label: 'Dashboard',
				hue: 'var(--brand)',
				shortcut: 'g d'
			}
		]
	},
	{
		label: 'Tools',
		// any of the three grants opens the workspace door; the page's own 403
		// stays the page's business (courtesy gate only).
		scopes: ['tasks:create', 'tasks:update', 'tasks:manage'],
		items: [
			{ id: 'go.tasks', href: '/tasks', icon: ListTodo, label: 'Tasks', hue: 'var(--accent-teal)' }
		]
	},
	{
		label: 'Content',
		scope: 'content:manage',
		items: [
			{
				id: 'go.posts',
				href: '/posts',
				icon: FileText,
				label: 'Posts',
				hue: 'var(--accent-blue)',
				shortcut: 'g p'
			},
			{
				id: 'go.photos',
				href: '/photos',
				icon: Images,
				label: 'Photos',
				hue: 'var(--accent-teal)'
			},
			{ id: 'go.tags', href: '/tags', icon: Tag, label: 'Tags', hue: 'var(--accent-slate)' }
		]
	},
	{
		label: 'Control plane',
		scope: 'secrets:admin',
		items: [
			{
				id: 'go.configs',
				href: '/configs',
				icon: LayoutGrid,
				label: 'Configs',
				hue: 'var(--accent-amber)'
			},
			{
				id: 'go.vault',
				href: '/configs/vault',
				icon: KeyRound,
				label: 'Vault',
				paletteTitle: 'Vault · edit values',
				hue: 'var(--accent-amber)'
			},
			{
				id: 'go.compare',
				href: '/configs/compare',
				icon: GitCompareArrows,
				label: 'Compare',
				paletteTitle: 'Compare versions',
				hue: 'var(--accent-amber)'
			}
		]
	},
	{
		label: 'Admin',
		scope: 'users:manage',
		items: [
			{
				id: 'go.users',
				href: '/admin/users',
				icon: Users,
				label: 'Users',
				paletteTitle: 'Users · roles & access',
				hue: 'var(--accent-teal)'
			}
		]
	}
];

/** Group visibility: no requirement = everyone; `scope` = that one scope;
 *  `scopes` = ANY of them (the tasks trio). */
export function groupHeld(group: DestinationGroup, held: (scope: string) => boolean): boolean {
	return group.scope !== undefined
		? held(group.scope)
		: group.scopes !== undefined
			? group.scopes.some(held)
			: true;
}

/** The filtered table — the rail renders it, the palette derives from it. */
export function visibleDestinationGroups(held: (scope: string) => boolean): DestinationGroup[] {
	return DESTINATION_GROUPS.filter((group) => groupHeld(group, held));
}

/** The palette's `go to` rows: one per visible destination, scope-gated by
 *  construction (the caller passes groups already filtered through `held`).
 *  Navigation is injected so this module stays pure (node-testable) — the
 *  shell passes `goto`, the test passes a spy. */
export function destinationCommands(
	groups: DestinationGroup[],
	navigate: (href: string) => void
): Command[] {
	return groups.flatMap((group) =>
		group.items.map((item) => ({
			id: item.id,
			title: item.paletteTitle ?? item.label,
			group: 'go to' as const,
			...(item.shortcut ? { shortcut: item.shortcut } : {}),
			run: () => navigate(item.href)
		}))
	);
}
