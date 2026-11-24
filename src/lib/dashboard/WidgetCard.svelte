<script lang="ts">
	import { GripVertical, Eye, EyeOff, GripHorizontal } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import { GRID_GAP_PX, ROW_UNIT_PX } from './layout.ts';
	import type { WidgetDef } from './widgets/registry.ts';

	/**
	 * The widget card — the shared SHELL of the dashboard home: title,
	 * drag handle, pin/unpin, and the RESIZE machine (corner grip +
	 * right/bottom edge zones — the Grafana "custom grid" feel).
	 *
	 * THE GESTURE SPLIT (the 2026-11-24 hijack lesson): the article is
	 * the REORDER drag source (HTML5 DnD — the grid's machine), so the
	 * resize zones are DRAG-IMMUNE by three layers: draggable="false"
	 * keeps them from seeding a native drag, the pointerdown
	 * preventDefault kills the compat mousedown that seeds one, and the
	 * dragstart trap (stopPropagation + preventDefault) is the
	 * belt-and-braces — no grip gesture can ever enter the reorder
	 * machine.
	 *
	 * onSpanTarget carries ABSOLUTE spans, not deltas: the pointer drag
	 * computes them from the START geometry (the live-applied spans must
	 * never compound the delta), keyboard parity adds the delta to the
	 * LIVE props. The store still clamps to min + grid.
	 */
	interface Props {
		def: WidgetDef;
		hidden: boolean;
		colSpan: number;
		rowSpan: number;
		onToggleHidden: () => void;
		/** Absolute target spans from a resize drag or Shift+Alt+arrows —
		 *  applied live (no persist); the release persists once. */
		onSpanTarget: (colSpan: number, rowSpan: number) => void;
		/** The release: the grid persists the applied span. */
		onSpanCommit: () => void;
		/** Keyboard move (order neighbor swap). */
		onMove: (dir: -1 | 1) => void;
		/** The body snippet — the widget's own component, rendered by the
		 *  page (which owns the registry lookup). */
		children: Snippet;
	}

	let {
		def,
		hidden,
		colSpan,
		rowSpan,
		onToggleHidden,
		onSpanTarget,
		onSpanCommit,
		onMove,
		children
	}: Props = $props();

	// the resize machine: pointer-captured drags on the corner / edge
	// zones. While dragging, the card FLOATS — pixel-continuous inline
	// size following the pointer (the Grafana feel: the panel grows under
	// your cursor; the grid's blue placeholder shows the snapped target
	// and the layout holds still until release). The card measures the
	// grid's COLUMN PITCH at drag start ((width + gap) / span — exact for
	// any span); the row pitch is the FIXED track + gap. The grid owns
	// the provisional span, the placeholder, and the persistence.
	type ResizeMode = 'corner' | 'e' | 's';
	let resizing = $state(false);
	let mode: ResizeMode = $state('corner');
	let start = $state({
		x: 0,
		y: 0,
		colSpan: 0,
		rowSpan: 0,
		colPitch: 0,
		w: 0,
		h: 0,
		minW: 0,
		minH: 0
	});
	/** the pixel-continuous float size (null = no float, grid-tracked). */
	let float = $state<{ w: number; h: number } | null>(null);

	function resizeStart(e: PointerEvent, m: ResizeMode) {
		const el = (e.currentTarget as HTMLElement).closest('[data-widget-card]') as HTMLElement;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		mode = m;
		resizing = true;
		const colPitch = (rect.width + GRID_GAP_PX) / colSpan;
		const rowPitch = (rect.height + GRID_GAP_PX) / rowSpan;
		start = {
			x: e.clientX,
			y: e.clientY,
			colSpan,
			rowSpan,
			colPitch,
			w: rect.width,
			h: rect.height,
			minW: Math.max(1, def.minSpan.col * colPitch - GRID_GAP_PX),
			minH: Math.max(1, def.minSpan.row * rowPitch - GRID_GAP_PX)
		};
		// no compat mousedown → no native drag from the draggable card,
		// no text selection under the drag
		e.preventDefault();
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			/* capture is polish — the zone's own listeners keep the drag alive */
		}
	}

	function resizeMove(e: PointerEvent) {
		if (!resizing) return;
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		// 'e' locks to width, 's' locks to height, corner does both
		const colDelta = mode === 's' ? 0 : Math.round(dx / start.colPitch);
		const rowDelta = mode === 'e' ? 0 : Math.round(dy / (ROW_UNIT_PX + GRID_GAP_PX));
		// the FLOAT: pixel-continuous, clamped only by the widget minimum
		const w = mode === 's' ? start.w : Math.max(start.minW, start.w + dx);
		const h = mode === 'e' ? start.h : Math.max(start.minH, start.h + dy);
		if (colDelta === 0 && rowDelta === 0 && float?.w === w && float.h === h) return;
		float = { w, h };
		if (colDelta !== 0 || rowDelta !== 0) {
			// ABSOLUTE targets from the START geometry — the live-applied
			// spans are never the reference (the compounding bug)
			onSpanTarget(
				Math.max(def.minSpan.col, start.colSpan + colDelta),
				Math.max(def.minSpan.row, start.rowSpan + rowDelta)
			);
		}
	}

	function resizeEnd() {
		if (!resizing) return;
		resizing = false;
		float = null; // back to the grid-tracked (snapped) size
		onSpanCommit(); // the grid applies the provisional span + persists
	}

	function keydown(e: KeyboardEvent) {
		// Shift+Alt+arrows = resize — provisional then IMMEDIATE commit
		// (keyboard has no release gesture); Alt+arrows = move
		if (e.shiftKey && e.altKey) {
			const col = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
			const row = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
			if (col !== 0 || row !== 0) {
				e.preventDefault();
				onSpanTarget(
					Math.max(def.minSpan.col, colSpan + col),
					Math.max(def.minSpan.row, rowSpan + row)
				);
				onSpanCommit();
			}
			return;
		}
		if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
			e.preventDefault();
			onMove(e.key === 'ArrowUp' ? -1 : 1);
		}
	}

	/** the dragstart trap shared by every resize zone. */
	function killDrag(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<article
	data-widget-card
	draggable="true"
	tabindex="0"
	onkeydown={keydown}
	style={float ? `width: ${float.w}px; height: ${float.h}px; z-index: 30;` : undefined}
	class="group relative flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-brand/40 {resizing
		? 'ring-2 ring-brand/60'
		: ''}"
	aria-label="{def.title} widget — Alt+arrows to move, Shift+Alt+arrows to resize, drag to reorder"
