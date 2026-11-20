<script lang="ts">
	import { navigating } from '$app/state';
	import {
		Command as CommandIcon,
		FileText,
		House,
		Images,
		GitCompareArrows,
		LayoutGrid,
		KeyRound,
		Menu,
		Search,
		Tag,
		Users
	} from 'lucide-svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import Palette from '#lib/components/Palette.svelte';
	import UserMenu from '#lib/components/UserMenu.svelte';
	import { invalidateAll } from '$app/navigation';
	import { navRail } from '#lib/rails.svelte.ts';
	import { writeVimCookie } from '#lib/session.ts';
	import { stateToggle } from '#lib/command-kit.ts';
	import { toggleTheme, themeState } from '#lib/theme-state.svelte.ts';
	import { baseCommands, recentCommands, type Command } from '#lib/commands.ts';
	import { pageCommands } from '#lib/page-commands.svelte.ts';
	import AppSidebar from './app-sidebar.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let paletteOpen = $state(false);
	let paletteTrigger: HTMLElement | null = null;
	// MUST init null, not undefined: Trigger's `ref = $bindable(null)` has a
	// fallback, and `bind:ref={undefined}` throws `props_invalid_value` at
	// HYDRATION — the throw lands inside the error-boundary render, and the
	// client router then falls back to the ROOT boundary: the error page
	// loses the shell (observed live, S2 round). null satisfies the contract.
	let burger = $state<HTMLButtonElement | null>(null);

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
	// the same chroma/lightness band. IA 2026-11-11 (owner): three honest
	// groups — Content, Control Plane, Admin (admins only; lumen enforces the
	// 403 regardless; hiding a door that answers 403 is courtesy). Settings is
	// NOT a destination group: it lives in the footer with the identity it
	// edits — the account menu, since S2.8.
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

	// ── The sidebar block wiring (S2, D6): the block's open state is the ONE
	// source; navRail is the persistence. ⌘B and the footer toggle both arrive
	// as absolute values through onOpenChange; this derived mirrors the store
	// back into the Provider (init + external flips stay consistent), and the
	// block's writes land as optimistic overrides until the store echoes.
	let railOpen = $derived(!navRail.collapsed);
</script>

// today's frame: one chrome mass, h-svh, NO page scroll — the content // box below is the only
scroll container
<Sidebar.Provider
	bind:open={railOpen}
	onOpenChange={(open) => navRail.setCollapsed(!open)}
	class="h-svh overflow-hidden bg-chrome"
>
	<div class="route-progress" data-phase={barState} aria-hidden="true"></div>

	<!-- The rail: brand header, three wayfinding groups, footer collapse
	     toggle. Below lg the block renders the same tree inside a left sheet
	     (the hamburger's drawer, contract unchanged). -->
	<AppSidebar groups={navGroups} onMobileClose={() => burger?.focus()} />

	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		<!-- Top bar: three-zone flow grid (§11.1) — the centered ⌘K pill
		     reserves its space in the middle zone (absolute centering doesn't
		     truncate siblings). Breadcrumbs live IN-PAGE (owner call
		     2026-11-17). The hamburger is the block's Trigger wearing mellon's
		     glyph: below lg it opens the sheet; at lg+ it never renders. -->
		<header
			class="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 bg-chrome px-4 lg:px-6"
		>
			<div class="col-start-1 flex min-w-0 items-center gap-1.5">
				<Sidebar.Trigger
					bind:ref={burger}
					aria-label="Open navigation"
					class="-ml-2 shrink-0 text-muted-foreground hover:text-foreground lg:hidden"
				>
					<Menu class="size-5" />
				</Sidebar.Trigger>
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
		     surface that draws an edge — flush top/left at lg (it touches the
		     topbar and the nav, the true GitLab shape) with the ring on
		     right/bottom; below lg the ring covers the x-axis and the bottom,
		     the top stays flush (owner call 2026-11-17). It remains the scroll
		     container, so sticky children keep working. S2/D9: rounded-lg —
		     the doctrine ceiling; the drifted rounded-2xl + shadow-sm are gone
		     (the border is the edge; a shadow would make the box an overlay). -->
		<Sidebar.Inset>
			{@render children()}
		</Sidebar.Inset>
	</div>
</Sidebar.Provider>

{#if paletteOpen}
	<Palette {commands} onClose={closePalette} />
{/if}
