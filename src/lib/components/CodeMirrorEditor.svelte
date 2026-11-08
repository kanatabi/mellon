<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { basicSetup } from 'codemirror';
	import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
	import { Compartment, EditorState } from '@codemirror/state';
	import { EditorView } from '@codemirror/view';
	// Community-maintained vim keymap (the npm reality: no @codemirror/vim
	// package exists — corrected against my earlier claim, journaled).
	import { vim } from '@replit/codemirror-vim';

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
	// deliberate one-time capture: the editor doc is seeded from `value` at
	// mount; later syncs run through the $effect pair below.
	let emitted = value;

	// ── Status bar state (instrument chrome, §11.1) ──────────────────────────
	// The @replit keymap fires `vim-mode-change` (CustomEvent {mode, subMode})
	// on the editor DOM — the only public door (the package exports no
	// getVim accessor; journaled 2026-11-08).
	let mode = $state('');
	let sub = $state('');
	let pos = $state({ line: 1, col: 1 });
	let words = $state(0);

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
		const state = EditorState.create({
			doc: value,
			extensions: [
				basicSetup,
				markdown({ base: markdownLanguage }),
				EditorView.lineWrapping,
				theme,
				vimCompartment.of(vimOn ? [vim()] : []),
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
				})
			]
		});
		view = new EditorView({ state, parent: host });
		readStats(view.state);
		if (vimOn) mode = 'INSERT';

		host.addEventListener('vim-mode-change', (e) => {
			const detail = (e as CustomEvent<{ mode: string; subMode?: string }>).detail;
			mode = detail?.mode ?? '';
			sub = detail?.subMode ?? '';
		});
	});

	// Vim preference toggled from settings — reconfigure, don't rebuild.
	$effect(() => {
		if (!view) return;
		view.dispatch({ effects: vimCompartment.reconfigure(vimOn ? [vim()] : []) });
		mode = vimOn ? 'INSERT' : '';
		sub = '';
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
					class="rounded px-1.5 py-0.5 font-semibold tracking-wider {mode === 'INSERT'
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
