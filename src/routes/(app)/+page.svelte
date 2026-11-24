<script lang="ts">
	import { Plus } from 'lucide-svelte';
	import DashboardGrid from '#lib/dashboard/DashboardGrid.svelte';
	import { dashboardLayout } from '#lib/dashboard/dashboard.svelte.ts';
	import { WIDGETS } from '#lib/dashboard/widgets/registry.ts';
	import { page } from '$app/state';

	// The dashboard is the USER'S HOME (the widget-home round): it dials NO
	// scoped API in its load — each widget body fetches its own data and
	// only mounts when the principal holds its scope. A scope-less user's
	// home is this page with the empty-state hint, never an error page.
	const held = (scope: string) => page.data.principal?.scopes?.includes(scope) ?? false;

	const available = $derived(
		WIDGETS.filter((w) => !w.scope || held(w.scope) || dashboardLayout.isHidden(w.id))
	);
	const unplaced = $derived(
		available.filter((w) => !dashboardLayout.entries.some((e) => e.id === w.id))
	);
	const unhiddenAvailable = $derived(available.filter((w) => dashboardLayout.isHidden(w.id)));
	const nothingAvailable = $derived(available.length === 0);

	$effect(() => {
		dashboardLayout.init(page.data.principal?.username ?? 'owner', WIDGETS);
	});
</script>

<svelte:head>
	<title>Dashboard · mellon</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div class="flex items-end justify-between gap-4">
		<h1 class="font-brand text-4xl font-semibold tracking-tight">Dashboard</h1>
		<a
			href="/posts/new"
			class="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
		>
			<Plus class="size-4" /> New Post
		</a>
	</div>

	{#if nothingAvailable}
		<!-- the quiet degradation (the RBAC spine): a scope-less account's
		     home explains itself instead of erroring -->
		<div class="rounded-lg border border-border bg-card p-6 text-center">
			<p class="text-sm text-foreground">Your dashboard is waiting on widgets.</p>
			<p class="mt-2 font-mono text-xs text-muted-foreground">
				your account has no app access yet — ask an administrator to grant you scopes, and your
				widgets will appear here.
			</p>
		</div>
	{:else}
		<DashboardGrid
			registry={WIDGETS}
			entries={dashboardLayout.view}
			{held}
			onToggleHidden={(id) => dashboardLayout.toggleHidden(id)}
			onNudge={(id, dx, dy) => dashboardLayout.nudge(id, dx, dy, WIDGETS)}
			onSpanApply={(id, w, h) => dashboardLayout.setSpan(id, w, h, WIDGETS)}
			onDragMove={(id, x, y) => dashboardLayout.previewPosition(id, x, y, WIDGETS)}
			onDragEnd={(id, x, y) => dashboardLayout.setPosition(id, x, y, WIDGETS)}
			onDragCancel={() => dashboardLayout.clearPreview()}
		/>

		{#if unhiddenAvailable.length || unplaced.length}
			<!-- the tray: unpinned + not-yet-placed widgets, one click back -->
			<div class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
				<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
					available widgets
				</span>
				{#each [...unplaced, ...unhiddenAvailable] as w (w.id)}
					<button
						type="button"
						onclick={() => dashboardLayout.toggleHidden(w.id)}
						class="rounded-full border border-border px-3 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
					>
						{unplaced.includes(w) ? `+ ${w.title}` : w.title}
					</button>
				{/each}
			</div>
		{/if}
	{/if}

	<p class="font-mono text-[10px] text-muted-foreground/70">
		⌘K opens the command palette from anywhere · drag the header to place · Alt+arrows on a focused
		card
	</p>
</section>
