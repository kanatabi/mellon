<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { basicSetup } from 'codemirror';
	import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
	import { Compartment, EditorState } from '@codemirror/state';
	import { EditorView } from '@codemirror/view';
	// Community-maintained vim keymap (the npm reality: no @codemirror/vim
	// package exists — corrected against my earlier claim, journaled).
	import { getCM, vim } from '@replit/codemirror-vim';

	interface Props {
		value: string;
		onchange: (v: string) => void;
		vim: boolean;
		class?: string;
	}

	let { value = $bindable(), onchange, vim: vimOn, class: cls = '' }: Props = $props();

	let host: HTMLDivElement | undefined = $state();
	let view: EditorView | undefined;
	const vimCompartment = new Compartment();
	const wrapCompartment = new Compartment();
	// line-wrap preference: localStorage (pure client view state, like rails)
	let wrapped = $state(true);
	// deliberate one-time capture: the editor doc is seeded from `value` at
	// mount; later syncs run through the $effect pair below.
	let emitted = value;

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
		wrapped = localStorage.getItem('mellon.wrap') !== '0';
		const state = EditorState.create({
			doc: value,
			extensions: [
				basicSetup,
				markdown({ base: markdownLanguage }),
				wrapCompartment.of(wrapped ? [EditorView.lineWrapping] : []),
				theme,
				vimCompartment.of(vimOn ? [vim()] : []),
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
	});

	// Vim preference toggled from settings — reconfigure, don't rebuild.
	$effect(() => {
		if (!view) return;
		view.dispatch({ effects: vimCompartment.reconfigure(vimOn ? [vim()] : []) });
		// sample after the reconfigure transaction settles
		queueMicrotask(readVimMode);
	});

	// External value pushes (post load / revert) must reach the document.
	$effect(() => {
		if (view && value !== emitted) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
			emitted = value;
		}
	});

	onDestroy(() => view?.destroy());

	function toggleWrap() {
		wrapped = !wrapped;
		view?.dispatch({
			effects: wrapCompartment.reconfigure(wrapped ? [EditorView.lineWrapping] : [])
		});
		localStorage.setItem('mellon.wrap', wrapped ? '1' : '0');
	}
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
		<span class="flex items-center gap-2">
			<button
				type="button"
				onclick={toggleWrap}
				aria-pressed={wrapped}
				class="rounded px-1.5 py-0.5 tracking-wider uppercase transition-colors {wrapped
					? 'bg-muted text-foreground'
					: 'text-muted-foreground/60 hover:text-foreground'}"
			>
				wrap
			</button>
			<span class="tabular-nums">{words} words</span>
		</span>
	</div>
</div>
