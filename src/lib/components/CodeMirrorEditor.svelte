<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/env';
	import { basicSetup } from 'codemirror';
	import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
	import { Compartment, EditorState } from '@codemirror/state';
	import { EditorView } from '@codemirror/view';
	// Community-maintained vim keymap (the npm reality: no @codemirror/vim
	// package exists — corrected against my earlier claim, journaled).
	// Aliased: the `vim` prop (user preference) would shadow the extension
	// factory otherwise — a collision eslint caught as "read-only" nonsense.
	import { getCM, vim as vimKeymap } from '@replit/codemirror-vim';

	interface Props {
		value: string;
		onchange: (v: string) => void;
		/** The USER preference (cookie). Effective mode ANDs it with the
		 *  viewport: modal editing is a desktop affordance — below `lg` the
		 *  editor always runs plain (owner call 2026-11-08). */
		vim: boolean;
		/** Line-wrap state, owned by the parent's toggle button. */
		wrap: boolean;
		/** Imperfect but honest handle: the parent's picker inserts markdown
		 *  at the live cursor; the transaction flows back through the normal
		 *  docChanged listener, so `value`/dirty/preview update for free. */
		onReady?: (api: { insertAtCursor: (text: string) => void }) => void;
		class?: string;
	}

	let { value = $bindable(), onchange, vim, wrap, onReady, class: cls = '' }: Props = $props();

	let host: HTMLDivElement | undefined = $state();
	let view: EditorView | undefined;
	const vimCompartment = new Compartment();
	const wrapCompartment = new Compartment();
	// deliberate one-time capture: the editor doc is seeded from `value` at
	// mount; later syncs run through the $effect pair below.
	let emitted = value;

	// Minimal reactive media query — svelte 5.57 ships no `mql` export yet.
	// Initial `false` keeps SSR and hydration in agreement; the listener syncs
	// post-mount and tracks viewport crossings (rotate a tablet).
	function media(query: string) {
		const state = $state({ matches: false });
		$effect(() => {
			if (!browser) return;
			const mq = window.matchMedia(query);
			const sync = (e: MediaQueryListEvent | MediaQueryList) => (state.matches = e.matches);
			sync(mq);
			mq.addEventListener('change', sync);
			return () => mq.removeEventListener('change', sync);
		});
		return state;
	}
	// Breakpoint twin of the CSS `lg` (1024px).
	const smallScreen = media('(max-width: 1023.98px)');
	// EFFECTIVE vim state — false until mount (SSR and hydration agree), then
	// preference ∧ viewport, re-evaluated when the setting flips OR the
	// viewport crosses lg (rotate a tablet and vim walks out by itself).
	let vimOn = $state(false);

	// ── Status bar state (instrument chrome, §11.1) ──────────────────────────
	// The mode truth lives on the CM5-adapter's vim state — `getCM(view)` is
	// the package's only public door. There is NO DOM event: @replit ships
	// `vim-mode-change` on a private emitter (its status-bar listener consumes
	// it internally), so an addEventListener never fires (owner report
	// 2026-11-08 — badge stuck at INSERT). Re-read it on every transaction:
	// mode changes always ride a state effect, so updates cover them all.
	let mode = $state('');
	let sub = $state('');
	let pos = $state({ line: 1, col: 1 });
	let words = $state(0);

	function readVimMode() {
		if (!view || !vimOn) {
			mode = '';
			sub = '';
			return;
		}
		const vimState = getCM(view)?.state?.vim as
			{ mode?: string; subMode?: string } | undefined | null;
		// The package creates state.vim LAZILY on the first handled key — until
		// then there is nothing to read, and the seed answer is NORMAL: vim
		// starts in normal mode, like the editor it is named after. (Guessing
		// INSERT here showed the wrong badge on every fresh reload — owner
		// report 2026-11-08.)
		mode = vimState?.mode ?? 'NORMAL';
		sub =
			vimState?.subMode === 'linewise' ? 'LINE' : vimState?.subMode === 'blockwise' ? 'BLOCK' : '';
	}

	function readStats(state: EditorState) {
		const head = state.selection.main.head;
		const line = state.doc.lineAt(head);
		pos = { line: line.number, col: head - line.from + 1 };
		const text = state.doc.toString().trim();
		words = text ? text.split(/\s+/).length : 0;
	}

	// Token-driven theme: every color reads a CSS var, so the data-theme flip
	// repaints the editor with zero reconfiguration (DESIGN §11.2/§3).
	const theme = EditorView.theme(
		{
			'&': {
				height: '100%',
				'font-size': '0.875rem',
				backgroundColor: 'transparent',
				color: 'var(--foreground)'
			},
			'&, &.cm-focused': { outline: 'none' },
			'.cm-content': { 'caret-color': 'var(--brand)', 'font-family': 'var(--font-mono)' },
			'.cm-cursor, .cm-dropCursor': { 'border-left-color': 'var(--brand)' },
			'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
				backgroundColor: 'color-mix(in oklab, var(--brand) 22%, transparent)'
			},
			'.cm-gutters': {
				backgroundColor: 'transparent',
				color: 'var(--muted-foreground)',
				border: 'none',
				'font-family': 'var(--font-mono)',
				'font-size': '0.75rem'
			},
			'.cm-activeLine': { backgroundColor: 'transparent' },
			'.cm-activeLineGutter': { backgroundColor: 'var(--muted)' }
		},
		{ dark: false } // all colors are vars; the flag only presets defaults
	);

	onMount(() => {
		if (!host) return;
		vimOn = vim && !smallScreen.matches;
		const state = EditorState.create({
			doc: value,
			extensions: [
				basicSetup,
				markdown({ base: markdownLanguage }),
				wrapCompartment.of(wrap ? [EditorView.lineWrapping] : []),
				theme,
				vimCompartment.of(vimOn ? [vimKeymap()] : []),
				EditorView.domEventHandlers({
					// belt for transitions that resolve outside a transaction: sample
					// right after vim's key handlers finish
					keyup: () => {
						queueMicrotask(readVimMode);
						return false;
					}
				}),
				EditorView.updateListener.of((u) => {
					if (u.docChanged) {
						emitted = u.state.doc.toString();
						// Assign the bindable prop ITSELF — writing only through
						// `onchange` left the parent's bind:value stale (typing never
						// reached draft.content, so the live preview never moved).
						value = emitted;
						onchange(emitted);
					}
					if (u.docChanged || u.selectionSet) readStats(u.state);
					// mode changes ride their own transactions; the read is a few
					// property lookups — sample every update unconditionally
					readVimMode();
				})
			]
		});
		view = new EditorView({ state, parent: host });
		readStats(view.state);
		readVimMode();
		onReady?.({
			insertAtCursor(text) {
				if (!view) return;
				const head = view.state.selection.main.head;
				view.dispatch({
					changes: { from: head, insert: text },
					selection: { anchor: head + text.length }
				});
				view.focus();
			}
		});
	});

	// Effective vim: setting flips AND viewport crossings reconfigure the
	// compartment — no rebuild, cursor and history survive.
	$effect(() => {
		const next = vim && !smallScreen.matches;
		if (next === vimOn) return;
		vimOn = next;
		if (!view) return;
		view.dispatch({ effects: vimCompartment.reconfigure(next ? [vimKeymap()] : []) });
		queueMicrotask(readVimMode);
	});

	// Wrap state arrives from the parent's toggle button.
	$effect(() => {
		if (!view) return;
		view.dispatch({ effects: wrapCompartment.reconfigure(wrap ? [EditorView.lineWrapping] : []) });
	});

	// External value pushes (post load / revert) must reach the document.
	$effect(() => {
		if (view && value !== emitted) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
			emitted = value;
		}
	});

	onDestroy(() => view?.destroy());
</script>

<div class="flex h-full min-h-0 flex-col {cls}">
	<div bind:this={host} class="min-h-0 grow overflow-hidden"></div>

	<!-- Status bar: the instrument's readout — mode, cursor, word count. -->
	<div
		class="flex shrink-0 items-center justify-between gap-3 border-t border-border px-3 py-1 font-mono text-[10px] text-muted-foreground"
		role="status"
		aria-label="Editor status"
	>
		<span class="flex items-center gap-2 tabular-nums">
			{#if vimOn && mode}
				<span
					class="rounded px-1.5 py-0.5 font-semibold tracking-wider uppercase {mode.toLowerCase() ===
					'insert'
						? 'bg-brand/15 text-brand'
						: 'bg-muted text-foreground'}">{mode}{sub ? `·${sub}` : ''}</span
				>
			{:else if !vimOn}
				<span class="tracking-wider">insert</span>
			{/if}
			<span>Ln {pos.line}, Col {pos.col}</span>
		</span>
		<span class="tabular-nums">{words} words</span>
	</div>
</div>
