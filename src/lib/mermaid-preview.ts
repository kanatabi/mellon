import { browser } from '$app/env';

/**
 * Live mermaid for the editor preview — settle-then-render, NO pending state.
 *
 * While typing, the escaped fence source stays visible as the dashed
 * `.mermaid-src` block the server pipeline emits (earendil's Route B ground
 * truth — and, unlike a JS-constructed shimmer, it can never get stuck: it is
 * the SSR default, not a state some promise must clean up). Once the
 * keystroke burst settles, `renderMermaid` attempts each fence:
 *
 *     success → the SVG diagram replaces the source (source stays in the DOM,
 *               hidden, as ground truth);
 *     failure → a quiet dashed error panel, source preserved in a <details>.
 *
 * Bomb discipline (the earlier "Syntax error in text" graphics): mermaid's
 * `render()` RESOLVES with its legacy error SVG instead of rejecting, so we
 * gate with `parse(suppressErrors)` first, capture parser messages through our
 * own `parseError` hook (mermaid's own renderer is never consulted), and
 * content-check the resolved svg as a last belt.
 *
 * History (2026-11-08, two owner rounds): the shimmer experiment is REMOVED.
 * A pending box created by JS can only be un-created by JS — when the dynamic
 * mermaid import failed, every fence shimmered forever. Never let an
 * intermediate UI state depend on the very async chain that produces the end
 * state.
 */

let mermaidMod: Promise<typeof import('mermaid').default> | null = null;
let uid = 0;
let lastParseError = '';

function ensureMermaid() {
	if (!mermaidMod) {
		mermaidMod = import('mermaid').then((m) => {
			const mermaid = m.default;
			mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
			mermaid.parseError = (err) => {
				lastParseError = err instanceof Error ? err.message : String(err ?? 'parse error');
			};
			return mermaid;
		});
		mermaidMod.catch(() => {
			mermaidMod = null; // allow a retry after e.g. a Vite dep re-optimize
		});
	}
	return mermaidMod;
}

function boxAfter(pre: HTMLElement): HTMLElement | null {
	const next = pre.nextElementSibling as HTMLElement | null;
	return next?.dataset.mmd === 'done' || next?.dataset.mmd === 'error' ? next : null;
}

/** Attempt every fence in `container`; `force` re-renders settled ones (theme flip). */
export async function renderMermaid(container: HTMLElement, force = false): Promise<void> {
	if (!browser) return;
	const pres = Array.from(container.querySelectorAll<HTMLElement>('pre.mermaid-src'));
	if (pres.length === 0) return;

	let mermaid: Awaited<ReturnType<typeof ensureMermaid>>;
	try {
		mermaid = await ensureMermaid();
	} catch (e) {
		// The whole point of removing pending boxes: this failure now degrades
		// to "source stays visible" — honest, un-stuck, one console line.
		console.warn('mermaid failed to load; fences remain as source', e);
		return;
	}
	const dark = document.documentElement.dataset.theme === 'dark';
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: 'strict',
		theme: dark ? 'dark' : 'default'
	});

	for (const pre of pres) {
		const src = pre.textContent ?? '';
		if (!src.trim()) continue;
		const existing = boxAfter(pre);
		if (existing && !force) continue; // this swap already settled
		if (existing) {
			existing.remove();
			pre.hidden = false;
		}
		lastParseError = '';
		try {
			if (!(await mermaid.parse(src, { suppressErrors: true }))) {
				showMermaidError(pre, src, firstLine(lastParseError) || 'invalid diagram');
				continue;
			}
			const { svg } = await mermaid.render(`mellon-mmd-${uid++}`, src);
			if (/Syntax error in text|mermaidError/i.test(svg)) {
				showMermaidError(pre, src, firstLine(lastParseError) || 'render refused');
				continue;
			}
			const figure = document.createElement('div');
			figure.dataset.mmd = 'done';
			figure.className = 'mermaid-box';
			figure.innerHTML = svg; // mermaid's own output; strict securityLevel
			pre.after(figure);
			pre.hidden = true;
		} catch (e) {
			showMermaidError(pre, src, firstLine(e instanceof Error ? e.message : 'error'));
		}
	}
}

function firstLine(msg: string): string {
	return (
		msg
			.replace(/^Error: /, '')
			.split('\n')
			.filter(Boolean)[0] ?? ''
	);
}

/** The graceful failure surface: dashed panel, one parser line, source kept. */
function showMermaidError(pre: HTMLElement, src: string, detail: string) {
	const box = document.createElement('div');
	box.dataset.mmd = 'error';
	box.className = 'mermaid-error';
	const head = document.createElement('p');
	head.textContent = 'cannot draw this diagram';
	const why = document.createElement('p');
	why.className = 'mermaid-error-detail';
	why.textContent = detail.slice(0, 180);
	const det = document.createElement('details');
	const sum = document.createElement('summary');
	sum.textContent = 'show source';
	const keep = document.createElement('pre');
	keep.textContent = src; // source survives, honest and inspectable
	det.append(sum, keep);
	box.append(head, why, det);
	pre.after(box);
	pre.hidden = true;
}
