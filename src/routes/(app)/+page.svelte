<script lang="ts">
	import { Plus, SquarePlus } from 'lucide-svelte';
	import DashboardGrid from '#lib/dashboard/DashboardGrid.svelte';
	import WidgetPicker from '#lib/dashboard/WidgetPicker.svelte';
	import { dashboardLayout } from '#lib/dashboard/dashboard.svelte.ts';
	import { WIDGETS, widgetHeld } from '#lib/dashboard/widgets/registry.ts';
	import { page } from '$app/state';

	// The dashboard is the USER'S HOME (the widget-home round): it dials NO
	// scoped API in its load — each widget body fetches its own data and
	// only mounts when the principal holds its scope. A scope-less user's
	// home is this page with the empty-state hint, never an error page.
	const held = (scope?: string) =>
		scope ? (page.data.principal?.scopes?.includes(scope) ?? false) : true;

	// placed-or-absent (Round D): the canvas holds only placed widgets;
	// the picker owns availability — delete removes, re-add restores at
	// a free slot.
	let pickerOpen = $state(false);

	const anyPlaced = $derived(dashboardLayout.entries.length > 0);
	const anyAvailable = $derived(WIDGETS.some((w) => widgetHeld(w, held)));

	$effect(() => {
		dashboardLayout.init(page.data.principal?.username ?? 'owner', WIDGETS, held);
	});
</script>

<svelte:head>
	<title>Dashboard · mellon</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
		<h1 class="font-brand text-4xl font-semibold tracking-tight">Dashboard</h1>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => (pickerOpen = true)}
				class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium whitespace-nowrap text-foreground transition-colors hover:border-brand sm:px-4"
			>
				<SquarePlus class="size-4" /> Add Widget
			</button>
			<a
				href="/posts/new"
				class="flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground transition-colors hover:bg-brand/90 sm:px-4"
			>
				<Plus class="size-4" /> New Post
			</a>
		</div>
	</div>

	{#if !anyAvailable}
		<!-- the quiet degradation (the RBAC spine): a scope-less account's
		     home explains itself instead of erroring -->
		<div class="rounded-lg border border-border bg-card p-6 text-center">
			<p class="text-sm text-foreground">Your dashboard is waiting on widgets.</p>
			<p class="mt-2 font-mono text-xs text-muted-foreground">
				your account has no app access yet — ask an administrator to grant you scopes, and your
				widgets will appear here.
			</p>
		</div>
	{:else if !anyPlaced}
		<!-- an emptied canvas (the placed-or-absent model): the picker is
		     the door back -->
		<div class="rounded-lg border border-border bg-card p-6 text-center">
			<p class="text-sm text-foreground">Your canvas is empty.</p>
			<p class="mt-2 font-mono text-xs text-muted-foreground">
				add widgets from the panel — they land at the first free slot
			</p>
			<button
				type="button"
				onclick={() => (pickerOpen = true)}
				class="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand/90"
			>
				Add Widget
			</button>
		</div>
	{:else}
		<DashboardGrid
			registry={WIDGETS}
			entries={dashboardLayout.view}
			{held}
			onDelete={(id) => dashboardLayout.delete(id)}
			onNudge={(id, dx, dy) => dashboardLayout.nudge(id, dx, dy, WIDGETS)}
			onSpanApply={(id, w, h) => dashboardLayout.setSpan(id, w, h, WIDGETS)}
			onDragMove={(id, x, y) => dashboardLayout.previewPosition(id, x, y, WIDGETS)}
			onDragEnd={(id, x, y) => dashboardLayout.setPosition(id, x, y, WIDGETS)}
			onDragCancel={() => dashboardLayout.clearPreview()}
		/>
	{/if}

	<p class="font-mono text-[10px] text-muted-foreground/70">
		⌘K opens the command palette from anywhere · drag the header to place · Alt+arrows on a focused
		card
	</p>
</section>

<WidgetPicker
	registry={WIDGETS}
	placedIds={dashboardLayout.entries.map((e) => e.id)}
	{held}
	open={pickerOpen}
	onClose={() => (pickerOpen = false)}
	onAdd={(ids) => dashboardLayout.addMany(ids, WIDGETS)}
/>
