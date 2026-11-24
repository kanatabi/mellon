<script lang="ts">
	import DashboardGrid from './DashboardGrid.svelte';
	import RecentPostsBody from './widgets/recent-posts/body.svelte';
	import type { WidgetDef } from './widgets/registry.ts';

	/**
	 * The grid fixture: a stub registry whose bodies are REAL components
	 * (their client fetches fail in happy-dom → the self-contained error
	 * state renders — fine, the tests assert the WIRING: provisional
	 * resize targets, the placeholder, the reorder ghost, the apply on
	 * release). The REACTIVE entries let tests pin "the layout holds
	 * still mid-drag". ONE INSTANCE script — module scope would share
	 * entries (and captured callbacks) across tests.
	 */
	const defs: WidgetDef[] = [
		{
			id: 'w-a',
			title: 'Widget A',
			description: '',
			defaultSpan: { col: 6, row: 6 },
			minSpan: { col: 4, row: 4 },
			body: RecentPostsBody
		},
		{
			id: 'w-b',
			title: 'Widget B',
			description: '',
			defaultSpan: { col: 6, row: 6 },
			minSpan: { col: 4, row: 4 },
			body: RecentPostsBody
		}
	];

	// REACTIVE: the hidden toggle must reflow the grid (the reflow test's
	// whole point) — a plain const would swallow the write
	let entries = $state([
		{ id: 'w-a', colSpan: 6, rowSpan: 6, hidden: false },
		{ id: 'w-b', colSpan: 6, rowSpan: 6, hidden: false }
	]);

	let placed: { dragId: string; beforeId: string | null } | null = $state(null);
	let applied: { id: string; colSpan: number; rowSpan: number } | null = $state(null);
	let moved: { id: string; dir: -1 | 1 } | null = $state(null);
	let toggled: string | null = $state(null);
</script>

<DashboardGrid
	registry={defs}
	{entries}
	held={() => true}
	onPlace={(dragId, beforeId) => (placed = { dragId, beforeId })}
	onToggleHidden={(id) => {
		toggled = id;
		entries = entries.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } : e));
	}}
	onSpanApply={(id, colSpan, rowSpan) => {
		applied = { id, colSpan, rowSpan };
		entries = entries.map((e) => (e.id === id ? { ...e, colSpan, rowSpan } : e));
	}}
	onMove={(id, dir) => (moved = { id, dir })}
/>

<!-- the captured callbacks, serialized for the tests -->
<div
	data-testid="captures"
	data-placed={JSON.stringify(placed)}
	data-applied={JSON.stringify(applied)}
	data-moved={JSON.stringify(moved)}
	data-toggled={toggled ?? ''}
></div>
