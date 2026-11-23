<script lang="ts">
	import { Copy, Palette, Pencil, Plus, Trash2 } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import SubCrumb from '#lib/components/SubCrumb.svelte';
	import ThemeSegmented from '#lib/components/ThemeSegmented.svelte';
	import ThemeCard from '#lib/components/ThemeCard.svelte';
	import ThemeImportDialog from '#lib/components/ThemeImportDialog.svelte';
	import ThemeRenameDialog from '#lib/components/ThemeRenameDialog.svelte';
	import Confirm from '#lib/components/Confirm.svelte';
	import { FAMILIES, THEMES, type ThemeDef } from '#lib/theme-registry.ts';
	import { setTheme, themeState } from '#lib/theme-state.svelte.ts';
	import { customThemes, deleteCustomTheme, saveCustomTheme } from '#lib/custom-themes.svelte.ts';
	import { toThemeDef, type CustomTheme } from '#lib/custom-theme.ts';
	import Button from '#lib/components/ui/button/button.svelte';

	// The APPEARANCE section (the settings master/detail split, 2026-11-23):
	// the theme work moved here verbatim — the logic is unchanged, the page
	// just stopped sharing a column with three unrelated cards. The picker
	// groups by family with section headers, never tabs.
	let importOpen = $state(false);
	let renameTarget = $state<CustomTheme | null>(null);
	let deleteTarget = $state<CustomTheme | null>(null);
	let note = $state('');

	const allThemes = $derived<ThemeDef[]>([...THEMES, ...customThemes.items.map(toThemeDef)]);
	const customById = $derived(
		new Map<string, CustomTheme>(customThemes.items.map((t) => [t.id, t]))
	);

	function imported(theme: CustomTheme) {
		saveCustomTheme(theme);
		importOpen = false;
		setTheme(theme.id);
	}

	function copyJson(theme: CustomTheme) {
		void navigator.clipboard
			.writeText(JSON.stringify(theme, null, '\t'))
			.then(() => (note = 'theme JSON copied'))
			.catch(() => (note = ''));
	}

	function renamed(name: string) {
		if (!renameTarget) return;
		saveCustomTheme({ ...renameTarget, name });
		renameTarget = null;
	}

	function deleted() {
		if (!deleteTarget) return;
		const gone = deleteTarget.id;
		deleteTarget = null;
		deleteCustomTheme(gone);
		// deleting the ACTIVE theme must not leave ghost inline vars: fall
		// back to the portal through the ONE write path (cookie rewritten).
		if (themeState.theme === gone) setTheme('portal');
	}
</script>

<svelte:head>
	<title>Appearance · settings · mellon</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<SubCrumb href="/settings" label="settings">
		<span>appearance</span>
	</SubCrumb>
	<h1 class="font-brand text-2xl font-semibold tracking-tight">Appearance</h1>

	<!-- The theme card: grouped by family (section headers, never tabs),
	     one write path (setTheme: store + cookie + View Transition). -->
	<div class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
		<div class="flex items-start justify-between gap-4">
			<span class="flex flex-col gap-1">
				<span class="text-sm font-medium">Theme</span>
				<span class="font-mono text-xs leading-relaxed text-muted-foreground">
					each card previews its light and dark palette — pick feels before you commit
				</span>
			</span>
		</div>
		<div class="flex flex-col gap-3" aria-label="Theme">
			{#each FAMILIES as f (f.family)}
				{@const group = allThemes.filter((t) => t.family === f.family)}
				{#if group.length}
					<div class="flex flex-col gap-2">
						<div>
							<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
								{f.title}
							</p>
							{#if f.hint}
								<p class="text-xs text-muted-foreground/60">{f.hint}</p>
							{/if}
						</div>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
							{#each group as t (t.id)}
								{@const custom = customById.get(t.id) as CustomTheme | undefined}
								<ThemeCard
									theme={t}
									selected={themeState.theme === t.id}
									wornMode={themeState.mode}
									onSelect={() => setTheme(t.id)}
								>
									{#snippet actions()}
										{#if custom}
											<a
												href="/settings/themes/edit/{custom.id}"
												aria-label="Edit {custom.name} in the theme editor"
												title="Edit"
												class="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
											>
												<Palette class="size-3" />
											</a>
											<button
												type="button"
												onclick={() => {
													void copyJson(custom);
												}}
												aria-label="Copy {custom.name}'s JSON"
												title="Copy JSON"
												class="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
											>
												<Copy class="size-3" />
											</button>
											<button
												type="button"
												onclick={() => (renameTarget = custom)}
												aria-label="Rename {custom.name}"
												title="Rename"
												class="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
											>
												<Pencil class="size-3" />
											</button>
											<button
												type="button"
												onclick={() => (deleteTarget = custom)}
												aria-label="Delete {custom.name}"
												title="Delete"
												class="rounded p-0.5 text-danger transition-colors hover:text-danger"
											>
												<Trash2 class="size-3" />
											</button>
										{:else}
											<a
												href="/settings/themes/edit/new?fork={t.id}"
												aria-label="Fork {t.name} into a new theme"
												title="Fork this theme"
												class="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
											>
												<Palette class="size-3" />
											</a>
										{/if}
									{/snippet}
								</ThemeCard>
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		</div>
		{#if note}
			<p class="font-mono text-xs text-brand" role="status" transition:fade={{ duration: 150 }}>
				{note}
			</p>
		{/if}
		<div class="flex items-center justify-between gap-4 border-t border-border pt-3">
			<div class="flex items-center gap-2">
				<Button type="button" variant="quiet" onclick={() => (importOpen = true)}>
					<Plus class="size-3.5" />
					Import a theme…
				</Button>
				<Button type="button" variant="quiet" onclick={() => goto('/settings/themes/edit/new')}>
					<Palette class="size-3.5" />
					New theme
				</Button>
			</div>
			<ThemeSegmented />
		</div>
	</div>

	{#if importOpen}
		<ThemeImportDialog onImported={imported} onClose={() => (importOpen = false)} />
	{/if}
	{#if renameTarget}
		<ThemeRenameDialog
			current={renameTarget.name}
			onSave={renamed}
			onClose={() => (renameTarget = null)}
		/>
	{/if}
	{#if deleteTarget}
		<Confirm
			heading={'Delete the theme "' + deleteTarget.name + '"?'}
			description="it lives only in THIS browser (localStorage) — the copy JSON button is the backup"
			confirmLabel="Delete theme"
			onConfirm={deleted}
			onClose={() => (deleteTarget = null)}
		/>
	{/if}
</section>
