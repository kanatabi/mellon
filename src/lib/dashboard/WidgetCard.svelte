<script lang="ts">
	import { GripVertical, Eye, EyeOff, GripHorizontal } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import { GRID_GAP_PX } from './layout.ts';
	import type { WidgetDef } from './widgets/registry.ts';

	/**
	 * The widget card — the shared SHELL of the dashboard home: title,
	 * drag handle (the grid-reorder action reads it), pin/unpin, and the
	 * RESIZE grip (bottom-right corner: pointer-captured edge-drag whose
	 * pixel deltas the GRID converts to span changes — Round B). Knows
	 * nothing about widget content — bodies are self-contained components.
	 * Keyboard parity (doctrine #4): Alt+arrows move (the grid wires it);
	 * Shift+Alt+arrows resize.
	 */
	interface Props {
		def: WidgetDef;
		hidden: boolean;
		colSpan: number;
		rowSpan: number;
		onToggleHidden: () => void;
		/** Span deltas from a grip drag or Shift+Alt+arrows: the grid clamps
		 *  and applies them live (no persist) — the release persists once. */
		onResize: (colDelta: number, rowDelta: number) => void;
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
		onSpanCommit,
		onMove,
		onResize,
		children
	}: Props = $props();

	// the resize machine: pointer-captured corner-drag. The card holds the
	// START geometry and emits PIXEL-DELTA-derived span deltas; the grid
	// owns the clamping (minSpan) and the persistence (release only).
	let resizing = $state(false);
	let start = $state({ x: 0, y: 0, colSpan: 0, rowSpan: 0, colW: 0 });

	function resizeStart(e: PointerEvent) {
		const el = (e.currentTarget as HTMLElement).closest('[data-widget-card]') as HTMLElement;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		resizing = true;
		start = {
			x: e.clientX,
			y: e.clientY,
			colSpan,
			rowSpan,
			colW: (rect.width + GRID_GAP_PX) / colSpan
		};
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			/* capture is polish — the grip's own listeners keep the drag alive */
		}
	}

	function resizeMove(e: PointerEvent) {
		if (!resizing) return;
		const colDelta = Math.round((e.clientX - start.x) / (start.colW + GRID_GAP_PX));
		const rowDelta = Math.round((e.clientY - start.y) / (88 + GRID_GAP_PX));
		if (colDelta === 0 && rowDelta === 0) return;
		onResize(colDelta, rowDelta);
	}

	function resizeEnd() {
		if (!resizing) return;
		resizing = false;
		onSpanCommit(); // the store persists on release, never per move
	}

	function keydown(e: KeyboardEvent) {
		// Shift+Alt+arrows = resize (the grid clamps); Alt+arrows = move
		if (e.shiftKey && e.altKey) {
			const col = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
			const row = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
			if (col !== 0 || row !== 0) {
				e.preventDefault();
				onResize(col, row);
			}
			return;
		}
		if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
			e.preventDefault();
			onMove(e.key === 'ArrowUp' ? -1 : 1);
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<article
	data-widget-card
	draggable="true"
	tabindex="0"
	onkeydown={keydown}
	class="group relative flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-3 outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
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
		<!-- the resize grip: the corner — pointer-captured, snapped to
		     spans by the grid's handlers; visible on card hover/focus -->
		<div
			class="absolute right-0 bottom-0 cursor-nwse-resize p-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 group-focus-visible:opacity-100"
			role="separator"
			aria-label="Resize {def.title} — drag, or Shift+Alt+arrows"
			onpointerdown={resizeStart}
			onpointermove={resizeMove}
			onpointerup={resizeEnd}
			onpointercancel={resizeEnd}
		>
			<GripHorizontal class="size-3 text-muted-foreground/60" aria-hidden="true" />
		</div>
	{/if}
</article>
