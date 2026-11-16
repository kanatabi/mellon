<script lang="ts">
	// The account surface (owner call 2026-11-16): one avatar in the top
	// bar, one menu — GitHub grammar. Identity (once a tiny footer dot),
	// Settings, theme, and sign-out all live here; the sidebar keeps only
	// wayfinding + the collapse toggle. Contract: Esc / click-outside
	// close, focus returns to the trigger, every row is a real button or
	// link — keyboard-first holds, nothing hover-gated.
	import { fade } from 'svelte/transition';
	import { LogOut, Settings } from 'lucide-svelte';
	import ThemeSegmented from '#lib/components/ThemeSegmented.svelte';

	interface Props {
		principal: { username: string; role: 'admin' | 'editor' };
	}

	let { principal }: Props = $props();

	let open = $state(false);
	let trigger = $state<HTMLButtonElement | undefined>();
	let root = $state<HTMLDivElement | undefined>();
	// Guarded: $derived-by-effect listeners only matter client-side; SSR
	// renders the closed state and never binds listeners.
	const reduced =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function close() {
		open = false;
		trigger?.focus();
	}

	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		const onPointer = (e: PointerEvent) => {
			if (root && e.target instanceof Node && !root.contains(e.target)) close();
		};
		window.addEventListener('keydown', onKey);
		document.addEventListener('pointerdown', onPointer);
		return () => {
			window.removeEventListener('keydown', onKey);
			document.removeEventListener('pointerdown', onPointer);
		};
	});

	const initial = $derived(principal.username.slice(0, 1).toUpperCase());
</script>

<div class="relative" bind:this={root}>
	<button
		type="button"
		bind:this={trigger}
		onclick={() => (open ? close() : (open = true))}
		aria-label="Account menu for {principal.username}"
		aria-expanded={open}
		aria-controls="account-menu"
		class="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-brand/15 font-mono text-xs font-bold text-brand uppercase transition-colors hover:bg-brand/25"
	>
		{initial}
	</button>

	{#if open}
		<div
			id="account-menu"
			transition:fade={{ duration: reduced ? 0 : 120 }}
			class="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-card p-2 shadow-xl"
		>
			<!-- The account card: the identity, at a size you can read —
			     the footer dot this replaces was size-4. -->
			<div class="flex items-center gap-3 px-2 py-2">
				<span
					aria-hidden="true"
					class="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 font-mono text-sm font-bold text-brand uppercase"
				>
					{initial}
				</span>
				<span class="min-w-0">
					<span class="block truncate text-sm font-semibold text-foreground">
						{principal.username}
					</span>
					<span class="block font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
						{principal.role}
					</span>
				</span>
			</div>

			<div class="my-1 border-t border-border/70" aria-hidden="true"></div>

			<a
				href="/settings"
				onclick={close}
				class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
			>
				<Settings class="size-4 shrink-0" />
				Settings
			</a>

			<div class="px-2 py-2">
				<ThemeSegmented />
			</div>

			<div class="my-1 border-t border-border/70" aria-hidden="true"></div>

			<!-- Same POST /logout the sidebar footer carried — moved, not
			     re-invented: the session revocation is lumen's truth. -->
			<form method="POST" action="/logout">
				<button
					type="submit"
					class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
				>
					<LogOut class="size-4 shrink-0" />
					Sign out
				</button>
			</form>
		</div>
	{/if}
</div>
