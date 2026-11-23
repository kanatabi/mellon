<script lang="ts">
	import { Copy, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-svelte';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { fade } from 'svelte/transition';
	import ThemeSegmented from '#lib/components/ThemeSegmented.svelte';
	import ThemeCard from '#lib/components/ThemeCard.svelte';
	import ThemeImportDialog from '#lib/components/ThemeImportDialog.svelte';
	import ThemeRenameDialog from '#lib/components/ThemeRenameDialog.svelte';
	import Confirm from '#lib/components/Confirm.svelte';
	import { THEMES, type ThemeDef } from '#lib/theme-registry.ts';
	import { setTheme, themeState } from '#lib/theme-state.svelte.ts';
	import { customThemes, deleteCustomTheme, saveCustomTheme } from '#lib/custom-themes.svelte.ts';
	import { toThemeDef, type CustomTheme } from '#lib/custom-theme.ts';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	// svelte-ignore state_referenced_locally
	let vim = $state(data.vim);
	let saved = $state(false);

	// No resync effect needed: with reset:false the checkbox already carries
	// what the action wrote — the refreshed load can only echo it.

	// ── the theme grid (the theming round 2): built-ins + localStorage
	// customs, ONE list. The customs carry the manage row (copy/rename/
	// delete); deleting the ACTIVE theme falls back to the portal.
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
	<title>Settings · mellon</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-xl flex-col gap-6 py-4">
	<h1 class="font-brand text-4xl font-semibold tracking-tight">Settings</h1>

	<!-- Appearance: the theme, where it belongs — a setting. The THEME is
	     the card grid (each card a dual-pane mini-mockup painted with the
	     theme's own tokens); the MODE is the segmented control shared with
	     the account menu. One write path (setTheme: store + cookie + View
	     Transition) shared with the palette. -->
	<div class="flex flex-col gap-4">
		<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
			Appearance
		</p>
		<div class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
			<div class="flex items-start justify-between gap-4">
				<span class="flex flex-col gap-1">
					<span class="text-sm font-medium">Theme</span>
					<span class="font-mono text-xs leading-relaxed text-muted-foreground">
						each card previews its light and dark palette — pick feels before you commit
					</span>
				</span>
			</div>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Theme">
				{#each allThemes as t (t.id)}
					{@const custom = customById.get(t.id) as CustomTheme | undefined}
					<ThemeCard theme={t} selected={themeState.theme === t.id} onSelect={() => setTheme(t.id)}>
						{#snippet actions()}
							{#if custom}
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
							{/if}
						{/snippet}
					</ThemeCard>
				{/each}
			</div>
			{#if note}
				<p class="font-mono text-xs text-brand" role="status" transition:fade={{ duration: 150 }}>
					{note}
				</p>
			{/if}
			<div class="flex items-center justify-between gap-4 border-t border-border pt-3">
				<Button type="button" variant="quiet" onclick={() => (importOpen = true)}>
					<Plus class="size-3.5" />
					Import a theme…
				</Button>
				<ThemeSegmented />
			</div>
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

	<form
		method="POST"
		action="?/vim"
		class="flex flex-col gap-4"
		use:enhance={() => {
			saved = false;
			return async ({ update }) => {
				// reset:false — SvelteKit resets form elements after a successful
				// action by default; that reset, NOT the cookie, is what made the
				// vim toggle snap back unchecked right after saving.
				await update({ reset: false });
				saved = true;
				setTimeout(() => (saved = false), 2500);
			};
		}}
	>
		<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">editor</p>
		<label
			class="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4"
		>
			<span class="flex flex-col gap-1">
				<span class="text-sm font-medium">Vim keybindings</span>
				<span class="font-mono text-xs leading-relaxed text-muted-foreground">
					modal editing in the post editor (normal/insert), desktop viewports only — auto-off below
					lg, where touch editing gets plain mode. IME note: pause vim if you type with an input
					method
				</span>
			</span>
			<input
				type="checkbox"
				name="vim"
				value="1"
				class="mt-1 size-5 accent-[var(--brand)]"
				bind:checked={vim}
			/>
		</label>
		<div class="flex items-center gap-3">
			<Button type="submit" variant="primary" class="w-fit active:scale-[0.98]">Save</Button>
			{#if saved}
				<p class="font-mono text-xs text-brand" role="status" transition:fade={{ duration: 180 }}>
					Saved
				</p>
			{/if}
		</div>
	</form>

	<!-- Security: the voluntary sibling of the wizard's forced change — same
	     server flow (performPasswordChange re-mints the session lumen revoked),
	     different door. -->
	<form
		method="POST"
		action="?/password"
		class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
		use:enhance={() => {
			return ({ update }) => update();
		}}
	>
		<div class="flex items-start justify-between gap-4">
			<span class="flex flex-col gap-1">
				<span class="flex items-center gap-2 text-sm font-medium">
					<ShieldCheck class="size-4 text-muted-foreground" aria-hidden="true" />
					Password
				</span>
				<span class="font-mono text-[10px] text-muted-foreground"
					>changing it signs out every device (lumen revokes on write) — you stay signed in here</span
				>
			</span>
		</div>
		<input type="hidden" name="username" value={data.account?.username ?? ''} />
		<div class="flex flex-col gap-3">
			<label class="flex flex-col gap-1.5">
				<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
					>current password</span
				>
				<Input type="password" name="current" required autocomplete="current-password" />
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
					>new password</span
				>
				<Input type="password" name="next" required minlength={10} autocomplete="new-password" />
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
					>confirm</span
				>
				<Input type="password" name="confirm" required minlength={10} autocomplete="new-password" />
			</label>
		</div>
		{#if form?.pw && !form.pw.ok}
			<p class="font-mono text-xs text-danger" role="alert">{form.pw.message}</p>
		{:else if form?.pw?.ok}
			<p class="font-mono text-xs text-brand" role="status">
				{form.pw.loginAgain ? 'Password updated — sign in again to continue.' : 'Password updated.'}
			</p>
		{/if}
		<Button type="submit" variant="primary" class="w-fit active:scale-[0.98]"
			>Update password</Button
		>
	</form>

	{#if page.data.principal?.role === 'admin'}
		<a
			href="/admin/users"
			class="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand/60"
		>
			<span class="flex flex-col gap-1">
				<span class="flex items-center gap-2 text-sm font-medium">
					<Users class="size-4 text-muted-foreground" aria-hidden="true" />
					Users
				</span>
				<span class="font-mono text-[10px] text-muted-foreground"
					>add people (server-issued temp passwords), reset access</span
				>
			</span>
			<span aria-hidden="true" class="text-muted-foreground">→</span>
		</a>
	{/if}

	<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
		session length is set by lumen — today a 12h TTL, re-minted on every login
	</p>
</section>
