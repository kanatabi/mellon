import type { Component } from 'svelte';
import { FileText, Images, ListTodo, Tag } from 'lucide-svelte';

/**
 * The widget registry — the plugin seam of the dashboard home (the RBAC
 * round's app-center direction). EVERY widget is a prebuilt card body that
 * plugs in with ONE folder + ONE entry: the dashboard's layout store, grid,
 * drag/resize and persistence all read this registry and nothing else.
 *
 * `scope` gates the widget at MOUNT — an unheld scope means the body never
 * mounts and its data calls never fire (lumen's truth over the browser's
 * memory). `scopes` is the ANY-OF form for multi-scope apps (the tasks
 * trio): held when the principal holds at least one. Both absent = any
 * authenticated user. When both are set, `scopes` wins.
 *
 * Future widgets (home monitoring, budget summaries) land as one folder +
 * one entry here; user-defined widgets would be GENERIC KINDS (iframe /
 * link / notes bodies with user config), never runtime-compiled Svelte.
 */
export interface WidgetDef {
	id: string;
	title: string;
	description: string;
	/** The "see all" door — the desk this widget summarizes. */
	href?: string;
	/** The single required scope. */
	scope?: string;
	/** ANY-OF scopes (multi-scope apps); takes precedence over `scope`. */
	scopes?: string[];
	defaultSpan: { col: number; row: number };
	minSpan: { col: number; row: number };
	/** The picker's STATIC preview icon (no fetches — the real body never
	 *  mounts in the panel). */
	icon?: typeof import('lucide-svelte').FileText;
	/** The card's inner component — self-contained, fetches its own data.
	 *  `preview` renders the REAL structure with placeholder content and
	 *  never fetches (the picker's rows — the contract: every body
	 *  honors it). */
	body: Component<{ preview?: boolean }>;
}

import RecentPostsBody from './recent-posts/body.svelte';
import RecentPhotosBody from './recent-photos/body.svelte';
import RecentTagsBody from './recent-tags/body.svelte';
import TasksBody from './tasks/body.svelte';

/**
 * The ONE mount-gate rule, shared by the layout store, the canvas and the
 * picker: `scopes` is any-of, `scope` is the single requirement, neither
 * means any authenticated user. Callers pass their per-principal `held`.
 */
export function widgetHeld(def: WidgetDef, held: (scope: string) => boolean): boolean {
	if (def.scopes?.length) return def.scopes.some(held);
	return def.scope !== undefined ? held(def.scope) : true;
}

export const WIDGETS: WidgetDef[] = [
	{
		id: 'recent-posts',
		title: 'Recent posts',
		description: 'the freshest posts, newest first',
		href: '/posts',
		scope: 'content:manage',
		defaultSpan: { col: 6, row: 6 },
		minSpan: { col: 2, row: 2 },
		icon: FileText,
		body: RecentPostsBody
	},
	{
		id: 'recent-photos',
		title: 'Recent photos',
		description: 'the latest additions to the library',
		href: '/photos',
		scope: 'content:manage',
		defaultSpan: { col: 6, row: 6 },
		minSpan: { col: 2, row: 2 },
		icon: Images,
		body: RecentPhotosBody
	},
	{
		id: 'recent-tags',
		title: 'Newest tags',
		description: "the tag desk's newest vocabulary",
		href: '/tags',
		scope: 'content:manage',
		defaultSpan: { col: 6, row: 6 },
		minSpan: { col: 2, row: 2 },
		icon: Tag,
		body: RecentTagsBody
	},
	{
		id: 'tasks',
		title: 'Tasks',
		description: 'what is due, at a glance',
		href: '/tasks',
		// the tasks app's three scopes are GRANULAR: any one opens the desk
		// (and this widget), the same any-of rule the nav section uses.
		scopes: ['tasks:create', 'tasks:update', 'tasks:manage'],
		defaultSpan: { col: 6, row: 5 },
		minSpan: { col: 2, row: 2 },
		icon: ListTodo,
		body: TasksBody
	}
];

export function widgetFor(id: string): WidgetDef | undefined {
	return WIDGETS.find((w) => w.id === id);
}
