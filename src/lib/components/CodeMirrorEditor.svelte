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
					if (!u.docChanged) return;
					emitted = u.state.doc.toString();
					// Assign the bindable prop ITSELF — writing only through
					// `onchange` left the parent's bind:value stale (typing never
					// reached draft.content, so the live preview never moved).
					value = emitted;
					onchange(emitted);
				})
			]
		});
		view = new EditorView({ state, parent: host });
	});

	// Vim preference toggled from settings — reconfigure, don't rebuild.
	$effect(() => {
		view?.dispatch({
			effects: vimCompartment.reconfigure(vimOn ? [vim()] : [])
		});
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

<div bind:this={host} class="h-full min-h-0 overflow-hidden {cls}"></div>
