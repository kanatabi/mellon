<script lang="ts">
	import DashboardGrid from './DashboardGrid.svelte';
	import RecentPostsBody from './widgets/recent-posts/body.svelte';
	import { nudgeEntry, resolveDrop, clampEntry } from './layout.ts';
	import type { WidgetLayoutEntry } from './layout.ts';
	import type { WidgetDef } from './widgets/registry.ts';

	/**
	 * The canvas fixture: a stub registry whose bodies are REAL
	 * components (their client fetches fail in happy-dom → the
	 * self-contained error state renders — fine, the tests assert the
	 * WIRING: absolute placement, provisional resize, the placeholder,
	 * keyboard nudges). ONE INSTANCE script — module scope would share
	 * state across tests. Nudges run through the REAL engine.
	 */
	const defs: WidgetDef[] = [
		{
			id: 'w-a',
			title: 'Widget A',
			description: '',
			defaultSpan: { col: 12, row: 6 },
			minSpan: { col: 2, row: 2 },
			body: RecentPostsBody
		},
		{
			id: 'w-b',
			title: 'Widget B',
			description: '',
			defaultSpan: { col: 12, row: 6 },
			minSpan: { col: 2, row: 2 },
			body: RecentPostsBody
		}
	];

	// REACTIVE: applies and toggles must reflow the canvas
	let entries = $state<WidgetLayoutEntry[]>([
		{ id: 'w-a', x: 0, y: 0, w: 12, h: 6, hidden: false },
		{ id: 'w-b', x: 12, y: 0, w: 12, h: 6, hidden: false }
	]);

	let applied: { id: string; w: number; h: number } | null = $state(null);
	let nudged: { id: string; dx: number; dy: number } | null = $state(null);
	let toggled: string | null = $state(null);
	let moved: { id: string; x: number; y: number } | null = $state(null);
	let dropped: { id: string; x: number; y: number } | null = $state(null);
	let cancelled = $state(false);

	/** the shadow layout the store's `view` produces during a drag — the
	 *  REAL engine resolves it. */
	let view = $derived.by(() => {
		const target = moved;
		if (!target) return entries;
		const e = entries.find((p) => p.id === target.id);
		const def = defs.find((d) => d.id === target.id);
		if (!e || !def) return entries;
		return resolveDrop(entries, clampEntry(def, { ...e, x: target.x, y: target.y }));
	});
</script>

<DashboardGrid
	registry={defs}
	entries={view}
	held={() => true}
	onToggleHidden={(id) => {
		toggled = id;
		entries = entries.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } : e));
	}}
	onSpanApply={(id, w, h) => {
		applied = { id, w, h };
		entries = entries.map((e) => (e.id === id ? { ...e, w, h } : e));
	}}
	onNudge={(id, dx, dy) => {
		nudged = { id, dx, dy };
		entries = nudgeEntry(entries, id, dx, dy, defs);
	}}
	onDragMove={(id, x, y) => (moved = { id, x, y })}
	onDragEnd={(id, x, y) => {
		dropped = { id, x, y };
		moved = null;
		entries = resolveDrop(
			entries,
			clampEntry(
				defs.find((d) => d.id === id)!,
				{
					...(entries.find((e) => e.id === id) as WidgetLayoutEntry),
					x,
					y
				}
			)
		);
	}}
	onDragCancel={() => {
		cancelled = true;
		moved = null;
	}}
/>

<!-- the captured callbacks, serialized for the tests -->
<div
	data-testid="captures"
	data-applied={JSON.stringify(applied)}
	data-nudged={JSON.stringify(nudged)}
	data-toggled={toggled ?? ''}
	data-dropped={JSON.stringify(dropped)}
	data-cancelled={cancelled}
></div>
