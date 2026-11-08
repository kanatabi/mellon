<script lang="ts">
	import { page } from '$app/state';
	import {
		Command as CommandIcon,
		FileText,
		House,
		Images,
		KeyRound,
		PanelLeftClose,
		PanelLeftOpen,
		Settings
	} from 'lucide-svelte';
	import Palette from '#lib/components/Palette.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { navRail } from '#lib/rails.svelte.ts';
	import { toggleTheme, themeState } from '#lib/theme-state.svelte.ts';
	import { baseCommands, recentCommands, type Command } from '#lib/commands.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let paletteOpen = $state(false);
	let paletteTrigger: HTMLElement | null = null;

	const commands = $derived<Command[]>([
		...baseCommands,
		{
			id: 'action.new-post',
			title: 'New post',
			group: 'actions',
			shortcut: 'n',
			run: () => void import('$app/navigation').then(({ goto }) => goto('/posts/new'))
		},
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

	const navGroups = [
		{
			label: 'content',
			items: [
				{ href: '/', icon: House, label: 'dashboard' },
				{ href: '/posts', icon: FileText, label: 'posts' },
				{ href: '/photos', icon: Images, label: 'photos' }
			]
		},
		{
			label: 'ops',
			items: [
				{ href: '/secrets', icon: KeyRound, label: 'secrets' },
				{ href: '/settings', icon: Settings, label: 'settings' }
			]
		}
	];

	const crumb = $derived(page.url.pathname.split('/').filter(Boolean).slice(0, 2));
</script>

<div class="flex min-h-svh flex-col lg:flex-row">
	<!-- Left nav: column at lg, top strip below. Folds to an icon rail (item
	     #6) — the width transition is GPU-cheap on this small layer, and the
	     labels fade rather than snap. -->
	<nav
		aria-label="Portal navigation"
		class="flex gap-6 border-border px-4 py-3 transition-[width] duration-200 ease-out lg:flex-col lg:border-r lg:px-3 lg:pt-4 {navRail.collapsed
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
		{#each navGroups as group (group.label)}
			<div class="flex flex-col gap-1">
				<p
					class="hidden overflow-hidden text-xs font-medium tracking-widest text-muted-foreground uppercase transition-opacity duration-150 lg:block {navRail.collapsed
						? 'lg:opacity-0'
						: 'lg:opacity-100'}"
				>
					{navRail.collapsed ? '\u00A0' : group.label}
				</p>
				<div class="flex gap-1 lg:flex-col">
					{#each group.items as item (item.href)}
						{@const Icon = item.icon}
						{@const current =
							item.href === '/'
								? page.url.pathname === '/'
								: page.url.pathname.startsWith(item.href)}
						<a
							href={item.href}
							aria-label={item.label}
							aria-current={current ? 'page' : undefined}
							class="flex items-center gap-3 overflow-hidden rounded-md px-3 py-2 text-sm transition-colors {current
								? 'bg-accent font-medium text-foreground'
								: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
						>
							<Icon class="size-4 shrink-0 {current ? 'text-brand' : ''}" />
							<span
								class="hidden whitespace-nowrap transition-opacity duration-150 lg:inline {navRail.collapsed
									? 'lg:opacity-0'
									: 'lg:opacity-100'}"
							>
								{item.label}
							</span>
						</a>
					{/each}
				</div>
			</div>
		{/each}
		<div class="hidden flex-1 items-end pb-6 lg:flex">
			<form method="POST" action="/logout">
				<button
					type="submit"
					class="overflow-hidden font-mono text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground {navRail.collapsed
						? 'lg:opacity-0'
						: 'lg:opacity-100'}"
				>
					end session<span class="text-brand">;</span>
				</button>
			</form>
		</div>
	</nav>

	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Top bar: breadcrumb / centered ⌘K / actions-right (§11.1). -->
		<header
			class="relative flex h-14 items-center justify-between gap-4 border-b border-border px-6"
		>
			<p class="min-w-0 truncate font-mono text-xs text-muted-foreground" aria-label="Breadcrumb">
				{#each crumb as part, i (part + i)}
					{#if i > 0}<span aria-hidden="true" class="mx-1">/</span>{/if}{part}
				{:else}
					dashboard
				{/each}
			</p>
			<button
				type="button"
				onclick={() => {
					paletteTrigger =
						document.activeElement instanceof HTMLElement ? document.activeElement : null;
					paletteOpen = true;
				}}
				class="absolute left-1/2 hidden w-72 max-w-[42vw] -translate-x-1/2 items-center justify-between gap-2 rounded-full border border-border bg-card/60 px-4 py-2 font-mono text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground md:flex"
				aria-label="Open command palette"
			>
				<span class="flex items-center gap-2">
					<CommandIcon class="size-3.5" />
					search commands…
				</span>
				<kbd class="rounded border border-border px-1.5 py-0.5 text-[10px]">⌘K</kbd>
			</button>
			<div class="flex items-center gap-2">
				<ThemeToggle theme={themeState.theme} onToggle={toggleTheme} />
			</div>
		</header>

		<main class="flex-1 px-4 py-6 sm:px-6">
			{@render children()}
		</main>
	</div>
</div>

{#if paletteOpen}
	<Palette {commands} onClose={closePalette} />
{/if}
