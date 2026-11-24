<script lang="ts">
	import WidgetCard from './WidgetCard.svelte';
	import type { WidgetDef as WidgetDefT } from './widgets/registry.ts';

	/**
	 * The dashboard grid — 6 columns (md+; 12 on xl, the finer stepping),
	 * dense flow: holes fill after moves/unpins. Each card renders its
	 * registry body. Drag-to-reorder rides HTML5 DnD on the data-widget
	 * cards and lands through the store's place(). Resize rides the
	 * card's corner/edge zones — absolute span targets, applied live.
	 * Spans ride a CSS VARIABLE (--cs) so layout.css can adapt
	 * them per breakpoint — a span of 3/6 at md becomes 6/12 at xl.
	 */
	interface Props {
		registry: WidgetDefT[];
		entries: { id: string; colSpan: number; rowSpan: number; hidden: boolean }[];
		held: (scope: string) => boolean;
		onPlace: (dragId: string, beforeId: string | null) => void;
		onToggleHidden: (id: string) => void;
		onSpanCommit: () => void;
		onMove: (id: string, dir: -1 | 1) => void;
		/** ABSOLUTE span targets (the card computes them from its start
		 *  geometry) — applied live without persist. */
		onSpanTarget: (id: string, colSpan: number, rowSpan: number) => void;
	}

	let {
		registry,
		entries,
		held,
		onPlace,
		onToggleHidden,
		onSpanCommit,
		onMove,
		onSpanTarget
	}: Props = $props();

	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);

	function onDragStart(e: DragEvent, id: string) {
		dragId = id;
		e.dataTransfer?.setData('text/plain', id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onDragOver(e: DragEvent, targetId: string) {
		if (!dragId || dragId === targetId) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		overId = e.clientY < rect.top + rect.height / 2 ? targetId : `${targetId}:after`;
	}

	function onDrop() {
		if (dragId && overId) {
			const [targetId, after] = overId.split(':after');
			// the grid places by ORDER (dense flow does the geometry)
			onPlace(dragId, after === 'after' ? null : targetId);
		}
		dragId = null;
		overId = null;
	}
</script>

<div
	class="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12"
	role="region"
	aria-label="Dashboard widgets"
	ondragover={(e) => e.preventDefault()}
	ondrop={onDrop}
>
	{#each entries as entry (entry.id)}
		{@const def = registry.find((d) => d.id === entry.id)}
		{#if def && (held(def.scope ?? '') ?? true) && !entry.hidden}
			<div
				data-widget-entry
				data-widget-id={entry.id}
				style={`--cs: ${entry.colSpan}; grid-row: span ${entry.rowSpan}`}
				class:opacity-40={dragId === entry.id}
				role="listitem"
				ondragstart={(e) => onDragStart(e, entry.id)}
				ondragover={(e) => onDragOver(e, entry.id)}
				ondrop={onDrop}
				ondragend={() => {
					dragId = null;
					overId = null;
				}}
			>
				<WidgetCard
					{def}
					hidden={false}
					colSpan={entry.colSpan}
					rowSpan={entry.rowSpan}
					onToggleHidden={() => onToggleHidden(entry.id)}
					{onSpanCommit}
					onMove={(dir) => onMove(entry.id, dir)}
					onSpanTarget={(colSpan, rowSpan) => onSpanTarget(entry.id, colSpan, rowSpan)}
				>
					<def.body />
				</WidgetCard>
			</div>
		{/if}
	{/each}
</div>
