import { browser } from '$app/env';

/**
 * Client-side mermaid render for the editor's live preview.
 *
 * The server pipeline emits ```mermaid fences as `pre.mermaid-src` (source
 * revealed, sanitized, SSR-safe). Here the fenced source is rendered to SVG
 * after hydration — the owner call 2026-11-08 reversed the earlier
 * source-reveal deviation: authors see diagrams, like the public site. The
 * escaped source STAYS in the DOM as ground truth (hidden once a render
 * succeeds; revealed again on parse error) — earendil's Route B invariant.
 *
 * Theme parity: initialized from the current data-theme, and callers re-run
 * us on theme flip (the preview container re-renders from the kept sources).
 */

let mermaidMod: Promise<typeof import('mermaid').default> | null = null;
let uid = 0;
// source remembered per element: re-rendering identical diagrams is wasted work
const lastRendered = new WeakMap<HTMLElement, string>();

function ensureMermaid() {
	if (!mermaidMod) {
		mermaidMod = import('mermaid').then((m) => {
			const mermaid = m.default;
			mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
			return mermaid;
		});
	}
	return mermaidMod;
}

/** Render every not-yet-diagrammed `.mermaid-src` inside `container`. */
export async function renderMermaid(container: HTMLElement, force = false): Promise<void> {
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
		if (!force && lastRendered.get(pre) === src && pre.hidden) continue; // current
		lastRendered.set(pre, src);
		const existing = pre.nextElementSibling as HTMLElement | null;
		try {
			const { svg } = await mermaid.render(`mellon-mmd-${uid++}`, src);
			let box: HTMLElement;
			if (existing?.dataset.mmd === '1') {
				box = existing;
			} else {
				box = document.createElement('div');
				box.dataset.mmd = '1';
				box.className = 'mermaid-box';
				pre.after(box);
			}
			box.innerHTML = svg;
			pre.hidden = true;
		} catch {
			// parse error → the source stays visible (dashed), like the public site
			pre.hidden = false;
			pre.classList.add('mermaid-failed');
			if (existing?.dataset.mmd === '1') existing.remove();
		}
	}
}
