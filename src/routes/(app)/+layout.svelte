<script lang="ts">
	import { navigating, page } from '$app/state';
	import { cubicOut } from 'svelte/easing';
	import { fade, slide } from 'svelte/transition';
	import {
		Command as CommandIcon,
		FileText,
		House,
		Images,
		GitCompareArrows,
		LayoutGrid,
		KeyRound,
		Menu,
		PanelLeftClose,
		PanelLeftOpen,
		Search,
		Tag,
		Users,
		X
	} from 'lucide-svelte';
	import Palette from '#lib/components/Palette.svelte';
	import UserMenu from '#lib/components/UserMenu.svelte';
	import { focusOnMount } from '#lib/actions.ts';
	import { invalidateAll } from '$app/navigation';
	import { navRail } from '#lib/rails.svelte.ts';
	import { writeVimCookie } from '#lib/session.ts';
	import { stateToggle } from '#lib/command-kit.ts';
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
		stateToggle({
			id: 'toggle.theme',
			title: 'Toggle theme',
			on: themeState.theme === 'dark',
			onHint: 'dark',
			offHint: 'light',
			run: () => toggleTheme()
		}),
		stateToggle({
			id: 'toggle.vim',
			title: 'Toggle vim editing',
			on: !!data.vim,
			// cookie + invalidateAll: the layout load re-reads mellon_vim, and
			// the editor's vim compartment reconfigures WITHOUT a page reload
			run: () => {
				writeVimCookie(!data.vim);
				void invalidateAll();
			}
		}),
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
	// IA 2026-11-11 (owner): three honest groups. Content = the editorial
	// work; Control Plane = the infra surfaces (configs matrix, vault,
	// compare — future GitOps features land here); Admin = people & access,
	// shown only to admins (lumen enforces the 403 regardless; hiding a door
	// that answers 403 is courtesy, and we are polite). Settings is NOT a
	// destination group: it lives in the footer with the identity it edits.
	const navGroups = $derived([
		{
			label: 'Content',
			items: [
				{ href: '/', icon: House, label: 'Dashboard', hue: 'var(--brand)' },
				{ href: '/posts', icon: FileText, label: 'Posts', hue: 'var(--accent-blue)' },
				{ href: '/photos', icon: Images, label: 'Photos', hue: 'var(--accent-teal)' },
				{ href: '/tags', icon: Tag, label: 'Tags', hue: 'var(--accent-slate)' }
			]
		},
		{
			label: 'Control plane',
			items: [
				// landing = the summary matrix; the word "Configs" owns the
				// section, Vault is the old cockpit, Compare as-is
				{ href: '/configs', icon: LayoutGrid, label: 'Configs', hue: 'var(--accent-amber)' },
				{ href: '/configs/vault', icon: KeyRound, label: 'Vault', hue: 'var(--accent-amber)' },
				{
					href: '/configs/compare',
					icon: GitCompareArrows,
					label: 'Compare',
					hue: 'var(--accent-amber)'
				}
			]
		},
		...(data.principal?.role === 'admin'
			? [
					{
						label: 'Admin',
						items: [
							{ href: '/admin/users', icon: Users, label: 'Users', hue: 'var(--accent-teal)' }
						]
					}
				]
			: [])
	]);

	// The longest matching href is the active row: on /secrets/compare the
	// 'compare' item wins, not both it and 'secrets' (startsWith alone would
	// light two rows once destinations nest under destinations).
	const activeHref = $derived.by(() => {
		const p = page.url.pathname;
		let best = '';
		for (const g of navGroups)
			for (const it of g.items) {
				const hit = it.href === '/' ? p === '/' : p === it.href || p.startsWith(it.href + '/');
				if (hit && it.href.length > best.length) best = it.href;
			}
		return best;
	});

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
</script>

