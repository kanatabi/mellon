/**
 * preview-sync.ts — the editor ⇄ preview scroll sync (owner round
 * 2026-11-21). The mapping is SOURCE-LINE anchored, never percentage-based:
 * the pipeline stamps every top-level block with `data-source-lines`
 * (markdown-it's token.map), the editor builds a cumulative-height map from
 * those anchors, and each pane's scroll resolves the other pane's position
 * through it — with linear interpolation INSIDE a block's range (a 20-line
 * fence is one tall rendered block; per-line truth doesn't exist there).
 *
 * The DOM-reading half (buildLineMap) is deliberately thin; everything that
 * does math here is pure and offline-tested.
 */

export interface LineAnchor {
	/** 1-based inclusive source-line range (the pipeline's `data-source-lines`). */
	start: number;
	end: number;
	/** The block's pixel range INSIDE the preview's scroll space. */
	top: number;
	bottom: number;
}

export interface LineMap {
	anchors: LineAnchor[];
	/** The preview's full scrollable height (the clamp for out-of-range lines). */
	total: number;
}

/** Parse `data-source-lines` — "12-14". Returns null on anything malformed. */
export function parseSourceLines(value: string | null): { start: number; end: number } | null {
	if (!value) return null;
	const m = /^(\d+)-(\d+)$/.exec(value);
	if (!m) return null;
	const start = Number(m[1]);
	const end = Number(m[2]);
	return end >= start ? { start, end } : null;
}

/**
 * The scroll sync's two directions over one map:
 *  - `offsetForLine(map, line)`: editor viewport-top line → preview scrollTop.
 *  - `lineForOffset(map, offset)`: preview fold → the editor line to show.
 * Clamped at the map's edges; interpolated within a block's pixel range.
 */
export function offsetForLine(map: LineMap, line: number): number {
	if (map.anchors.length === 0) return 0;
	const first = map.anchors[0];
	const last = map.anchors[map.anchors.length - 1];
	if (line <= first.start) return 0;
	if (line >= last.end) return map.total;
	for (const a of map.anchors) {
		// the FLOAT line: the block's range = [start, end + 1) — the fraction
		// into the LAST line lives above `end` (the sub-line precision)
		if (line >= a.start && line < a.end + 1) {
			const span = a.end - a.start + 1;
			const into = (line - a.start) / span;
			return a.top + into * (a.bottom - a.top);
		}
	}
	// between anchors (the blank source lines — the seams): the LINEAR
	// BRIDGE from the previous block's bottom to the next block's top —
	// the frozen-then-snap at block boundaries was the sync-scroll's jank
	// (walked 2026-11-22). Same anchor control points, one piecewise map.
	const next = map.anchors.find((a) => a.start > line);
	if (!next) return map.total;
	const nextIdx = map.anchors.indexOf(next);
	const prev = nextIdx > 0 ? map.anchors[nextIdx - 1] : null;
	if (!prev) return next.top;
	// the seam's line domain = [prev.end + 1, next.start): the blocks own
	// [start, end + 1) — the blanks are the rest — and the px ramps
	// continuously (prev.bottom = the seam's start px, next.top = its end)
	const seamStart = prev.end + 1;
	const spanLines = next.start - seamStart;
	if (spanLines <= 0) return next.top;
	const into = (line - seamStart) / spanLines;
	return prev.bottom + into * (next.top - prev.bottom);
}

export function lineForOffset(map: LineMap, offset: number): number {
	if (map.anchors.length === 0) return 1;
	if (offset <= 0) return map.anchors[0].start;
	if (offset >= map.total) return map.anchors[map.anchors.length - 1].end;
	let lo = 0;
	let hi = map.anchors.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (map.anchors[mid].bottom <= offset) lo = mid + 1;
		else hi = mid;
	}
	const a = map.anchors[lo];
	if (offset < a.top) {
		// the seam BELOW the previous anchor: the bridge's INVERSE —
		// (prev.bottom → a.top) maps to (prev.end → a.start) linearly, so
		// the round-trip offset→line→offset is the identity
		const prev = map.anchors[lo - 1];
		if (!prev) return a.start;
		// the seam's inverse: [prev.bottom → a.top] maps to
		// [prev.end + 1 → a.start) — disjoint from the block's own domain
		const seamStart = prev.end + 1;
		const spanPx = a.top - prev.bottom;
		const into = spanPx > 0 ? (offset - prev.bottom) / spanPx : 1;
		return seamStart + into * (a.start - seamStart);
	}
	const span = a.bottom - a.top;
	const into = span > 0 ? (offset - a.top) / span : 0;
	// the FLOAT line — no floor: the sub-line fraction is what makes the
	// editor's follow pixel-continuous (the integer = the line-grid quanta
	// = the jagged chase, walked 2026-11-22); the clamp = the NEXT line
	// boundary (the block's bottom px = the next block's top = honest)
	return Math.min(a.end + 1, a.start + into * (a.end - a.start + 1));
}

/**
 * The thin DOM half: read every `data-source-lines` block in the rendered
 * preview into a LineMap. Offsets are measured against the CONTAINER's
 * scroll space (rect deltas + its current scrollTop — stable under scroll).
 * A hidden mermaid fence (`pre.mermaid-src[hidden]`) donates its hydrated
 * `.mermaid-box` sibling's geometry — the SVG's box IS that source's block.
 */
export function buildLineMap(container: HTMLElement): LineMap {
	const containerTop = container.getBoundingClientRect().top;
	const anchors: LineAnchor[] = [];
	for (const el of container.querySelectorAll<HTMLElement>('[data-source-lines]')) {
		// the hydrated mermaid box replaces the (hidden) source pre — its
		// sibling donates the geometry; same for the error box
		const donor =
			el instanceof HTMLPreElement && el.hidden
				? (el.nextElementSibling as HTMLElement | null)
				: el;
		const target = donor ?? el;
		if (!target.isConnected) continue;
		const parsed = parseSourceLines(el.getAttribute('data-source-lines'));
		if (!parsed) continue;
		const rect = target.getBoundingClientRect();
		if (rect.height === 0 && rect.top === 0) continue;
		const top = Math.max(0, rect.top - containerTop + container.scrollTop);
		anchors.push({ start: parsed.start, end: parsed.end, top, bottom: top + rect.height });
	}
	return { anchors, total: container.scrollHeight };
}
