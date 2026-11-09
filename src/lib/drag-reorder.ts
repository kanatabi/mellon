/**
 * Rail-level drag-to-reorder with real motion (owner spec 2026-11-09):
 *  ① lift: the dragged pane leaves the flow and its gap CLOSES immediately
 *     (neighbors glide up via FLIP — no snap);
 *  ② hover: a ghost placeholder opens space at the would-be landing slot,
 *     animated live as the pointer moves — the list makes room BEFORE the drop;
 *  ③ drop: the store order lands where the ghost already is — seamless.
 * The pinned pane is never an insertion point: no landing slot can exist
 * before it, so no animation ever suggests one.
 *
 * Performance contract (owner: "smoother", 2026-11-09 round 2) — the hot path
 * is `dragover`, which fires 2–4× per 60 Hz frame with a fast mouse:
 *  • events are rAF-COALESCED: measurement/layout work runs at most once
 *    per frame, aligned with the paint boundary;
 *  • pane slot mid-points are CACHED and hit-tested as plain numbers —
 *    re-measured only when the layout can have changed (a FLIP mutation,
 *    the rail scrolling, or in-flight animations still settling);
 *  • one live FLIP animation per element (retargeted, never stacked);
 *  • the drag image is a slim captured bar, not the browser's full-pane
 *    snapshot (a media pane with a big cover made that snapshot expensive).
 * Steady-state pointer movement should read ZERO getBoundingClientRect
 * calls — the console harness guards that invariant (T-perf).
 */
import type { Action } from 'svelte/action';
import type { SectionSet } from './sections.svelte.ts';

