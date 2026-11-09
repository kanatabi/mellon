/**
 * Rail-level drag-to-reorder with real motion (owner spec 2026-11-09):
 *  ① lift: the dragged pane leaves the flow and its gap CLOSES immediately
 *     (neighbors glide up via FLIP — no snap);
 *  ② hover: a ghost placeholder opens space at the would-be landing slot,
 *     animated live as the pointer moves — the list makes room BEFORE the drop;
 *  ③ drop: the store order lands where the ghost already is — seamless.
 * The pinned pane is never an insertion point: no landing slot can exist
 * before it, so no animation ever suggests one.
 */
import type { Action } from 'svelte/action';
import type { SectionSet } from './sections.svelte.ts';

export const reorderable: Action<HTMLElement, { store: SectionSet }> = (node, params) => {
	const store = params.store;
	let dragId: string | null = null;
	let ghostHeight = 96;
	let lastBefore: string | null | undefined;

	const placeholder = document.createElement('div');
	placeholder.setAttribute('data-pane-ghost', '');
	placeholder.className = 'hidden rounded-lg border-2 border-dashed border-brand/40 bg-brand/5';
	node.appendChild(placeholder);

	const allPanes = () => [...node.querySelectorAll<HTMLElement>('[data-pane]')];
	const visiblePanes = () => allPanes().filter((el) => el.dataset.pane !== dragId);

	function flip(mutate: () => void) {
		const els = [...visiblePanes(), ...(placeholder.hidden ? [] : [placeholder])];
		const before = els.map((el) => el.getBoundingClientRect());
		mutate();
		const after = els.map((el) => el.getBoundingClientRect());
		els.forEach((el, i) => {
			const dy = before[i].top - after[i].top;
			if (Math.abs(dy) > 0.5) {
				el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
					duration: 160,
					easing: 'ease-out'
				});
			}
		});
	}

	function insertionBefore(clientY: number): string | null {
		for (const el of visiblePanes()) {
			if (el.dataset.pane === store.pinned) continue; // the pin has no landing line
			const r = el.getBoundingClientRect();
			if (clientY < r.top + r.height / 2) return el.dataset.pane ?? null;
		}
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
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		flip(() => {
			el.style.display = 'none'; // lift: the gap closes NOW, animated
		});
	}

	function ondragover(e: DragEvent) {
		if (!dragId) return;
		e.preventDefault();
		preview(insertionBefore(e.clientY));
	}

	function settle() {
		const id = dragId;
		const before = lastBefore;
		dragId = null;
		lastBefore = undefined;
		flip(() => {
			placeholder.classList.add('hidden');
			placeholder.style.order = '';
			allPanes().forEach((el) => {
				el.style.display = '';
				el.style.order = ''; // hand control back to the store-driven attr
			});
			if (id && before !== undefined) store.place(id, before);
		});
	}

	function ondrop(e: DragEvent) {
		if (!dragId) return;
		e.preventDefault();
		settle();
	}

	node.addEventListener('dragstart', ondragstart);
	node.addEventListener('dragover', ondragover);
	node.addEventListener('drop', ondrop);
	node.addEventListener('dragend', () => dragId && settle());

	return {
		destroy() {
			node.removeEventListener('dragstart', ondragstart);
			node.removeEventListener('dragover', ondragover);
			node.removeEventListener('drop', ondrop);
			node.removeEventListener('dragend', () => dragId && settle());
			placeholder.remove();
		}
	};
};
