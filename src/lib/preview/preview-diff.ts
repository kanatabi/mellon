/**
 * preview-diff.ts — the DOM-level patcher for the editor's live preview
 * (the incremental-render round, owner plan 2026-11-22).
 *
 * THE MODEL: render-everything, patch-the-diff. The pipeline always renders
 * the WHOLE document (the correctness is preserved by construction —
 * footnotes, link refs, spanning containers never learn about the diff);
 * only the DOM APPLICATION is incremental. The naive innerHTML swap made
 * the browser re-parse the entire preview per keystroke — the long-doc
 * tail. Here the browser re-parses the ONE block that changed.
 *
 * THE KEY = the rendered CONTENT (the outerHTML), not the source range:
 * an edit shifts every block below it, so the range keys would mass-mismatch.
 * The content key is edit-stable — the same text renders the same block.
 *
 * THE MERMAID UNITS: a hydrated fence = `pre.mermaid-src[hidden]` + its
 * insertion sibling (`.mermaid-box` / `.mermaid-error`, `dataset.mmd`) —
 * the SVG box is expensive state. The unit's key = the fence SOURCE (the
 * hidden attr would masquerade as a change), and a matched unit is kept
 * VERBATIM — pre and box — so hydration survives every keystroke that
 * doesn't touch that diagram.
 *
 * THE WALK: markdown renders in source order on both sides (no reorders
 * exist), so a two-pointer unit walk settles the container left to right —
 * matched units stay (or get replaced in place), unmatched new units insert
 * at the frontier (the old cursor's node), the stale and trailing old units
 * remove. Exact for every edit shape: in-place, insert, delete, replace.
 */

interface Unit {
	/** The unit's own element (the mermaid pre, or the block itself). */
	node: Element;
	/** The hydration sibling, owned by this unit (the mermaid box only). */
	extra: Element | null;
	/** Edit-stable identity: the content, or the mermaid's source key. */
	key: string;
	/** True when the unit may be kept verbatim despite hydration mutations. */
	mermaid: boolean;
}

/** The mermaid box detection — `boxAfter`'s contract in mermaid-preview.ts. */
function isMermaidBox(el: Element): boolean {
	const h = el as HTMLElement;
	return h.dataset?.mmd === 'done' || h.dataset?.mmd === 'error';
}

/** The unit's edit-stable key. The mermaid's hidden attr and the box lie
 *  about changes — the fence SOURCE is the honest identity. */
function unitKey(node: Element, mermaid: boolean): string {
	if (mermaid) return 'mmd:' + node.textContent;
	return node.outerHTML;
}

/** The units of a node list: the (node, box) pairs grouped, in order. */
function unitsOf(parent: ParentNode): Unit[] {
	const units: Unit[] = [];
	for (let i = 0; i < parent.children.length;) {
		const node = parent.children[i];
		const mermaid = node.classList.contains('mermaid-src');
		const next = node.nextElementSibling;
		const extra = mermaid && next && isMermaidBox(next) ? next : null;
		units.push({ node, extra, key: unitKey(node, mermaid), mermaid });
		i += extra ? 2 : 1;
	}
	return units;
}

/**
 * Patch `container` (the preview's `.prose` div) to match `html`, touching
 * only the changed units. Returns whether anything moved.
 */
export function patchPreview(container: HTMLElement, html: string): boolean {
	const oldList = unitsOf(container);
	const newList = unitsOf(new DOMParser().parseFromString(html, 'text/html').body);

	// index the old units by key — duplicate keys (the same fence content
	// twice) queue, matched in order
	const oldByKey = new Map<string, Unit[]>();
	for (const u of oldList) {
		const q = oldByKey.get(u.key);
		if (q) q.push(u);
		else oldByKey.set(u.key, [u]);
	}

	const removeUnit = (u: Unit) => {
		u.extra?.remove();
		u.node.remove();
	};
	let changed = false;
	let j = 0; // the old cursor: everything before it is settled
	for (const nu of newList) {
		const queue = oldByKey.get(nu.key);
		const match = queue && queue.length > 0 ? queue.shift() : null;
		if (match) {
			// the stale units before the match: no later new unit can claim
			// them (the keys render in source order) — remove
			while (j < oldList.length && oldList[j] !== match) {
				removeUnit(oldList[j]);
				changed = true;
				j++;
			}
			j++; // the match consumed
			if (nu.mermaid) continue; // the hydrated pair survives verbatim
			if (match.node.outerHTML !== nu.node.outerHTML) {
				match.node.replaceWith(nu.node);
				changed = true;
			}
		} else {
			// the brand-new unit: insert at the frontier (before the first
			// unsettled old node; append once the old list is exhausted)
			const frontier = j < oldList.length ? oldList[j].node : null;
			if (frontier) frontier.before(nu.node);
			else container.append(nu.node);
			changed = true;
		}
	}
	// the tail: every unconsumed old unit is removed
	for (; j < oldList.length; j++) {
		removeUnit(oldList[j]);
		changed = true;
	}
	return changed;
}
