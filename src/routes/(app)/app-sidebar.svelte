<script lang="ts">
	import { page } from '$app/state';
	import { ChevronDown, House, PanelLeftClose, PanelLeftOpen } from 'lucide-svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import { cn } from '#lib/utils.js';

	interface NavItem {
		href: string;
		icon: typeof House;
		label: string;
		hue: string;
	}

	interface NavGroup {
		label: string;
		items: NavItem[];
	}

	interface Props {
		groups: NavGroup[];
		/** Called when the USER closes the mobile sheet (X / Esc / backdrop) —
		 *  focus goes home. Navigation-close goes through `setOpenMobile` and
		 *  must not steal focus from the new page. */
		onMobileClose?: () => void;
	}

	let { groups, onMobileClose }: Props = $props();

	// A child component by necessity, not style: the sidebar context is only
	// readable BELOW the Provider, and the footer toggle + the sheet dismissal
	// both need it. The layout renders this next to the Inset.
	const sidebar = Sidebar.useSidebar();

	// Navigation dismisses the sheet (today's contract — and no focus
	// ping-pong: onMobileClose is not called from here).
	$effect(() => {
		void page.url.pathname;
		sidebar.setOpenMobile(false);
	});

	// The longest matching href is the active row: on /configs/compare the
	// 'compare' item wins, not both it and 'configs' (startsWith alone would
	// light two rows once destinations nest under destinations).
	const activeHref = $derived.by(() => {
		const p = page.url.pathname;
		let best = '';
		for (const g of groups)
			for (const it of g.items) {
				const hit = it.href === '/' ? p === '/' : p === it.href || p.startsWith(it.href + '/');
				if (hit && it.href.length > best.length) best = it.href;
			}
		return best;
	});

	// Wayfinding washes ride INLINE styles — Tailwind cannot generate dynamic
	// utility names (the literal-scan lesson, again), and color-mix darkens
	// correctly with the theme.
	const wash = (hue: string) => `background: color-mix(in oklab, ${hue} 14%, transparent)`;

	// Per-section collapse (owner ask — the doc's collapsible-group pattern):
	// keyed by group label, all expanded by default, NOT persisted — a fresh
	// visit always opens with every destination visible, so wayfinding is
	// never lost to a saved click. (Persistence, if wanted, rides the rails
	// pattern — one localStorage key, same doctrine as navRail.)
	let sections = $state<Record<string, boolean>>({});
</script>