>
	<header class="flex items-center justify-between gap-2">
		<div class="flex min-w-0 items-center gap-1.5">
			<GripVertical
				class="size-3.5 shrink-0 cursor-grab text-muted-foreground/30 transition-colors group-hover:text-muted-foreground"
				aria-hidden="true"
			/>
			<p class="truncate text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
				{def.title}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-1">
			{#if def.href}
				<a
					href={def.href}
					class="rounded-sm font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
				>
					see all →
				</a>
			{/if}
			<button
				type="button"
				onclick={onToggleHidden}
				aria-pressed={!hidden}
				aria-label={hidden ? `Pin ${def.title}` : `Unpin ${def.title}`}
				title={hidden ? 'Pin to dashboard' : 'Unpin (moves to the tray)'}
				class="rounded p-1 text-muted-foreground/50 transition-colors hover:text-foreground"
			>
				{#if hidden}
					<Eye class="size-3.5" />
				{:else}
					<EyeOff class="size-3.5" />
				{/if}
			</button>
		</div>
	</header>
	{#if !hidden}
		<!-- the body fills the card's remaining height; content that
		     outgrows the span scrolls INSIDE (the fixed-row model) -->
		<div class="min-h-0 min-w-0 flex-1 overflow-y-auto">{@render children()}</div>
	{/if}
	{#if !hidden}
		<!-- the resize zones (the Grafana custom-grid feel): the right
		     edge = width only, the bottom edge = height only, the corner =
		     both (last in DOM so it wins the overlap). Drag-immune — see
		     the gesture-split note; touch-none keeps a touch drag from
		     scrolling the page instead. -->
		<div
			class="absolute top-4 -right-1 bottom-4 z-10 w-2 cursor-ew-resize touch-none"
			draggable="false"
			role="separator"
			aria-label="Resize {def.title} width — drag, or Shift+Alt+arrows"
			onpointerdown={(e) => resizeStart(e, 'e')}
			onpointermove={resizeMove}
			onpointerup={resizeEnd}
			onpointercancel={resizeEnd}
			ondragstart={killDrag}
		></div>
		<div
			class="absolute right-4 -bottom-1 left-4 z-10 h-2 cursor-ns-resize touch-none"
			draggable="false"
			role="separator"
			aria-label="Resize {def.title} height — drag, or Shift+Alt+arrows"
			onpointerdown={(e) => resizeStart(e, 's')}
			onpointermove={resizeMove}
			onpointerup={resizeEnd}
			onpointercancel={resizeEnd}
			ondragstart={killDrag}
		></div>
		<div
			class="absolute right-0 bottom-0 z-10 cursor-nwse-resize touch-none p-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 group-focus-visible:opacity-100"
			draggable="false"
			role="separator"
			aria-label="Resize {def.title} — drag the corner, or Shift+Alt+arrows"
			onpointerdown={(e) => resizeStart(e, 'corner')}
			onpointermove={resizeMove}
			onpointerup={resizeEnd}
			onpointercancel={resizeEnd}
			ondragstart={killDrag}
		>
			<GripHorizontal class="size-3 text-muted-foreground/60" aria-hidden="true" />
		</div>
	{/if}
</article>
