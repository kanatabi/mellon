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
 * TOUCH (owner ask 2026-11-09): HTML5 DnD never fires on touchscreens, so a
 * long-press (~380ms, slop 10px) on a pane LIFTS it into the same machine —
 * a slim bar follows the finger, the ghost previews slots, release drops.
 * A tap or a scroll gesture is not drag intent: movement past the slop
 * cancels the arm, and interactive children (inputs, buttons) never arm.
 *
 * Performance contract (owner: "smoother", 2026-11-09 round 2) — the hot path
 * is `dragover`/pointer-move, which fires 2–4× per 60 Hz frame on fast
 * input:
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

const LONG_PRESS_MS = 380;
const DRAG_SLOP = 10;
const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable], [role="button"]';

export const reorderable: Action<HTMLElement, { store: SectionSet }> = (node, params) => {
	const store = params.store;
	let dragId: string | null = null;
	let ghostHeight = 96;
	let lastBefore: string | null | undefined;

	// rAF coalescing: dragover only parks the latest Y; one tick processes it
	let pendingY: number | null = null;
	let raf = 0;

	// touch-drag state (the finger path — HTML5 DnD does not exist here)
	let pressTimer = 0;
	let armed: { el: HTMLElement; id: string; x: number; y: number } | null = null;
	let touchBar: HTMLElement | null = null; // the bar that follows the finger
	let fingerX = 0;
	let fingerY = 0;
	let loop = 0; // continuous rAF while a finger drags (bar + autoscroll)

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

	/** Slim captured bar — the drag visual for BOTH paths: the HTML5 drag
	 *  image and the finger follower. Off-screen-but-RENDERED is how the
	 *  browser captures a drag image; the touch path keeps it in view. */
	function buildBar(paneEl: HTMLElement): HTMLElement | null {
		const header = paneEl.querySelector('header');
		const label = header?.querySelector('p')?.textContent?.trim();
		if (!header || !label) return null;
		const box = document.createElement('div');
		box.setAttribute('aria-hidden', 'true');
		box.className =
			'fixed left-0 top-0 flex w-64 items-center rounded-lg border border-border bg-card px-4 py-2.5 shadow-lg';
		box.style.pointerEvents = 'none';
		const clone = header.cloneNode(true) as HTMLElement;
		clone.classList.remove('-mx-1');
		clone.querySelector('button')?.remove(); // the collapse chevron is dead weight mid-drag
		box.appendChild(clone);
		document.body.appendChild(box);
		return box;
	}

	/** Shared lift: size the ghost from the live layout, then close the gap. */
	function liftPane(el: HTMLElement) {
		const vis = allPanes().filter((p) => p.style.display !== 'none');
		const idx = vis.indexOf(el);
		const gap =
			idx >= 1 ? vis[1].getBoundingClientRect().top - vis[0].getBoundingClientRect().bottom : 12;
		ghostHeight = Math.round(el.getBoundingClientRect().height + gap);
		lastScrollTop = node.scrollTop;
		flip(() => {
			el.style.display = 'none'; // lift: the gap closes NOW, animated
		});
	}

	// ── mouse path: HTML5 DnD ───────────────────────────────────────────────
	function ondragstart(e: DragEvent) {
		const el = (e.target as HTMLElement).closest?.('[data-pane]') as HTMLElement | null;
		const id = el?.dataset.pane;
		if (!el || !id || id === store.pinned) return;
		dragId = id;
		e.dataTransfer?.setData('text/plain', id);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			const bar = buildBar(el);
			if (bar) {
				bar.style.top = '-1000px';
				e.dataTransfer.setDragImage(bar, 16, 16);
				setTimeout(() => bar.remove(), 0);
			}
		}
		liftPane(el);
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
	 *  last frame of intent, not the one before it. */
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

	// ── touch path: long-press lifts into the SAME machine ──────────────────
	const isTouch = (e: PointerEvent) => e.pointerType === 'touch' || e.pointerType === 'pen';

	function positionBar() {
		if (touchBar) {
			// the bar rides just above the fingertip, tilted like a lifted card
			touchBar.style.transform = `translate3d(${fingerX - 30}px, ${fingerY - 54}px, 0) rotate(-2deg)`;
		}
	}

	/** While a finger drags this runs every frame: the bar follows, the rail
	 *  edge-autoscrolls under a parked finger (the list is taller than a
	 *  phone), and the slot preview keeps up with the scrolling layout. */
	function touchTick() {
		loop = 0;
		if (!dragId || !touchBar) return;
		const r = node.getBoundingClientRect();
		const EDGE = 56;
		let v = 0;
		if (fingerY < r.top + EDGE) v = -Math.min(14, (r.top + EDGE - fingerY) / 3);
		else if (fingerY > r.bottom - EDGE) v = Math.min(14, (fingerY - (r.bottom - EDGE)) / 3);
		if (v) node.scrollTop += v; // the scroll listener marks the cache dirty
		positionBar();
		preview(hitTest(fingerY));
		loop = requestAnimationFrame(touchTick);
	}

	function onpointerdown(e: PointerEvent) {
		if (!isTouch(e) || dragId) return;
		const el = (e.target as HTMLElement).closest?.('[data-pane]') as HTMLElement | null;
		const id = el?.dataset.pane;
		if (!el || !id || id === store.pinned) return;
		if ((e.target as HTMLElement).closest?.(INTERACTIVE)) return; // typing & pasting win
		armed = { el, id, x: e.clientX, y: e.clientY };
		fingerX = e.clientX;
		fingerY = e.clientY;
		el.classList.add('pane-arming'); // no selection while the press decides
		// window.setTimeout: the DOM numeric handle (Node's timer types leak otherwise)
		pressTimer = window.setTimeout(() => {
			if (!armed || dragId) return;
			const { el: target, id: paneId } = armed;
			armed = null;
			target.classList.remove('pane-arming');
			dragId = paneId;
			liftPane(target);
			navigator.vibrate?.(8); // the lift acknowledgment (Android; iOS ignores)
			touchBar = buildBar(target);
			if (touchBar) {
				touchBar.setAttribute('data-pane-drag-bar', paneId);
				touchBar.style.willChange = 'transform';
				positionBar();
			}
			loop = requestAnimationFrame(touchTick);
		}, LONG_PRESS_MS);
		try {
			node.setPointerCapture(e.pointerId);
		} catch {
			/* synthetic events in tests have no live pointer */
		}
	}

	function onpointermove(e: PointerEvent) {
		if (!isTouch(e)) return;
		if (armed && Math.hypot(e.clientX - armed.x, e.clientY - armed.y) > DRAG_SLOP) {
			cancelArm(); // the finger is scrolling — not a drag intent
			return;
		}
		if (dragId && touchBar) {
			fingerX = e.clientX;
			fingerY = e.clientY;
		}
	}

	function endTouchDrag() {
		if (loop) {
			cancelAnimationFrame(loop);
			loop = 0;
		}
		touchBar?.remove();
		touchBar = null;
		settle();
	}

	function onpointerup(e: PointerEvent) {
		if (!isTouch(e)) return;
		if (dragId && touchBar) endTouchDrag();
		else cancelArm(); // a short tap never arms a drag
	}

	function cancelArm() {
		clearTimeout(pressTimer);
		if (armed) armed.el.classList.remove('pane-arming');
		armed = null;
	}

	// scrolling must not win against a committed drag — non-passive so this
	// is the one listener allowed to cancel the touch action mid-gesture
	function ontouchmove(e: TouchEvent) {
		if (dragId && touchBar) e.preventDefault();
	}
	function oncontextmenu(e: MouseEvent) {
		if (armed || (dragId && touchBar)) e.preventDefault();
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
	node.addEventListener('pointerdown', onpointerdown);
	node.addEventListener('pointermove', onpointermove);
	node.addEventListener('pointerup', onpointerup);
	node.addEventListener('pointercancel', onpointerup); // cancel = release where the ghost is
	node.addEventListener('touchmove', ontouchmove, { passive: false });
	node.addEventListener('contextmenu', oncontextmenu);

	return {
		destroy() {
			node.removeEventListener('dragstart', ondragstart);
			node.removeEventListener('dragover', ondragover);
			node.removeEventListener('drop', ondrop);
			node.removeEventListener('dragend', ondragend);
			node.removeEventListener('scroll', onscroll);
			node.removeEventListener('pointerdown', onpointerdown);
			node.removeEventListener('pointermove', onpointermove);
			node.removeEventListener('pointerup', onpointerup);
			node.removeEventListener('pointercancel', onpointerup);
			node.removeEventListener('touchmove', ontouchmove);
			node.removeEventListener('contextmenu', oncontextmenu);
			if (raf) cancelAnimationFrame(raf);
			if (loop) cancelAnimationFrame(loop);
			clearTimeout(pressTimer);
			touchBar?.remove();
			for (const a of live.values()) a.cancel();
			live.clear();
			placeholder.remove();
		}
	};
};
