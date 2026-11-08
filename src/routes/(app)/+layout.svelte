<script lang="ts">
	import { navigating, page } from '$app/state';
	import { cubicOut } from 'svelte/easing';
	import { fade, slide } from 'svelte/transition';
	import {
		Command as CommandIcon,
		FileText,
		House,
		Images,
		KeyRound,
		Menu,
		PanelLeftClose,
		PanelLeftOpen,
		Search,
		Settings,
		X
	} from 'lucide-svelte';
	import Palette from '#lib/components/Palette.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { focusOnMount } from '#lib/actions.ts';
	import { invalidateAll } from '$app/navigation';
	import { navRail } from '#lib/rails.svelte.ts';
	import { writeVimCookie } from '#lib/session.ts';
	import { toggleTheme, themeState } from '#lib/theme-state.svelte.ts';
	import { baseCommands, recentCommands, type Command } from '#lib/commands.ts';
	import { pageCommands } from '#lib/page-commands.svelte.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let paletteOpen = $state(false);
	let paletteTrigger: HTMLElement | null = null;

	// Route-progress bar — ported from earendil's shell: a three-phase state
	// machine (active sweep → guaranteed finishing beat → idle). Preloaded
	// navigations resolve in ~1 frame; the sweep-to-full + fade still runs so
	// slow loads get honest feedback and fast ones never flash awkwardly.
	// Hash-only jumps load nothing — don't bar for them.
	const navLoading = $derived(
		navigating.to !== null &&
			!(
				navigating.from !== null &&
				navigating.to.url.pathname === navigating.from.url.pathname &&
				navigating.to.url.hash !== ''
			)
	);
	let barState = $state<'idle' | 'active' | 'finishing'>('idle');
	let finishTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		if (navLoading) {
			clearTimeout(finishTimer);
			barState = 'active';
		} else if (barState === 'active') {
			barState = 'finishing';
			finishTimer = setTimeout(() => (barState = 'idle'), 280);
		}
	});

	const commands = $derived<Command[]>([
		...baseCommands,
		{
			id: 'action.new-post',
			title: 'New post',
			group: 'actions',
			shortcut: 'n',
			run: () => void import('$app/navigation').then(({ goto }) => goto('/posts/new'))
		},
		// Global toggles: the hint column shows CURRENT STATE — the palette
		// answers "what mode am I in?" before you flip it (owner call).
		{
			id: 'toggle.theme',
			title: 'Toggle theme',
			group: 'actions',
			shortcut: themeState.theme,
			run: () => toggleTheme()
		},
		{
			id: 'toggle.vim',
			title: 'Toggle vim editing',
			group: 'actions',
			shortcut: data.vim ? 'on' : 'off',
			// cookie + invalidateAll: the layout load re-reads mellon_vim, and
			// the editor's vim compartment reconfigures WITHOUT a page reload
			run: () => {
				writeVimCookie(!data.vim);
				void invalidateAll();
			}
		},
		// Context first: the page's verbs (editor save/publish/…) sort into the
		// 'actions' group, ranked above navigation by the palette order.
		...pageCommands(),
		...recentCommands(data.recent)
	]);

	// Global ⌘K / Ctrl+K — the shell owns the one palette binding (DESIGN §7).
	$effect(() => navRail.init());
	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				if (!paletteOpen) {
					paletteTrigger =
						document.activeElement instanceof HTMLElement ? document.activeElement : null;
					paletteOpen = true;
				} else {
					closePalette();
				}
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function closePalette() {
		paletteOpen = false;
		paletteTrigger?.focus();
		paletteTrigger = null;
	}

	function openPalette() {
		paletteTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		paletteOpen = true;
	}

	// Wayfinding cast (owner call 2026-11-08): one hue per destination, all at
	// the same chroma/lightness band. Hues ride INLINE styles — Tailwind cannot
	// generate dynamic utility names (the literal-scan lesson, again).
	const navGroups = [
		{
			label: 'content',
			items: [
				{ href: '/', icon: House, label: 'dashboard', hue: 'var(--brand)' },
				{ href: '/posts', icon: FileText, label: 'posts', hue: 'var(--accent-blue)' },
				{ href: '/photos', icon: Images, label: 'photos', hue: 'var(--accent-teal)' }
			]
		},
		{
			label: 'ops',
			items: [
				{ href: '/secrets', icon: KeyRound, label: 'secrets', hue: 'var(--accent-amber)' },
				{ href: '/settings', icon: Settings, label: 'settings', hue: 'var(--accent-slate)' }
			]
		}
	];

	// ── Mobile nav drawer (owner call 2026-11-08): below lg the icon strip is
	// replaced by a hamburger in the topbar, sliding a sidebar in from the
	// left. Same dismissal contract as the bottom sheets: X / Esc / backdrop,
	// close on navigation, focus returns to the trigger. No drag-to-dismiss —
	// nav drawers live in the tap-to-dismiss idiom, not the thumb-pull one.
	let navOpen = $state(false);
	let burger = $state<HTMLButtonElement | undefined>();
	// Guarded: $derived evaluates during SSR too, where window is absent.
	const reduced = $derived(
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
	function closeNav(returnFocus = true) {
		navOpen = false;
		if (returnFocus) burger?.focus();
	}
	$effect(() => {
		void page.url.pathname; // navigation dismisses the drawer (no focus ping-pong)
		navOpen = false;
	});
	$effect(() => {
		if (!navOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closeNav();
		};
		window.addEventListener('keydown', onKey);
		document.documentElement.style.overflow = 'hidden';
		return () => {
			window.removeEventListener('keydown', onKey);
			document.documentElement.style.overflow = '';
		};
	});

	const crumb = $derived(page.url.pathname.split('/').filter(Boolean).slice(0, 2));
</script>

<div class="flex min-h-svh flex-col lg:flex-row">
	<div class="route-progress" data-phase={barState} aria-hidden="true"></div>
	<!-- Left nav: column at lg, top strip below. Folds to an icon rail (item
	     #6) — the width transition is GPU-cheap on this small layer, and the
	     labels fade rather than snap. -->
	<nav
		aria-label="Portal navigation"
		class="hidden gap-6 border-border bg-chrome px-4 py-3 transition-[width] duration-200 ease-out lg:flex lg:flex-col lg:border-r lg:px-3 lg:pt-4 {navRail.collapsed
			? 'lg:w-[4.25rem]'
			: 'lg:w-60'}"
	>
		<div class="flex items-center justify-between lg:w-full">
			<a
				href="/"
				class="font-brand text-2xl font-semibold tracking-tight"
				aria-label="mellon dashboard"
			>
				{#if navRail.collapsed}
					<span class="hidden lg:inline">m<span class="text-brand">;</span></span>
					<span class="lg:hidden">mellon<span class="text-brand">;</span></span>
				{:else}
					mellon<span class="text-brand">;</span>
				{/if}
			</a>
			<button
				type="button"
				onclick={navRail.toggle}
				aria-label={navRail.collapsed ? 'Expand navigation' : 'Collapse navigation'}
				class="hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground lg:block"
			>
				{#if navRail.collapsed}
					<PanelLeftOpen class="size-4" />
				{:else}
					<PanelLeftClose class="size-4" />
				{/if}
			</button>
		</div>
		{@render navItems(true)}
		<div class="hidden flex-1 items-end pb-6 lg:flex">
			<form method="POST" action="/logout">
				<button
					type="submit"
					class="overflow-hidden font-mono text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground {navRail.collapsed
						? 'lg:opacity-0'
						: 'lg:opacity-100'}"
				>
					end session
				</button>
			</form>
		</div>
	</nav>

	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Top bar: three-zone flow grid (§11.1) — the centered ⌘K pill reserves
		     its space instead of floating over the breadcrumb (the collision your
		     iPad shot caught: absolute centering doesn't truncate siblings).
		     Below lg the left zone gains the hamburger that summons the drawer. -->
		<header
			class="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-border bg-chrome px-4 lg:px-6"
		>
			<div class="col-start-1 flex min-w-0 items-center gap-1.5 justify-self-start">
				<button
					type="button"
					bind:this={burger}
					onclick={() => (navOpen = true)}
					aria-label="Open navigation"
					aria-expanded={navOpen}
					class="-ml-2 shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground lg:hidden"
				>
					<Menu class="size-5" />
				</button>
				<nav class="min-w-0 truncate font-mono text-xs" aria-label="Breadcrumb">
					{#each crumb as part, i (part + i)}
						{#if i > 0}<span aria-hidden="true" class="mx-1 text-muted-foreground">/</span>{/if}
						{#if i === crumb.length - 1}
							<span aria-current="page" class="text-foreground">{part}</span>
						{:else}
							<a
								href={'/' + crumb.slice(0, i + 1).join('/')}
								class="text-muted-foreground transition-colors hover:text-foreground hover:underline"
								>{part}</a
							>
						{/if}
					{:else}
						<span aria-current="page" class="text-foreground">dashboard</span>
					{/each}
				</nav>
			</div>
			<button
				type="button"
				onclick={openPalette}
				class="hidden w-72 max-w-[42vw] items-center justify-between gap-2 rounded-full border border-border bg-card/60 px-4 py-2 font-mono text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground md:col-start-2 md:flex md:justify-self-center"
				aria-label="Open command palette"
			>
				<span class="flex items-center gap-2">
					<CommandIcon class="size-3.5" />
					search posts, commands…
				</span>
				<kbd class="rounded border border-border px-1.5 py-0.5 text-[10px]">⌘K</kbd>
			</button>
			<div class="col-start-3 flex items-center gap-2 justify-self-end">
				<!-- Phones: the palette door the ⌘K pill is on desktop — same
				     round-key language as the theme toggle. -->
				<button
					type="button"
					onclick={openPalette}
					aria-label="Search"
					class="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted md:hidden"
				>
					<Search class="size-4" />
				</button>
				<ThemeToggle theme={themeState.theme} onToggle={toggleTheme} />
			</div>
		</header>

		<main class="flex-1 px-4 py-6 sm:px-6">
			{@render children()}
		</main>
	</div>
</div>

{#if navOpen}
	<div
		class="fixed inset-0 z-30 bg-background/60 backdrop-blur-[2px]"
		role="presentation"
		aria-hidden="true"
		transition:fade={{ duration: reduced ? 0 : 150 }}
		onclick={() => closeNav()}
	></div>
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Portal navigation"
		tabindex="-1"
		class="fixed inset-y-0 left-0 z-30 flex w-64 max-w-[80vw] flex-col gap-4 border-r border-border bg-chrome px-4 pt-4 pb-[calc(1.25rem+env(safe-area-inset-left))] shadow-2xl"
		style="padding-left: max(1rem, env(safe-area-inset-left))"
		transition:slide|local={{ axis: 'x', duration: reduced ? 0 : 240, easing: cubicOut }}
	>
		<div class="flex items-center justify-between">
			<a
				href="/"
				class="font-brand text-2xl font-semibold tracking-tight"
				aria-label="mellon dashboard">mellon<span class="text-brand">;</span></a
			>
			<button
				type="button"
				onclick={() => closeNav()}
				aria-label="Close navigation"
				class="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
				use:focusOnMount
			>
				<X class="size-4" />
			</button>
		</div>
		{@render navItems(false)}
		<form method="POST" action="/logout" class="mt-auto">
			<button
				type="submit"
				class="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				end session
			</button>
		</form>
	</div>
{/if}

{#if paletteOpen}
	<Palette {commands} onClose={closePalette} />
{/if}

<!-- One nav markup for both surfaces: rail=true carries the collapse fades
     and lg: prefixes; rail=false (the mobile drawer) is always expanded.
     Wayfinding hues ride INLINE styles — Tailwind can't generate dynamic
     utility names, and washes use color-mix so they darken correctly with
     the theme. -->
{#snippet navItems(rail: boolean)}
	{#each navGroups as group (group.label)}
		<div class="flex flex-col gap-1">
			<p
				class={rail
					? `hidden overflow-hidden text-xs font-medium tracking-widest text-muted-foreground uppercase transition-opacity duration-150 lg:block ${navRail.collapsed ? 'lg:opacity-0' : 'lg:opacity-100'}`
					: 'text-xs font-medium tracking-widest text-muted-foreground uppercase'}
			>
				{rail && navRail.collapsed ? '\u00A0' : group.label}
			</p>
			<div class={rail ? 'flex gap-1 lg:flex-col' : 'flex flex-col gap-1'}>
				{#each group.items as item (item.href)}
					{@const Icon = item.icon}
					{@const current =
						item.href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(item.href)}
					<a
						href={item.href}
						aria-label={item.label}
						aria-current={current ? 'page' : undefined}
						style={current
							? `background: color-mix(in oklab, ${item.hue} 14%, transparent)`
							: undefined}
						class="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors {rail
							? 'overflow-hidden '
							: ''}{current
							? 'font-medium text-foreground'
							: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
					>
						<Icon
							class="size-4 shrink-0"
							style={`color: ${item.hue}; opacity: ${current ? 1 : 0.72}`}
						/>
						<span
							class={rail
								? `hidden whitespace-nowrap transition-opacity duration-150 lg:inline ${navRail.collapsed ? 'lg:opacity-0' : 'lg:opacity-100'}`
								: ''}
						>
							{item.label}
						</span>
					</a>
				{/each}
			</div>
		</div>
	{/each}
{/snippet}