export const reorderable: Action<HTMLElement, { store: SectionSet }> = (node, params) => {
	const store = params.store;
	let dragId: string | null = null;
	let ghostHeight = 96;
	let lastBefore: string | null | undefined;

	// rAF coalescing: dragover only parks the latest Y; one tick processes it
	let pendingY: number | null = null;
	let raf = 0;

	// slot cache: viewport-relative mid-points, rebuilt only on real change
	type Slot = { id: string; mid: number };
	let slots: Slot[] = [];
	let slotsStale = true;
	let lastScrollTop = 0;
	let animUntil = 0; // FLIPs run 160ms — re-measure each frame until they end

	const live = new Map<Element, Animation>();

	const placeholder = document.createElement('div');
	placeholder.setAttribute('data-pane-ghost', '');
	placeholder.className = 'hidden rounded-lg border-2 border-dashed border-brand/40 bg-brand/5';
	node.appendChild(placeholder);

	const allPanes = () => [...node.querySelectorAll<HTMLElement>('[data-pane]')];
	const visiblePanes = () => allPanes().filter((el) => el.dataset.pane !== dragId);

	function animate(el: Element, dy: number) {
		live.get(el)?.cancel(); // retarget the live FLIP — never stack animations
		live.set(
			el,
			el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
				duration: 160,
				easing: 'ease-out'
			})
		);
	}

	function flip(mutate: () => void) {
		const shown = !placeholder.classList.contains('hidden'); // CLASS, not .hidden attr
		const els = [...visiblePanes(), ...(shown ? [placeholder] : [])];
		const before = els.map((el) => el.getBoundingClientRect());
		mutate();
		const after = els.map((el) => el.getBoundingClientRect());
		els.forEach((el, i) => {
			const dy = before[i].top - after[i].top;
			// skip degenerate measurements (display:none rects are all-zero —
			// animating those makes the ghost fly in from the page corner)
			if (Math.abs(dy) > 0.5 && before[i].height > 2 && after[i].height > 2) animate(el, dy);
		});
		slotsStale = true;
		animUntil = performance.now() + 200; // frames while neighbors are still gliding
	}

	/** Rebuild the hit-test cache. Rare by design: only after a change that
	 *  could have moved panes (lift/preview/drop/scroll/animation settling). */
	function measure(): Slot[] {
		lastScrollTop = node.scrollTop;
		slots = allPanes()
			.filter(
				(el) =>
					el.dataset.pane &&
					el.dataset.pane !== store.pinned && // the pin has no landing line
					el.dataset.pane !== dragId &&
					el.style.display !== 'none'
			)
			.map((el) => {
				const r = el.getBoundingClientRect();
				return { id: el.dataset.pane!, top: r.top, mid: r.top + r.height / 2 };
			})
			.sort((a, b) => a.top - b.top)
			.map(({ id, mid }) => ({ id, mid }));
		slotsStale = false;
		return slots;
	}

	/** Visual-order hit test on cached mid-points — zero DOM reads in steady
	 *  state. (Iterating DOM/markup order was the "cannot put MEDIA between
	 *  DATE and EXPORT" bug: CSS `order` arranges the visual stack.) */
	function hitTest(clientY: number): string | null {
		if (slotsStale || node.scrollTop !== lastScrollTop || performance.now() < animUntil) {
			measure();
		}
		for (const s of slots) if (clientY < s.mid) return s.id;
		return null;
	}

	function preview(beforeId: string | null) {
		if (beforeId === lastBefore) return;
		lastBefore = beforeId;
		const pinnedEl = store.pinned
			? allPanes().find((el) => el.dataset.pane === store.pinned)
			: undefined;
		const seq = visiblePanes()
			.filter((el) => el !== pinnedEl)
			.sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0));
		const display: (HTMLElement | typeof placeholder)[] = pinnedEl ? [pinnedEl] : [];
		let inserted = false;
		for (const el of seq) {
			if (!inserted && beforeId != null && el.dataset.pane === beforeId) {
				display.push(placeholder);
				inserted = true;
			}
			display.push(el);
		}
		if (!inserted) display.push(placeholder);
		flip(() => {
			placeholder.classList.remove('hidden');
			placeholder.style.height = `${ghostHeight}px`;
			display.forEach((el, i) => (el.style.order = String(i)));
		});
	}

	/** Slim captured bar instead of the browser's full-pane snapshot: cheap to
	 *  paint mid-drag and it matches the collapsed form of the same pane.
	 *  (Off-screen but RENDERED — that is how the drag image is captured.) */
	function makeDragImage(paneEl: HTMLElement): HTMLElement | null {
		const header = paneEl.querySelector('header');
		const label = header?.querySelector('p')?.textContent?.trim();
		if (!header || !label) return null;
		const box = document.createElement('div');
		box.setAttribute('aria-hidden', 'true');
		box.className =
			'fixed left-0 top-0 flex w-64 items-center rounded-lg border border-border bg-card px-4 py-2.5 shadow-lg';
		box.style.top = '-1000px';
		const clone = header.cloneNode(true) as HTMLElement;
		clone.classList.remove('-mx-1');
		clone.querySelector('button')?.remove(); // the collapse chevron is dead weight mid-drag
		box.appendChild(clone);
		document.body.appendChild(box);
		return box;
	}

	function ondragstart(e: DragEvent) {
		const el = (e.target as HTMLElement).closest?.('[data-pane]') as HTMLElement | null;
		const id = el?.dataset.pane;
		if (!el || !id || id === store.pinned) return;
		dragId = id;
		// ghost = the source's height plus one gap, measured while it is still in flow
		const vis = allPanes().filter((p) => p.style.display !== 'none');
		const idx = vis.indexOf(el);
		const gap =
			idx >= 1 ? vis[1].getBoundingClientRect().top - vis[0].getBoundingClientRect().bottom : 12;
		ghostHeight = Math.round(el.getBoundingClientRect().height + gap);
		e.dataTransfer?.setData('text/plain', id);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			const img = makeDragImage(el);
			if (img) {
				e.dataTransfer.setDragImage(img, 16, 16);
				setTimeout(() => img.remove(), 0);
			}
		}
		lastScrollTop = node.scrollTop;
		flip(() => {
			el.style.display = 'none'; // lift: the gap closes NOW, animated
		});
	}

	function ondragover(e: DragEvent) {
		if (!dragId) return;
		e.preventDefault(); // must stay synchronous — allow the drop
		pendingY = e.clientY;
		if (!raf) raf = requestAnimationFrame(process);
	}

	function process() {
		raf = 0;
		if (!dragId || pendingY == null) return;
		const y = pendingY;
		pendingY = null;
		preview(hitTest(y));
	}

	/** Apply any parked pointer move before landing — the drop must honor the
	 *  last frame of movement, not the one before it. */
	function flushPending() {
		if (raf) {
			cancelAnimationFrame(raf);
			raf = 0;
		}
		if (dragId && pendingY != null) {
			const y = pendingY;
			pendingY = null;
			preview(hitTest(y));
		}
	}

	function settle() {
		flushPending();
		const id = dragId;
		const before = lastBefore;
		dragId = null;
		lastBefore = undefined;
		if (id && before !== undefined) store.place(id, before);
		flip(() => {
			placeholder.classList.add('hidden');
			allPanes().forEach((el) => {
				el.style.display = '';
				// CRITICAL: restore the CANONICAL order, never blank it. Svelte
				// only re-writes a style attr whose value actually CHANGED —
				// blanking left untouched panes at order:0 (DOM order), which is
				// the "messy/random" corruption the owner saw.
				const pane = el.dataset.pane;
				el.style.order = String(pane ? store.pos(pane) : 0);
			});
		});
		live.clear();
		animUntil = 0;
	}

	function ondrop(e: DragEvent) {
		if (!dragId) return;
		e.preventDefault();
		settle();
	}

	function ondragend() {
		if (dragId) settle(); // cancelled drags restore the same animated way
	}

	// scrolling during a drag shifts every viewport-relative mid-point
	const onscroll = () => {
		slotsStale = true;
	};

	node.addEventListener('dragstart', ondragstart);
	node.addEventListener('dragover', ondragover);
	node.addEventListener('drop', ondrop);
	node.addEventListener('dragend', ondragend);
	node.addEventListener('scroll', onscroll, { passive: true });

	return {
		destroy() {
			node.removeEventListener('dragstart', ondragstart);
			node.removeEventListener('dragover', ondragover);
			node.removeEventListener('drop', ondrop);
			node.removeEventListener('dragend', ondragend);
			node.removeEventListener('scroll', onscroll);
			if (raf) cancelAnimationFrame(raf);
			for (const a of live.values()) a.cancel();
			live.clear();
			placeholder.remove();
		}
	};
};
