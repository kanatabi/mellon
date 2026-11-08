import { browser } from '$app/env';

/**
 * Live mermaid for the editor preview — the earendil flicker contract, typed
 * into a loop (DESIGN §7 carries the same shape): the escaped fence source
 * stays the DOM ground truth, and the VISIBLE state cycles
 *
 *     typing  →  `mermaid-pending`  (pure-CSS shimmer)
 *     settled →  `mermaid-box` (SVG)   |   `mermaid-error` (dashed box)
 *
 * `markMermaidPending` runs on EVERY preview swap (so mid-block typing always
 * shows the shimmer), and `renderMermaid` fires only once the keystroke burst
 * has settled — a half-typed diagram is never an "error", just still-pending.
 */

let mermaidMod: Promise<typeof import('mermaid').default> | null = null;
let uid = 0;

function ensureMermaid() {
	if (!mermaidMod) {
		mermaidMod = import('mermaid').then((m) => {
			m.default.initialize({ startOnLoad: false, securityLevel: 'strict' });
			// Silence mermaid's legacy error renderer entirely — the "Syntax
			// error in text" bomb SVG is NOT a rejection from render(); it is
			// a RESOLVED svg. Without this hook mermaid paints it into the DOM
			// (owner report 2026-11-08). We own the error surface now.
			m.default.parseError = () => {
				throw new Error('parse-error');
			};
			return m.default;
		});
	}
	return mermaidMod;
}

function boxAfter(pre: HTMLElement): HTMLElement | null {
	const next = pre.nextElementSibling as HTMLElement | null;
	return next && next.dataset.mmd ? next : null;
}

/** Immediate pass: every source fence becomes (or stays) a shimmer box. */
export function markMermaidPending(container: HTMLElement): void {
	if (!browser) return;
	for (const pre of Array.from(container.querySelectorAll<HTMLElement>('pre.mermaid-src'))) {
		const src = pre.textContent ?? '';
		if (!src.trim()) continue;
		const box = boxAfter(pre);
		if (box?.dataset.mmd === 'pending') continue; // already shimmering this swap
		box?.remove();
		const pending = document.createElement('div');
		pending.dataset.mmd = 'pending';
		pending.className = 'mermaid-pending';
		pending.setAttribute('role', 'progressbar');
		pending.setAttribute('aria-label', 'Rendering diagram');
		pre.after(pending);
		pre.hidden = true;
	}
}

/** Settle pass: turn each pending box into a diagram — or an honest error box. */
export async function renderMermaid(container: HTMLElement): Promise<void> {
	if (!browser) return;
	const pres = Array.from(container.querySelectorAll<HTMLElement>('pre.mermaid-src'));
	if (pres.length === 0) return;
	const mermaid = await ensureMermaid();
	const dark = document.documentElement.dataset.theme === 'dark';
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: 'strict',
		theme: dark ? 'dark' : 'default'
	});

	for (const pre of pres) {
		const src = pre.textContent ?? '';
		if (!src.trim()) continue;
		let box = boxAfter(pre);
		if (!box) {
			box = document.createElement('div');
			box.dataset.mmd = 'pending';
			box.className = 'mermaid-pending';
			pre.after(box);
			pre.hidden = true;
		}
		if (box.dataset.mmd !== 'pending') continue; // this fence already settled
		try {
			// Parse-first (suppressErrors: nothing painted on failure). Invalid
			// sources never reach render() — and even if mermaid's own error
			// path slipped through, the svg-content guard below catches it.
			if (!(await mermaid.parse(src, { suppressErrors: true }))) await mermaid.parse(src); // re-run for the thrown message
			const { svg } = await mermaid.render(`mellon-mmd-${uid++}`, src);
			if (/Syntax error in text|mermaidError/i.test(svg)) throw new Error('render refused');
			box.removeAttribute('role');
			box.removeAttribute('aria-label');
			box.className = 'mermaid-box';
			box.dataset.mmd = 'done';
			box.innerHTML = svg; // mermaid's own output; strict securityLevel
		} catch (e) {
			showMermaidError(box, src, e);
		}
	}
}

/** The graceful failure surface: dashed panel, one parser line, source kept. */
function showMermaidError(box: HTMLElement, src: string, e: unknown) {
	box.removeAttribute('role');
	box.removeAttribute('aria-label');
	box.className = 'mermaid-error';
	box.dataset.mmd = 'error';
	box.textContent = '';
	const head = document.createElement('p');
	head.textContent = 'cannot draw this diagram';
	const why = document.createElement('p');
	why.className = 'mermaid-error-detail';
	const msg =
		e instanceof Error
			? (e.message
					.replace(/^Error: /, '')
					.split('\n')
					.filter(Boolean)[0] ?? '')
			: 'parse error';
	why.textContent = msg.slice(0, 180);
	const det = document.createElement('details');
	const sum = document.createElement('summary');
	sum.textContent = 'show source';
	const keep = document.createElement('pre');
	keep.textContent = src; // source survives, honest and inspectable
	det.append(sum, keep);
	box.append(head, why, det);
}