{#snippet navRows()}
	{#each groups as group (group.label)}
		{@const sectionId = `nav-section-${group.label.toLowerCase().replace(/\s+/g, '-')}`}
		<!-- Collapsible sections (owner ask — the doc's collapsible-group
		     pattern, verbatim shape): the Collapsible wraps the group, the
		     label IS the CollapsibleTrigger (a real button — keyboard-first
		     holds), and the chevron rotates off the collapsible's data-state.
		     In icon-collapse mode the block fades the label out; the trigger
		     then drops out of the tab order and AT instead of staying
		     invisible-but-focusable. -->
		<Collapsible.Root
			class="group/collapsible"
			open={!sections[group.label]}
			onOpenChange={(v) => (sections[group.label] = !v)}
		>
			<Sidebar.Group>
				<Sidebar.GroupLabel
					class="text-xs font-medium tracking-widest text-muted-foreground uppercase group-data-[collapsible=icon]:pointer-events-none"
				>
					{#snippet child({ props })}
						<!-- Svelte 5: a static class AFTER a spread CLOBBERS the spread's
						     class (proven in the dom harness — the labels lost
						     text-xs/tracking/uppercase AND the icon-mode fade). Compose
						     explicitly. -->
						<Collapsible.Trigger
							{...props}
							type="button"
							tabindex={sidebar.state === 'collapsed' ? -1 : undefined}
							aria-hidden={sidebar.state === 'collapsed'}
							aria-controls={sectionId}
							class={cn(
								props.class as string | undefined,
								'flex w-full cursor-pointer items-center justify-between gap-2 py-1 select-none hover:text-foreground'
							)}
						>
							{group.label}
							<ChevronDown
								class="size-3.5 shrink-0 transition-transform duration-150 group-data-[state=closed]/collapsible:-rotate-90"
								aria-hidden="true"
							/>
						</Collapsible.Trigger>
					{/snippet}
				</Sidebar.GroupLabel>
				<Collapsible.Content
					class="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
				>
					<Sidebar.GroupContent id={sectionId}>
						<Sidebar.Menu class="gap-1">
							{#each group.items as item (item.href)}
								{@const current = activeHref === item.href}
								<Sidebar.MenuItem>
									<!-- The anchor IS the menu button (child snippet): it receives
								     the block's data-active + the tooltip trigger. The built-in
								     tooltip replaces the hand-rolled group/tip hover-span — the
								     collapsed rail is never nameless, on hover AND focus. -->
									<Sidebar.MenuButton
										isActive={current}
										tooltipContent={item.label}
										class="gap-3 rounded-md px-3 py-2 text-sm transition-[width,height,padding,background-color,color] group-data-[collapsible=icon]:mx-auto hover:bg-accent/60 hover:text-foreground data-active:bg-transparent data-active:text-foreground {current
											? 'font-medium text-foreground'
											: 'text-muted-foreground'}"
									>
										{#snippet child({ props })}
											<a
												{...props}
												href={item.href}
												aria-label={item.label}
												aria-current={current ? 'page' : undefined}
												style={current ? wash(item.hue) : undefined}
											>
												<item.icon
													class="size-4 shrink-0"
													style={`color: ${item.hue}; opacity: ${current ? 1 : 0.72}`}
												/>
												<span>{item.label}</span>
											</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Collapsible.Content>
			</Sidebar.Group>
		</Collapsible.Root>
	{/each}
{/snippet}

<!-- Mobile-sheet chrome only (the sheet renders below lg by IsMobile):
     today's drawer paddings, verbatim — safe-area insets included. The
     pl-[max()] overrides px-4's left, as the inline style did before. -->
<Sidebar.Root
	side="left"
	variant="sidebar"
	collapsible="icon"
	onOpenChange={(open) => {
		if (!open) onMobileClose?.();
	}}
	class="max-lg:max-w-[80vw] max-lg:px-4 max-lg:pt-4 max-lg:pb-[calc(1.25rem+env(safe-area-inset-left))] max-lg:pl-[max(1rem,env(safe-area-inset-left))]"
>
	<Sidebar.Header
		class="flex h-14 flex-row items-center justify-start group-data-[state=collapsed]:justify-center"
	>
		<a
			href="/"
			class="font-brand text-2xl leading-none font-semibold tracking-tight"
			aria-label="mellon dashboard"
		>
			<span class="group-data-[state=collapsed]:hidden"
				>mellon<span class="text-brand">;</span></span
			>
			<span class="hidden group-data-[state=collapsed]:inline"
				>m<span class="text-brand">;</span></span
			>
		</a>
	</Sidebar.Header>

	<!-- Icon-mode breathing: the faded label nets zero height (h-8 +
	     -mt-8), so the first icon rides up under the brand watermark —
	     the old rail kept a 24px gap there. -->
	<Sidebar.Content class="group-data-[collapsible=icon]:pt-3">
		{@render navRows()}
	</Sidebar.Content>

	<Sidebar.Footer class="pb-6">
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<!-- The collapse toggle: the footer's last row in BOTH states (owner
				     call 2026-11-16) — one toggle, one place. The block's built-in
				     tooltip covers the collapsed state (it renders only there);
				     persistence rides the Provider's onOpenChange → navRail. -->
				<Sidebar.MenuButton
					onclick={() => sidebar.toggle()}
					tooltipContent="Expand sidebar"
					class="gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-[width,height,padding,background-color,color] group-data-[collapsible=icon]:mx-auto hover:bg-accent/60 hover:text-foreground data-active:bg-transparent data-active:text-foreground"
				>
					{#if sidebar.open}
						<PanelLeftClose class="size-4 shrink-0" />
					{:else}
						<PanelLeftOpen class="size-4 shrink-0" />
					{/if}
					<span>Collapse sidebar</span>
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>
