<script lang="ts">
	// The account surface (owner call 2026-11-16), ported onto ui/dropdown-menu
	// (S2.8): one avatar in the top bar, one menu — GitHub grammar. Identity,
	// Settings, theme, and sign-out live here. The block brings the contract
	// for free: Esc / click-outside / focus-return-to-trigger, roving focus,
	// typeahead; every row stays a real button or link — keyboard-first holds,
	// nothing hover-gated.
	import { LogOut, Settings } from 'lucide-svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import ThemeSegmented from '#lib/components/ThemeSegmented.svelte';

	interface Props {
		principal: { username: string; role: 'admin' | 'editor' };
	}

	let { principal }: Props = $props();

	const initial = $derived(principal.username.slice(0, 1).toUpperCase());
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label="Account menu for {principal.username}"
		class="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-brand/15 font-mono text-xs font-bold text-brand uppercase transition-colors hover:bg-brand/25"
	>
		{initial}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content side="bottom" align="end" class="w-64 rounded-lg border border-border p-2">
		<!-- The account card: the identity, at a size you can read — the footer
		     dot this replaces was size-4. -->
		<div class="flex items-center gap-3 px-2 py-2" data-slot="account-card">
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

		<DropdownMenu.Separator class="my-1 border-t border-border/70" />

		<DropdownMenu.Item
			class="gap-3 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground focus:bg-accent/60 focus:text-foreground"
		>
			{#snippet child({ props })}
				<a {...props} href="/settings" class="flex w-full items-center gap-3">
					<Settings class="size-4 shrink-0" />
					Settings
				</a>
			{/snippet}
		</DropdownMenu.Item>

		<div class="px-2 py-2">
			<ThemeSegmented />
		</div>

		<DropdownMenu.Separator class="my-1 border-t border-border/70" />

		<!-- Same POST /logout the old hand-rolled menu carried — moved, not
		     re-invented: the session revocation is lumen's truth. The child
		     snippet makes the ITEM the submit button (bits-ui composition). -->
		<form method="POST" action="/logout">
			<DropdownMenu.Item
				variant="destructive"
				class="gap-3 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-danger/10 hover:text-danger focus:bg-danger/10 focus:text-danger data-[variant=destructive]:text-muted-foreground"
			>
				{#snippet child({ props })}
					<button {...props} type="submit" class="flex w-full items-center gap-3">
						<LogOut class="size-4 shrink-0" />
						Sign out
					</button>
				{/snippet}
			</DropdownMenu.Item>
		</form>
	</DropdownMenu.Content>
</DropdownMenu.Root>
