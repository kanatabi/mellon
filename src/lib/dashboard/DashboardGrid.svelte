<script lang="ts">
	import WidgetCard from './WidgetCard.svelte';
	import { GRID_GAP_PX, ROW_UNIT_PX, placeEntry } from './layout.ts';
	import type { WidgetDef as WidgetDefT } from './widgets/registry.ts';

	/**
	 * The dashboard grid — 12 columns (md+; 24 on xl, the finer stepping),
	 * dense flow: holes fill after moves/unpins. Each card renders its
	 * registry body. Spans ride a CSS VARIABLE (--cs) so layout.css can
	 * adapt them per breakpoint — a span of 6/12 at md becomes 12/24 at xl.
	 *
	 * TWO PLACEHOLDER MACHINES (the B3 smoothness round):
	 * ① RESIZE (Grafana-style): the card floats pixel-continuously (the
	 *    card owns its float), the grid holds a PROVISIONAL span — never
	 *    applied to the entries — and renders the blue PLACEHOLDER, an
	 *    absolutely-positioned outline snapped to the real tracks (the
	 *    dragged entry's origin + the provisional span). The layout does
	 *    NOT reflow mid-drag; the release applies + persists once, FLIP-
	 *    animated.
	 * ② REORDER (sidebar-style): the dragged card leaves the flow (its
	 *    gap closes) and a GHOST grid item opens space at the landing
	 *    position, animated live as the pointer sweeps. Drop lands the
	 *    card into the ghost.
	 * FLIP (WAAPI) animates every layout change: snapshot rects before a
	 * mutation, invert, play — neighbors glide instead of jumping.
	 */
	interface Props {
		registry: WidgetDefT[];
		entries: { id: string; colSpan: number; rowSpan: number; hidden: boolean }[];
		held: (scope: string) => boolean;
		onPlace: (dragId: string, beforeId: string | null) => void;
		onToggleHidden: (id: string) => void;
		onMove: (id: string, dir: -1 | 1) => void;
		/** The provisional span from a resize drag, applied + persisted
		 *  ONCE on release (the card calls commit; the grid applies). */
		onSpanApply: (id: string, colSpan: number, rowSpan: number) => void;
	}

	let { registry, entries, held, onPlace, onToggleHidden, onMove, onSpanApply }: Props = $props();

	let gridEl: HTMLElement | null = null;
	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);

	// ── FLIP: the shared animation for every layout change ──────────────
	// A plain Map on purpose: a measurement cache read only inside event
	// handlers — never rendered from, so rune reactivity would be cost
	// with no effect (svelte/prefer-svelte-reactivity).
	const flipFrom = new Map<string, { x: number; y: number }>(); // eslint-disable-line svelte/prefer-svelte-reactivity

	function flipSnapshot() {
		flipFrom.clear();
		gridEl?.querySelectorAll<HTMLElement>('[data-widget-entry]').forEach((el) => {
			const r = el.getBoundingClientRect();
			// hidden elements (the drag source mid-drag) measure 0×0 — they
			// must not FLIP from the top-left corner on restore
			if (r.width === 0 && r.height === 0) return;
			flipFrom.set(el.dataset.widgetId ?? '', { x: r.left, y: r.top });
		});
	}

	function flipPlay() {
		// rAF runs after Svelte's microtask flush — the DOM is the NEW layout
		requestAnimationFrame(() => {
			gridEl?.querySelectorAll<HTMLElement>('[data-widget-entry]').forEach((el) => {
				const prev = flipFrom.get(el.dataset.widgetId ?? '');
				if (!prev || typeof el.animate !== 'function') return;
				const r = el.getBoundingClientRect();
				const dx = prev.x - r.left;
				const dy = prev.y - r.top;
				if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
				el.animate(
					[{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
					{ duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
				);
			});
			flipFrom.clear();
		});
	}

	// ── machine ①: resize (provisional span + the blue placeholder) ─────
	interface ResizeGeo {
		starts: number[]; // absolute left edge of each column track
		colCount: number;
		contentRight: number; // absolute right edge of the last track
		gridLeft: number; // grid box left (offsets are relative to it)
		rowPitch: number;
		originCol: number;
		originRow: number;
		gap: number;
	}
	let provisional = $state<{ id: string; colSpan: number; rowSpan: number } | null>(null);
	let resizeGeo: ResizeGeo | null = null;

	/** Track geometry, cached at drag start: the dragged entry's slot
	 *  origin (from its live rect) + the real column tracks (parsed from
	 *  the computed grid template; a non-rendered grid falls back to
	 *  equal tracks). The layout holds still mid-drag, so one read is
	 *  exact for the whole gesture. */
	function computeGeo(id: string): ResizeGeo | null {
		if (!gridEl) return null;
		const card = gridEl.querySelector<HTMLElement>(`[data-widget-id="${id}"]`);
		if (!card) return null;
		const grect = gridEl.getBoundingClientRect();
		const crect = card.getBoundingClientRect();
		const cs = getComputedStyle(gridEl);
		const gap = parseFloat(cs.columnGap) || GRID_GAP_PX;
		const parsed = cs.gridTemplateColumns
			.split(' ')
			.map(parseFloat)
			.filter((n) => n > 0);
		const widths =
			parsed.length >= 2
				? parsed
				: Array.from({ length: 12 }, () => Math.max(1, (grect.width - 11 * gap) / 12));
		const starts: number[] = [];
		let acc = grect.left;
		for (const w of widths) {
			starts.push(acc);
			acc += w + gap;
		}
		let originCol = 0;
		for (let i = widths.length - 1; i >= 0; i--) {
			if (crect.left >= starts[i] - 1) {
				originCol = i;
				break;
			}
		}
		const rowPitch = ROW_UNIT_PX + (parseFloat(cs.rowGap) || GRID_GAP_PX);
		const originRow = Math.max(0, Math.round((crect.top - grect.top) / rowPitch));
		return {
			starts,
			colCount: widths.length,
			contentRight: acc - gap,
			gridLeft: grect.left,
			rowPitch,
			originCol,
			originRow,
			gap
		};
	}

	function previewSpan(id: string, colSpan: number, rowSpan: number) {
		if (provisional?.id !== id || !resizeGeo) resizeGeo = computeGeo(id);
		provisional = { id, colSpan, rowSpan };
	}

	function commitSpan() {
		if (!provisional) return;
		flipSnapshot();
		onSpanApply(provisional.id, provisional.colSpan, provisional.rowSpan);
		provisional = null;
		resizeGeo = null;
		flipPlay();
	}

	/** the placeholder's absolute footprint: the dragged entry's slot
	 *  origin, sized to the PROVISIONAL (clamped-to-grid) span. */
	const placeholder = $derived.by(() => {
		if (!provisional || !resizeGeo) return null;
		const g = resizeGeo;
		const colSpan = Math.max(1, Math.min(provisional.colSpan, g.colCount - g.originCol));
		const right =
			g.originCol + colSpan < g.colCount ? g.starts[g.originCol + colSpan] - g.gap : g.contentRight;
		const width = right - g.starts[g.originCol];
		const height = (provisional.rowSpan - 1) * g.rowPitch + ROW_UNIT_PX;
		return {
			style: `left: ${g.starts[g.originCol] - g.gridLeft}px; top: ${g.originRow * g.rowPitch}px; width: ${Math.max(1, width)}px; height: ${height}px;`
		};
	});

	// ── machine ②: reorder (the sidebar-style ghost) ────────────────────
	function beforeIdOf(marker: string | null): string | null {
		if (!marker) return null;
		return marker.endsWith(':after') ? null : marker;
	}

	/** the render order during a drag: the provisional order —
	 *  placeEntry's shadow copy — opens the ghost slot at the landing
	 *  position. The dragged card STAYS MOUNTED (hidden in place): the
	 *  browser fires dragend on the drag SOURCE, and a detached source
	 *  means the end-handling never runs — dragId would stick and the
	 *  card would stay gone until a remount (the vanishing-panel bug).
	 *  display:none keeps it out of the flow (the gap closes) while the
	 *  element stays connected. The real entries stay untouched until
	 *  the drop. */
	const renderList = $derived.by(() => {
		if (!dragId) return entries;
		if (!overId) return entries;
		return placeEntry(entries, dragId, beforeIdOf(overId));
	});

	function onDragStart(e: DragEvent, id: string) {
		dragId = id;
		flipSnapshot(); // the lift: the gap closes, animated
		e.dataTransfer?.setData('text/plain', id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onDragOver(e: DragEvent, targetId: string) {
		if (!dragId || dragId === targetId) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const next = e.clientY < rect.top + rect.height / 2 ? targetId : `${targetId}:after`;
		if (next === overId) return; // no landing change → no snapshot churn
		flipSnapshot();
		overId = next;
		flipPlay(); // the ghost opens its slot, animated
	}

	function onDrop() {
		if (dragId && overId) {
			flipSnapshot();
			onPlace(dragId, beforeIdOf(overId));
		}
		dragId = null;
		overId = null;
	}

	function onDragEnd() {
		// cancel OR post-drop: the render order reverts to the real
		// entries — animate that too (post-drop this is a no-op: the
		// drop already landed the card where the ghost was)
		if (dragId) flipSnapshot();
		dragId = null;
		overId = null;
		flipPlay();
	}

	// the SAFETY NET: dragend does not bubble and fires on the drag
	// source — if anything above still misses it (delegation quirks,
	// dropped-on-detached edges), a document-capture listener guarantees
	// dragId can never stick and hide a card past the gesture. It only
	// listens to dragend (it fires AFTER drop, so it can never pre-empt
	// onDrop's landing).
	$effect(() => {
		if (!dragId) return;
		const end = () => {
			dragId = null;
			overId = null;
		};
		document.addEventListener('dragend', end, true);
		return () => document.removeEventListener('dragend', end, true);
	});
</script>

<div
	bind:this={gridEl}
	data-dashboard-grid
	class="grid grid-cols-1 gap-4 md:grid-cols-12 xl:grid-cols-24"
	role="region"
	aria-label="Dashboard widgets"
	ondragover={(e) => e.preventDefault()}
	ondrop={onDrop}
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
	{#each renderList as entry (entry.id)}
		{@const def = registry.find((d) => d.id === entry.id)}
		{#if def && (held(def.scope ?? '') ?? true) && !entry.hidden}
			{#if entry.id === dragId && overId}
				<!-- the ghost: opens the landing slot BEFORE the drop
				     (the post-editor sidebar's machine, on the grid).
				     No data-widget-id — the hidden source owns that FLIP
				     key. -->
				<div
					data-widget-entry
					data-ghost
					aria-hidden="true"
					style={`--cs: ${entry.colSpan}; grid-row: span ${entry.rowSpan}`}
					class="rounded-lg border-2 border-dashed border-brand/60 bg-brand/5"
				></div>
			{/if}
			<!-- ONE wrapper per entry, always mounted: dragstart only
			     hides it in place (the gap closes; the component — and
			     its body's fetch — survive) and the browser's dragend
			     always finds a connected source. The ghost above opens
			     the landing slot. -->
			<div
				data-widget-entry
				data-widget-id={entry.id}
				style={`--cs: ${entry.colSpan}; grid-row: span ${entry.rowSpan}`}
				role="listitem"
				class:hidden={entry.id === dragId}
				ondragstart={(e) => onDragStart(e, entry.id)}
				ondragover={(e) => onDragOver(e, entry.id)}
				ondrop={onDrop}
				ondragend={onDragEnd}
			>
				<WidgetCard
					{def}
					hidden={false}
					colSpan={entry.colSpan}
					rowSpan={entry.rowSpan}
					onToggleHidden={() => onToggleHidden(entry.id)}
					onSpanCommit={commitSpan}
					onMove={(dir) => onMove(entry.id, dir)}
					onSpanTarget={(colSpan, rowSpan) => previewSpan(entry.id, colSpan, rowSpan)}
				>
					<def.body />
				</WidgetCard>
			</div>
		{/if}
	{/each}
</div>
