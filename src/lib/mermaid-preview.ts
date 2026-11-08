import { browser } from '$app/env';

/**
 * Live mermaid for the editor preview — settle-then-render, no pending state.
 *
 * While typing, the escaped fence source stays visible as the dashed
 * `.mermaid-src` block the server pipeline emits (earendil's Route B ground
 * truth). Once the keystroke burst settles, `renderMermaid` attempts each
 * fence: success swaps in the diagram, failure shows a quiet error panel with
 * the source in a `<details>`. There is deliberately NO shimmer/pending box:
 * an intermediate DOM state that only a promise chain can leave is exactly
 * what stuck shimmering forever when mermaid's dynamic import failed (owner
 * report 2026-11-08 — "remove the shimmering feature"). Worst case here is
 * simply "still showing source", which is never a lie and never a trap.
 *
 * Bomb discipline (root cause of the earlier "Syntax error in text" graphics):
 * mermaid's `render()` RESOLVES with its legacy error SVG instead of rejecting.
 * We gate with `parse(suppressErrors)` first, capture parser messages through
 * our own `parseError` hook (never mermaid's renderer), and content-check the
 * resolved svg as a last guard.
 */

let mermaidMod: Promise<typeof import('mermaid').default> | null = null;
let uid = 0;
/** Parser's own words, captured through our hook (mermaid never paints). */
let lastParseError = '';
let importWarned = false;

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
	}
	return mermaidMod;
}

function boxAfter(pre: HTMLElement): HTMLElement | null {
	const next = pre.nextElementSibling as HTMLElement | null;
	return next && next.dataset.mmd ? next : null;
}

/**
 * Attempt every fence in `container` that has not already settled this swap.
 * `force` (theme flip) re-renders from the surviving sources.
 */
export async function renderMermaid(container: HTMLElement, force = false): Promise<void> {
	if (!browser) return;
	const pres = Array.from(container.querySelectorAll<HTMLElement>('pre.mermaid-src'));
	if (pres.length === 0) return;

	let mermaid: Awaited<ReturnType<typeof ensureMermaid>>;
	try {
		mermaid = await ensureMermaid();
	} catch {
		// Mermaid failed to load: the dashed source stays. Say it ONCE.
		if (!importWarned) {
			importWarned = true;
			console.warn('mermaid failed to load — diagrams stay as source until a reload');
		}
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
		const box = boxAfter(pre);
		if (box && !force) continue; // this fence already settled this swap
		if (box) {
			box.remove(); // force: discard the old diagram, re-render from source
			pre.hidden = false;
		}
		lastParseError = '';
		if (!(await mermaid.parse(src, { suppressErrors: true }))) {
			// Pull the parser's words deliberately: the suppressed path may
			// return false without invoking our hook. Either a throw or a hook
			// call lands the message; both are guarded.
			try {
				await mermaid.parse(src);
			} catch (e) {
				lastParseError ||= e instanceof Error ? e.message : String(e);
			}
			showMermaidError(pre, src, firstLine(lastParseError));
			continue;
		}
		try {
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
			showMermaidError(pre, src, firstLine(e instanceof Error ? e.message : ''));
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
