import type { Component } from 'svelte';
import { FileText, Images, Tag } from 'lucide-svelte';

/**
 * The widget registry — the plugin seam of the dashboard home (the RBAC
 * round's app-center direction). EVERY widget is a prebuilt card body that
 * plugs in with ONE folder + ONE entry: the dashboard's layout store, grid,
 * drag/resize and persistence all read this registry and nothing else.
 *
 * `scope` gates the widget at MOUNT — an unheld scope means the body never
 * mounts and its data calls never fire (lumen's truth over the browser's
 * memory). `undefined` = any authenticated user.
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
	scope?: string;
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
	}
];

export function widgetFor(id: string): WidgetDef | undefined {
	return WIDGETS.find((w) => w.id === id);
}