<div class="flex h-svh flex-col overflow-hidden bg-chrome lg:flex-row">
	<div class="route-progress" data-phase={barState} aria-hidden="true"></div>
	<!-- Left nav: column at lg, top strip below. Folds to an icon rail (item
	     #6) — the width transition is GPU-cheap on this small layer, and the
	     labels fade rather than snap. -->
	<nav
		aria-label="Portal navigation"
		class="hidden gap-6 bg-chrome px-4 py-3 transition-[width] duration-200 ease-out lg:flex lg:flex-col lg:px-3 lg:pt-0 {navRail.collapsed
			? 'lg:w-[4.25rem]'
			: 'lg:w-60'}"
	>
		<!-- The brand owns the header row; the collapse toggle lives at the
		     footer's end in BOTH states (owner call 2026-11-16, current-GitLab
		     grammar) — one toggle, one place, never competing with the brand. -->
		<div class="flex h-14 items-center lg:w-full {navRail.collapsed ? 'justify-center' : ''}">
			<a
				href="/"
				class="font-brand text-2xl leading-none font-semibold tracking-tight"
				aria-label="mellon dashboard"
			>
				{#if navRail.collapsed}
					<span class="hidden lg:inline">m<span class="text-brand">;</span></span>
					<span class="lg:hidden">mellon<span class="text-brand">;</span></span>
				{:else}
					mellon<span class="text-brand">;</span>
				{/if}
			</a>
		</div>
		{@render navItems(true)}
		<div class="flex flex-1 flex-col justify-end pb-6">
			<!-- The collapse toggle: the footer's last row in BOTH states —
			     labeled nav-row when expanded, icon + tooltip when collapsed.
			     Same focus/hover contract as every rail row. -->
			<div class="group/tip relative">
				<button
					type="button"
					onclick={navRail.toggle}
					aria-label={navRail.collapsed ? 'Expand navigation' : 'Collapse navigation'}
					class="flex items-center gap-3 overflow-hidden rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground {navRail.collapsed
						? 'mx-auto w-9 justify-center px-0'
						: 'w-full px-3'}"
				>
					{#if navRail.collapsed}
						<PanelLeftOpen class="size-4 shrink-0" />
					{:else}
						<PanelLeftClose class="size-4 shrink-0" />
					{/if}
					<span
						class="whitespace-nowrap transition-opacity duration-150 {navRail.collapsed
							? 'hidden'
							: ''}"
					>
						Collapse sidebar
					</span>
				</button>
				{#if navRail.collapsed}
					<span
						aria-hidden="true"
						class="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 rounded-md border border-border bg-card px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100"
					>
						Expand sidebar
					</span>
				{/if}
			</div>
		</div>
	</nav>

	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		<!-- Top bar: three-zone flow grid (§11.1) — the centered ⌘K pill reserves
		     its space in the middle zone (the collision your iPad shot caught:
		     absolute centering doesn't truncate siblings). Breadcrumbs live
		     IN-PAGE now (owner call 2026-11-17: sub-pages carry their own above
		     the title; parent pages show none) — the left zone is the
		     hamburger's home below lg and empty at desktop. -->
		<header
			class="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 bg-chrome px-4 lg:px-6"
		>
			<div class="col-start-1 flex min-w-0 items-center gap-1.5">
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
			</div>
			<button
				type="button"
				onclick={openPalette}
				class="hidden w-80 max-w-[42vw] items-center justify-between gap-2 rounded-full border border-border bg-card/60 px-4 py-2 font-mono text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground md:col-start-2 md:flex md:justify-self-center"
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
				     round-key language as the account avatar. -->
				<button
					type="button"
					onclick={openPalette}
					aria-label="Search"
					class="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted md:hidden"
				>
					<Search class="size-4" />
				</button>
				{#if data.principal}
					<UserMenu principal={data.principal} />
				{/if}
			</div>
		</header>

		<!-- The content box (GitLab surface grammar, owner call 2026-11-16):
		     the chrome is ONE mass behind everything; the box is the only
		     surface that draws an edge — rounded, bordered, FLUSH top/left at
		     lg (it touches the topbar and the nav, the true GitLab shape) with
		     the 12px ring on right/bottom; below lg the ring covers the x-axis
		     and the bottom, the top stays flush (owner call 2026-11-17, third
		     iteration). It remains the scroll container, so sticky children
		     keep working. -->
		<main
			class="mx-3 mb-3 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-background px-4 py-6 shadow-sm sm:px-6 lg:ml-0"
		>
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
					? `hidden text-xs font-medium tracking-widest text-muted-foreground uppercase ${navRail.collapsed ? '' : 'lg:block'}`
					: 'text-xs font-medium tracking-widest text-muted-foreground uppercase'}
			>
				{group.label}
			</p>
			<div class={rail ? 'flex gap-1 lg:flex-col' : 'flex flex-col gap-1'}>
				{#each group.items as item (item.href)}
					{@const Icon = item.icon}
					{@const current = activeHref === item.href}
					<!-- The wrapper (not the anchor) anchors the tooltip: the
					     anchor's overflow-hidden clips the fading label, so the
					     tip must be a sibling to escape it. Hover AND keyboard
					     focus — the collapsed rail is never nameless. -->
					<div class={rail ? 'group/tip relative' : ''}>
						<a
							href={item.href}
							aria-label={item.label}
							aria-current={current ? 'page' : undefined}
							style={current
								? `background: color-mix(in oklab, ${item.hue} 14%, transparent)`
								: undefined}
							class="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors {rail
								? 'overflow-hidden '
								: ''}{rail && navRail.collapsed ? 'mx-auto w-9 justify-center px-0' : ''}{current
								? 'font-medium text-foreground'
								: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
						>
							<Icon
								class="size-4 shrink-0"
								style={`color: ${item.hue}; opacity: ${current ? 1 : 0.72}`}
							/>
							<span
								class={rail
									? `hidden whitespace-nowrap ${navRail.collapsed ? '' : 'lg:inline'}`
									: ''}
							>
								{item.label}
							</span>
						</a>
						{#if rail && navRail.collapsed}
							<span
								aria-hidden="true"
								class="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 rounded-md border border-border bg-card px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-md transition-opacity duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100"
							>
								{item.label}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/each}
{/snippet}
