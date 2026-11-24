<script lang="ts">
	import { GripVertical, Eye, EyeOff, GripHorizontal } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import { GRID_COLS, GRID_GAP_PX, MAX_ROW_SPAN, ROW_UNIT_PX } from './layout.ts';
	import type { WidgetDef } from './widgets/registry.ts';

	/**
	 * The widget card — the shared SHELL of the dashboard home: title,
	 * pin/unpin, and the RESIZE machine (corner grip + right/bottom edge
	 * zones — the Grafana "custom grid" feel).
	 *
	 * THE RESIZE GESTURE: the card FLOATS pixel-continuously while
	 * dragging (inline size following the pointer), the grid holds the
	 * provisional span and renders the blue placeholder; the release
	 * applies + persists once. The float is clamped by the widget's
	 * minimum AND the canvas's true right edge — measured from the grid
	 * ancestor, never derived from constants (the breakpoint bug).
	 *
	 * THE KEYBOARD PARITY (doctrine #4): Alt+arrows nudge by whole cells
	 * (four directions; the engine resolves collisions), Shift+Alt+arrows
	 * resize — provisional then immediate commit (no release gesture).
	 */
	interface Props {
		def: WidgetDef;
		hidden: boolean;
		w: number;
		h: number;
		onToggleHidden: () => void;
		/** Absolute target w/h from a resize drag or Shift+Alt+arrows —
		 *  applied live (no persist); the release persists once. */
		onSpanTarget: (w: number, h: number) => void;
		/** The release: the grid persists the applied span. */
		onSpanCommit: () => void;
		/** Keyboard nudge by whole cells (four directions). */
		onNudge: (dx: number, dy: number) => void;
		/** Free drag (the header is the handle): the in-flight cell target
		 *  + the wrapper's pointer-follow pixel position. */
		onDragMove: (x: number, y: number, pxLeft: number, pxTop: number) => void;
		onDragEnd: (x: number, y: number) => void;
		onDragCancel: () => void;
		/** The body snippet — the widget's own component, rendered by the
		 *  page (which owns the registry lookup). */
		children: Snippet;
	}

	let {
		def,
		hidden,
		w,
		h,
		onToggleHidden,
		onSpanTarget,
		onSpanCommit,
		onNudge,
		onDragMove,
		onDragEnd,
		onDragCancel,
		children
	}: Props = $props();

	type ResizeMode = 'corner' | 'e' | 's';
	let resizing = $state(false);
	let mode: ResizeMode = $state('corner');
	let start = $state({
		x: 0,
		y: 0,
		w: 0,
		h: 0,
		colPitch: 0,
		rowPitch: 0,
		minW: 0,
		minH: 0,
		maxW: 0,
		maxH: 0
	});
	/** the pixel-continuous float size (null = no float, canvas-tracked). */
	let float = $state<{ w: number; h: number } | null>(null);

	function resizeStart(e: PointerEvent, m: ResizeMode) {
		const el = (e.currentTarget as HTMLElement).closest('[data-widget-card]') as HTMLElement;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const colPitch = (rect.width + GRID_GAP_PX) / w;
		const rowPitch = (rect.height + GRID_GAP_PX) / h;
		// the canvas's true right edge — the float's honest ceiling at
		// every breakpoint (GRID_COLS×pitch broke on the 24-col canvas)
		const canvas = el.closest('[data-dashboard-grid]') as HTMLElement | null;
		const canvasRight = canvas ? canvas.getBoundingClientRect().right : rect.right;
		mode = m;
		resizing = true;
		start = {
			x: e.clientX,
			y: e.clientY,
			w,
			h,
			colPitch,
			rowPitch,
			minW: Math.max(1, def.minSpan.col * colPitch - GRID_GAP_PX),
			minH: Math.max(1, def.minSpan.row * rowPitch - GRID_GAP_PX),
			maxW: Math.max(1, canvasRight - rect.left),
			maxH: Math.max(1, MAX_ROW_SPAN * rowPitch - GRID_GAP_PX)
		};
		// no compat mousedown → no native drag, no text selection
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
		const rowDelta = mode === 'e' ? 0 : Math.round(dy / start.rowPitch);
		// the FLOAT: pixel-continuous, clamped to the widget minimum AND
		// the canvas edge — the preview always matches what release keeps
		const fw = mode === 's' ? start.w : Math.min(start.maxW, Math.max(start.minW, start.w + dx));
		const fh = mode === 'e' ? start.h : Math.min(start.maxH, Math.max(start.minH, start.h + dy));
		if (colDelta === 0 && rowDelta === 0 && float?.w === fw && float.h === fh) return;
		float = { w: fw, h: fh };
		if (colDelta !== 0 || rowDelta !== 0) {
			onSpanTarget(
				Math.min(GRID_COLS, Math.max(def.minSpan.col, start.w + colDelta)),
				Math.min(MAX_ROW_SPAN, Math.max(def.minSpan.row, start.h + rowDelta))
			);
		}
	}

	function resizeEnd() {
		if (!resizing) return;
		resizing = false;
		float = null; // back to the canvas-tracked (snapped) size
		onSpanCommit(); // the grid applies the provisional span + persists
	}

	// ── the FREE DRAG machine (the header is the handle) ────────────────
	// Pointer-based (HTML5 DnD is retired — one gesture system, no native
	// drag hijacks). Arm on pointerdown; past a 4px threshold the widget
	// is DRAGGING: the cell target + the wrapper's pixel position emit
	// live (the grid follows the pointer, the store previews the resolved
	// shadow layout, nothing persists), and the release lands it. Escape
	// cancels. Interactive children (links, buttons) never arm.
	const DRAG_THRESHOLD_PX = 4;
	let armed = $state(false);
	let dragging = $state(false);
	let dragStart = $state({
		px: 0,
		py: 0,
		offCols: 0,
		offRows: 0,
		colW: 1,
		canvasLeft: 0,
		canvasTop: 0,
		w: 0
	});
	let dragCell = $state<{ x: number; y: number } | null>(null);

	function dragArm(e: PointerEvent) {
		if (resizing || (e.target as HTMLElement).closest('a,button')) return;
		const el = (e.currentTarget as HTMLElement).closest('[data-widget-card]') as HTMLElement;
		if (!el) return;
		const canvas = el.closest('[data-dashboard-grid]') as HTMLElement | null;
		if (!canvas) return;
		const canvasRect = canvas.getBoundingClientRect();
		const rect = el.getBoundingClientRect();
		// column pitch INCLUDES the gutter (the RGL margin rule — the cell
		// is (canvasWidth + gap) / 24), matching the entry styles (1px
		// floor keeps the math finite in non-rendered environments)
		const colW = Math.max(1, (canvasRect.width + GRID_GAP_PX) / GRID_COLS);
		armed = true;
		dragStart = {
			px: e.clientX,
			py: e.clientY,
			offCols: Math.round((e.clientX - rect.left) / colW),
			offRows: Math.round((e.clientY - rect.top) / (ROW_UNIT_PX + GRID_GAP_PX)),
			colW,
			canvasLeft: canvasRect.left,
			canvasTop: canvasRect.top,
			w
		};
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			/* capture is polish — the header's own listeners keep the drag alive */
		}
	}

	function dragSweep(e: PointerEvent) {
		if (!armed) return;
		const dx = e.clientX - dragStart.px;
		const dy = e.clientY - dragStart.py;
		if (!dragging && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) {
			return; // a click, not a drag
		}
		dragging = true;
		// the cell under the grab point, minus the grab offset, clamped to
		// the canvas (the engine clamps again — this shapes the preview)
		const col = (e.clientX - dragStart.canvasLeft) / dragStart.colW - dragStart.offCols;
		const row = Math.max(
			0,
			Math.round((e.clientY - dragStart.canvasTop) / (ROW_UNIT_PX + GRID_GAP_PX)) -
				dragStart.offRows
		);
		dragCell = { x: Math.max(0, Math.round(col)), y: row };
		// the wrapper follows the pointer (the grab point stays put)
		onDragMove(
			dragCell.x,
			dragCell.y,
			e.clientX - dragStart.canvasLeft - dragStart.offCols * dragStart.colW,
			e.clientY - dragStart.canvasTop - dragStart.offRows * (ROW_UNIT_PX + GRID_GAP_PX)
		);
	}

	function dragSettle(cancelled = false) {
		if (!armed) return;
		armed = false;
		const wasDragging = dragging;
		dragging = false;
		const cell = dragCell;
		dragCell = null;
		if (cancelled || !wasDragging || !cell) {
			if (wasDragging) onDragCancel();
			return;
		}
		onDragEnd(cell.x, cell.y);
	}

	function dragKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && dragging) {
			e.preventDefault();
			dragSettle(true);
		}
	}

	function keydown(e: KeyboardEvent) {
		dragKey(e); // Escape cancels an in-flight drag
		// Shift+Alt+arrows = resize (provisional + IMMEDIATE commit);
		// Alt+arrows = nudge by whole cells, four directions
		if (e.shiftKey && e.altKey) {
			const col = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
			const row = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
			if (col !== 0 || row !== 0) {
				e.preventDefault();
				onSpanTarget(
					Math.min(GRID_COLS, Math.max(def.minSpan.col, w + col)),
					Math.min(MAX_ROW_SPAN, Math.max(def.minSpan.row, h + row))
				);
				onSpanCommit();
			}
			return;
		}
		if (e.altKey) {
			const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
			const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
			if (dx !== 0 || dy !== 0) {
				e.preventDefault();
				onNudge(dx, dy);
			}
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
	tabindex="0"
	onkeydown={keydown}
	style={float ? `width: ${float.w}px; height: ${float.h}px; z-index: 30;` : undefined}
	class="group relative flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-brand/40 {resizing
		? 'ring-2 ring-brand/60'
		: ''}"
	aria-label="{def.title} widget — Alt+arrows to move, Shift+Alt+arrows to resize"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header
		data-drag-handle
		class="flex cursor-grab touch-none items-center justify-between gap-2 active:cursor-grabbing"
		onpointerdown={dragArm}
		onpointermove={dragSweep}
		onpointerup={() => dragSettle()}
		onpointercancel={() => dragSettle(true)}
	>
		<div class="flex min-w-0 items-center gap-1.5">
			<GripVertical
				class="size-3.5 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground"
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
		     both (last in DOM so it wins the overlap). touch-none keeps a
		     touch drag from scrolling the page instead. -->
		<div
			class="absolute top-4 -right-1 bottom-4 z-10 w-2 cursor-ew-resize touch-none"
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
