<script module lang="ts">
	import DashboardGrid from './DashboardGrid.svelte';
	import RecentPostsBody from './widgets/recent-posts/body.svelte';
	import type { WidgetDef } from './widgets/registry.ts';

	/**
	 * The grid fixture: a stub registry whose bodies are REAL components
	 * (their client fetches fail in happy-dom → the self-contained error
	 * state renders — fine, the tests assert the WIRING: resize targets,
	 * drag landing, hidden reflow). The store lives at module scope so
	 * tests can hold the REACTIVE entries.
	 */
	const defs: WidgetDef[] = [
		{
			id: 'w-a',
			title: 'Widget A',
			description: '',
			defaultSpan: { col: 3, row: 3 },
			minSpan: { col: 2, row: 2 },
			body: RecentPostsBody
		},
		{
			id: 'w-b',
			title: 'Widget B',
			description: '',
			defaultSpan: { col: 3, row: 3 },
			minSpan: { col: 2, row: 2 },
			body: RecentPostsBody
		}
	];

	// REACTIVE: the hidden toggle must reflow the grid (the reflow test's
	// whole point) — a plain const would swallow the write
	let entries = $state([
		{ id: 'w-a', colSpan: 3, rowSpan: 3, hidden: false },
		{ id: 'w-b', colSpan: 3, rowSpan: 3, hidden: false }
	]);

	let placed: { dragId: string; beforeId: string | null } | null = $state(null);
	let committed = $state(false);
	let moved: { id: string; dir: -1 | 1 } | null = $state(null);
	let spanTarget: { id: string; colSpan: number; rowSpan: number } | null = $state(null);
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
	onSpanCommit={() => (committed = true)}
	onMove={(id, dir) => (moved = { id, dir })}
	onSpanTarget={(id, colSpan, rowSpan) => (spanTarget = { id, colSpan, rowSpan })}
/>

<!-- the captured callbacks, serialized for the tests -->
<div
	data-testid="captures"
	data-placed={JSON.stringify(placed)}
	data-committed={committed}
	data-moved={JSON.stringify(moved)}
	data-span-target={JSON.stringify(spanTarget)}
	data-toggled={toggled ?? ''}
></div>
