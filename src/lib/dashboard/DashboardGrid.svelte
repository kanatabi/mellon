<script lang="ts">
	import WidgetCard from './WidgetCard.svelte';
	import {
		GRID_GAP_PX,
		ROW_UNIT_PX,
		canvasHeightPx,
		columnLeftStyle,
		columnWidthStyle,
		spanHeightPx
	} from './layout.ts';
	import type { WidgetLayoutEntry } from './layout.ts';
	import { widgetHeld, type WidgetDef as WidgetDefT } from './widgets/registry.ts';

	/**
	 * The dashboard canvas — the COORDINATE model (the C round): every
	 * entry is absolutely placed at {x, y, w, h} on a 24-column canvas of
	 * 44px rows. Percent left/width keep it responsive at any breakpoint;
	 * the canvas grows with its deepest panel. Free placement means holes
	 * stay holes (the engine's vertical gravity only fills genuine voids).
	 *
	 * The resize machine: the card floats pixel-continuously while the
	 * grid holds a PROVISIONAL w/h and renders the blue PLACEHOLDER at
	 * the widget's own x/y — geometry is direct math now, no track
	 * parsing. Release applies + persists once. Keyboard: Alt+arrows
	 * nudge by whole cells, Shift+Alt+arrows resize. Free MOUSE drag
	 * lands in C2 (the pointer machine on the card header).
	 */
	interface Props {
		registry: WidgetDefT[];
		entries: WidgetLayoutEntry[];
		held: (scope: string) => boolean;
		/** DELETE (placed-or-absent): the card's trash button. */
		onDelete: (id: string) => void;
		/** Keyboard nudge by whole cells (collision-resolved in the engine). */
		onNudge: (id: string, dx: number, dy: number) => void;
		/** The provisional resize, applied + persisted ONCE on release. */
		onSpanApply: (id: string, w: number, h: number) => void;
		/** The free drag: the pointer-follow pixels stay HERE; the caller
		 *  previews the target cell (the shadow layout) — nothing
		 *  persists until the release. */
		onDragMove: (id: string, x: number, y: number, pxLeft: number, pxTop: number) => void;
		onDragEnd: (id: string, x: number, y: number) => void;
		onDragCancel: () => void;
	}

	let {
		registry,
		entries,
		held,
		onDelete,
		onNudge,
		onSpanApply,
		onDragMove,
		onDragEnd,
		onDragCancel
	}: Props = $props();

	let canvasEl: HTMLElement | null = null;

	// ── the provisional resize + the blue placeholder ───────────────────
	let provisional = $state<{ id: string; w: number; h: number } | null>(null);

	// ── the free drag: pointer-follow pixels + the target cell ──────────
	let dragPx = $state<{ id: string; left: number; top: number } | null>(null);
	let dragTarget = $state<{ id: string; x: number; y: number } | null>(null);

	function handleDragMove(id: string, x: number, y: number, pxLeft: number, pxTop: number) {
		dragPx = { id, left: pxLeft, top: pxTop };
		dragTarget = { id, x, y };
		onDragMove(id, x, y, pxLeft, pxTop);
	}

	function handleDragEnd(id: string, x: number, y: number) {
		dragPx = null;
		dragTarget = null;
		onDragEnd(id, x, y);
	}

	function handleDragCancel() {
		dragPx = null;
		dragTarget = null;
		onDragCancel();
	}

	function previewSpan(id: string, w: number, h: number) {
		provisional = { id, w, h };
	}

	function commitSpan() {
		if (!provisional) return;
		onSpanApply(provisional.id, provisional.w, provisional.h);
		provisional = null;
	}

	/** the placeholder's footprint — for a RESIZE, the widget's own x/y
	 *  sized to the provisional w/h; for a DRAG, the target cell sized to
	 *  the widget's w/h. Columns as percentages (responsive), rows as
	 *  pixels. */
	const placeholder = $derived.by(() => {
		let id: string | null = null;
		let w = 0;
		let h = 0;
		if (provisional) {
			id = provisional.id;
			w = provisional.w;
			h = provisional.h;
		} else if (dragTarget) {
			const t = dragTarget;
			const e = entries.find((p) => p.id === t.id);
			if (e) {
				id = e.id;
				w = e.w;
				h = e.h;
			}
		}
		if (!id) return null;
		const e = entries.find((p) => p.id === id);
		if (!e) return null;
		return {
			style: `left: ${columnLeftStyle(e.x)}; top: ${e.y * (ROW_UNIT_PX + GRID_GAP_PX)}px; width: ${columnWidthStyle(w)}; height: ${spanHeightPx(h)}px;`
		};
	});
</script>

<div
	bind:this={canvasEl}
	data-dashboard-grid
	class="relative"
	style={`height: ${canvasHeightPx(entries)}px;`}
	role="region"
	aria-label="Dashboard widgets — Alt+arrows to move a focused card, Shift+Alt+arrows to resize"
>
	{#if placeholder}
		<!-- the blue container (the resize placeholder): the snapped
		     footprint previewing where the floating card will land -->
		<div
			data-resize-placeholder
			aria-hidden="true"
			class="pointer-events-none absolute z-10 rounded-lg border-2 border-brand/70 bg-brand/10 transition-[width,height] duration-100"
			style={placeholder.style}
		></div>
	{/if}
	{#each entries as entry (entry.id)}
		{@const def = registry.find((d) => d.id === entry.id)}
		{#if def && widgetHeld(def, held)}
			<!-- absolute placement: left/width are CANVAS PERCENTAGES (any
			     breakpoint), top/height the fixed 44px rows. The position
			     transitions make every engine move glide — except the
			     widget being DRAGGED, which follows the pointer live. -->
			<div
				data-widget-entry
				data-widget-id={entry.id}
				style={dragPx?.id === entry.id
					? `left: ${dragPx.left}px; top: ${dragPx.top}px; width: ${columnWidthStyle(entry.w)}; height: ${spanHeightPx(entry.h)}px; z-index: 30;`
					: `left: ${columnLeftStyle(entry.x)}; top: ${entry.y * (ROW_UNIT_PX + GRID_GAP_PX)}px; width: ${columnWidthStyle(entry.w)}; height: ${spanHeightPx(entry.h)}px;`}
				class="absolute transition-[left,top,width,height] duration-200 ease-out {dragPx?.id ===
				entry.id
					? 'transition-none'
					: ''}"
				role="listitem"
			>
				<WidgetCard
					{def}
					w={entry.w}
					h={entry.h}
					onDelete={() => onDelete(entry.id)}
					onSpanCommit={commitSpan}
					onNudge={(dx, dy) => onNudge(entry.id, dx, dy)}
					onSpanTarget={(w, h) => previewSpan(entry.id, w, h)}
					onDragMove={(x, y, pxLeft, pxTop) => handleDragMove(entry.id, x, y, pxLeft, pxTop)}
					onDragEnd={(x, y) => handleDragEnd(entry.id, x, y)}
					onDragCancel={handleDragCancel}
				>
					<def.body />
				</WidgetCard>
			</div>
		{/if}
	{/each}
</div>
