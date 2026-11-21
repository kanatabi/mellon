<script lang="ts">
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { Check, ChevronDown } from 'lucide-svelte';

	/**
	 * The themed dropdown (owner call 2026-11-16): native <select> renders a
	 * stock OS popup — every surface here is themed, the popup included.
	 * Grammar follows the house popovers (Combobox/UserMenu): trigger opens a
	 * FIXED-anchored list (rails clip their overflow — Combobox's lesson),
	 * viewport-fit flip, Esc/click-outside close, focus returns to the
	 * trigger, arrows rove, Home/End jump. No search box — these are small
	 * fixed lists; the Combobox owns the searchable case.
	 *
	 * Form participation: pass `name` to ride a form POST via a hidden input
	 * (the users-page role field) — the wire contract is untouched.
	 */
	export interface SelectItem {
		value: string;
		label: string;
	}

	interface Props {
		items: SelectItem[];
		value: string;
		onchange: (value: string) => void;
		ariaLabel: string;
		name?: string;
		/** sm = the URL-picker grammar (compact, mono-xs); md = form fields. */
		size?: 'sm' | 'md';
		/** Popover width floor for long option labels (version rows). */
		popWidth?: number;
		/** Fill the parent's width (the vault picker grows on mobile). */
		fill?: boolean;
	}

	let {
		items,
		value,
		onchange,
		ariaLabel,
		name,
		size = 'sm',
		popWidth = 200,
		fill = false
	}: Props = $props();

	let open = $state(false);
	let root = $state<HTMLDivElement | undefined>();
	let trigger = $state<HTMLButtonElement | undefined>();
	let list = $state<HTMLUListElement | undefined>();
	let pop = $state('');

	// Guarded: matchMedia is client-only; SSR renders the closed state.
	const reduced =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const label = $derived(items.find((i) => i.value === value)?.label ?? value);
	const triggerCls = $derived(
		size === 'sm' ? 'gap-1.5 px-2 py-1 font-mono text-xs' : 'gap-2 px-3 py-2 font-mono text-sm'
	);

	// Viewport-fit placement (the Combobox pattern): flip ABOVE when the list
	// would leave the viewport below, clamp the left edge so a right-clustered
	// trigger can't push the panel off-screen.
	function positionPop() {
		const r = trigger?.getBoundingClientRect();
		if (!r) return;
		const w = Math.max(r.width, Math.min(popWidth, window.innerWidth - 24));
		const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
		const need = 272; // max-h-64 list + padding, worst case
		const below = window.innerHeight - r.bottom;
		pop =
			below < need && r.top > below
				? `position:fixed; bottom:${window.innerHeight - r.top + 6}px; left:${left}px; width:${w}px;`
				: `position:fixed; top:${r.bottom + 6}px; left:${left}px; width:${w}px;`;
	}

	// The popup PORTALS to document.body (S2 round, the users dialog): inline
	// fixed positioning dies inside dialogs twice over — a transformed
	// ancestor becomes the containing block for fixed descendants, and the
	// dialog's own entrance re-layout orphans the once-measured coordinates.
	// In body, the viewport coordinates are ALWAYS the truth. The outside
	// -click + focus logic below account for the popup living outside `root`.
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	function openPop() {
		if (open) return;
		open = true;
		positionPop();
		// the dialog beneath us may still be settling (entrance animation,
		// h-fit resolution) — re-measure on the next ticks, not just once
		tick().then(positionPop);
		requestAnimationFrame(() => positionPop());
		// focus lands on the SELECTED row (native-select instinct), first row
		// as fallback
		tick().then(() => {
			const sel =
				list?.querySelector<HTMLButtonElement>('[aria-selected="true"] button') ??
				list?.querySelector<HTMLButtonElement>('button');
			sel?.focus();
		});
	}

	function close(refocus = true) {
		if (!open) return;
		open = false;
		if (refocus) trigger?.focus();
	}

	function pick(v: string) {
		onchange(v);
		close();
	}

	function onListKey(e: KeyboardEvent) {
		const opts = Array.from(list?.querySelectorAll<HTMLButtonElement>('button') ?? []);
		const i = opts.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === 'ArrowDown' && i < opts.length - 1) {
			opts[i + 1]?.focus();
			e.preventDefault();
		} else if (e.key === 'ArrowUp' && i > 0) {
			opts[i - 1]?.focus();
			e.preventDefault();
		} else if (e.key === 'Home' && opts.length) {
			opts[0].focus();
			e.preventDefault();
		} else if (e.key === 'End' && opts.length) {
			opts[opts.length - 1].focus();
			e.preventDefault();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		const onPointer = (e: PointerEvent) => {
			// the listbox is PORTALED to body — outside `root` — so the outside
			// -click must not count it (or picking an option would close on
			// pointerdown before the option's click fires)
			if (root && e.target instanceof Node && !root.contains(e.target) && !list?.contains(e.target))
				close(false);
		};
		const reposition = () => positionPop();
		window.addEventListener('keydown', onKey);
		document.addEventListener('pointerdown', onPointer);
		window.addEventListener('scroll', reposition, true);
		window.addEventListener('resize', reposition);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onPointer);
			window.removeEventListener('scroll', reposition, true);
			window.removeEventListener('resize', reposition);
		};
	});
</script>

<div class={fill ? 'w-full' : ''} bind:this={root}>
	{#if name}<input type="hidden" {name} {value} />{/if}
	<button
		type="button"
		bind:this={trigger}
		onclick={() => (open ? close() : openPop())}
		onkeydown={(e) => {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				openPop();
			}
		}}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={ariaLabel}
		class="flex items-center justify-between rounded-md border border-border bg-card transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/40 {fill
			? 'w-full'
			: ''} {triggerCls}"
	>
		<span class="min-w-0 truncate">{label}</span>
		<ChevronDown class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
	</button>

	{#if open}
		<!-- Shield the portaled popup from the host layers' document-level
		     dismiss/focus machinery (bits-ui IGNORES stopped events —
		     `if (event.cancelBubble)` / `if (event.defaultPrevented)`):
		     a pointerdown on an option must not read as interact-outside
		     (it closed the whole dialog before the pick could land), and
		     focus riding into body must not trip the dialog's guard. -->
		<ul
			role="listbox"
			aria-label={ariaLabel}
			bind:this={list}
			use:portal
			onpointerdown={(e) => e.stopPropagation()}
			onfocusin={(e) => e.stopPropagation()}
			onfocusout={(e) => e.stopPropagation()}
			onkeydown={onListKey}
			style={pop}
			transition:fly={{ y: -4, duration: reduced ? 0 : 120 }}
			class="z-50 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl"
		>
			{#each items as it (it.value)}
				<li role="option" aria-selected={it.value === value}>
					<button
						type="button"
						tabindex="-1"
						onclick={() => pick(it.value)}
						class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors {it.value ===
						value
							? 'bg-brand/10 text-foreground'
							: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
					>
						<Check
							class="size-3.5 shrink-0 {it.value === value ? 'text-brand' : 'opacity-0'}"
							aria-hidden="true"
						/>
						<span class="truncate">{it.label}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
