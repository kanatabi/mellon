<script lang="ts">
	import type { Principal } from '#lib/api/types.ts';
	// The account surface (owner redesign 2026-11-28): an identity pill in the
	// top bar opens a grouped, icon-led menu. Structure only — Profile, Devices
	// and OTP/authenticator will slot into ACCOUNT/Security when they exist;
	// no fake plan/billing/switch-account rows. DropdownMenu keeps Esc,
	// roving focus, typeahead and focus-return-to-trigger.
	import {
		ChevronDown,
		ChevronRight,
		LogOut,
		Palette,
		Settings2,
		ShieldCheck,
		SunMoon
	} from 'lucide-svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import ThemeSegmented from '#lib/components/ThemeSegmented.svelte';
	import { cn } from '#lib/utils.js';

	interface Props {
		principal: Principal;
	}

	let { principal }: Props = $props();

	const initial = $derived(principal.username.slice(0, 1).toUpperCase());
	const scopeTitle = $derived(principal.scopes.join(' · '));
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label="Account menu for {principal.username}"
		class="flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-card p-1 transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none sm:pr-2.5"
	>
		<span
			aria-hidden="true"
			class="grid size-7 shrink-0 place-items-center rounded-full bg-brand/15 font-mono text-[11px] font-bold text-brand uppercase"
		>
			{initial}
		</span>
		<span class="hidden max-w-32 truncate text-xs font-medium text-foreground sm:block">
			{principal.username}
		</span>
		<ChevronDown
			class="hidden size-3.5 shrink-0 text-muted-foreground sm:block"
			aria-hidden="true"
		/>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content side="bottom" align="end" class="w-[17rem] rounded-xl p-1.5">
		<!-- The identity header: avatar + name + the one line that is always
		     true. The scope list is a tooltip, not a micro-mono wall. -->
		<div class="flex items-center gap-3 px-2.5 py-2.5" data-slot="account-card">
			<span
				aria-hidden="true"
				class="grid size-9 shrink-0 place-items-center rounded-full bg-brand/15 font-mono text-sm font-bold text-brand uppercase"
			>
				{initial}
			</span>
			<span class="min-w-0" title={scopeTitle}>
				<span class="block truncate text-sm font-semibold text-foreground">
					{principal.username}
				</span>
				<span class="block truncate text-[11px] text-muted-foreground">Estate console</span>
			</span>
		</div>

		<DropdownMenu.Separator class="my-1 border-t border-border/70" />

		<DropdownMenu.Label
			class="px-2.5 pt-1.5 pb-1 text-[10px] tracking-widest text-muted-foreground/60 uppercase"
		>
			Account
		</DropdownMenu.Label>

		<DropdownMenu.Item
			class="gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-accent/60 hover:text-foreground focus:bg-accent/60 focus:text-foreground"
		>
			{#snippet child({ props })}
				<a
					{...props}
					href="/settings"
					class={cn(props.class as string | undefined, 'flex w-full items-center gap-2.5')}
				>
					<Settings2 class="size-4 shrink-0" aria-hidden="true" />
					Settings
					<ChevronRight
						class="ml-auto size-3.5 shrink-0 text-muted-foreground/50"
						aria-hidden="true"
					/>
				</a>
			{/snippet}
		</DropdownMenu.Item>

		<DropdownMenu.Item
			class="gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-accent/60 hover:text-foreground focus:bg-accent/60 focus:text-foreground"
		>
			{#snippet child({ props })}
				<a
					{...props}
					href="/settings/security"
					class={cn(props.class as string | undefined, 'flex w-full items-center gap-2.5')}
				>
					<ShieldCheck class="size-4 shrink-0" aria-hidden="true" />
					Security
					<ChevronRight
						class="ml-auto size-3.5 shrink-0 text-muted-foreground/50"
						aria-hidden="true"
					/>
				</a>
			{/snippet}
		</DropdownMenu.Item>

		<DropdownMenu.Separator class="my-1 border-t border-border/70" />

		<DropdownMenu.Label
			class="px-2.5 pt-1.5 pb-1 text-[10px] tracking-widest text-muted-foreground/60 uppercase"
		>
			Preferences
		</DropdownMenu.Label>

		<DropdownMenu.Item
			class="gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-accent/60 hover:text-foreground focus:bg-accent/60 focus:text-foreground"
		>
			{#snippet child({ props })}
				<a
					{...props}
					href="/settings/appearance"
					class={cn(props.class as string | undefined, 'flex w-full items-center gap-2.5')}
				>
					<Palette class="size-4 shrink-0" aria-hidden="true" />
					Appearance
					<ChevronRight
						class="ml-auto size-3.5 shrink-0 text-muted-foreground/50"
						aria-hidden="true"
					/>
				</a>
			{/snippet}
		</DropdownMenu.Item>

		<!-- The mode control is NOT a menu item: it acts in place. The full
		     theme grid lives behind Appearance. -->
		<div class="flex items-center justify-between gap-2 px-2.5 py-1.5">
			<span class="flex items-center gap-2.5 text-[13px] text-muted-foreground">
				<SunMoon class="size-4 shrink-0" aria-hidden="true" />
				Theme
			</span>
			<ThemeSegmented />
		</div>

		<DropdownMenu.Separator class="my-1 border-t border-border/70" />

		<!-- Same POST /logout the old menu carried — the session revocation is
		     lumen's truth. The child snippet makes the ITEM the submit button. -->
		<form method="POST" action="/logout">
			<DropdownMenu.Item
				variant="destructive"
				class="gap-2.5 rounded-md px-2.5 py-2 text-[13px] hover:bg-danger/10 focus:bg-danger/10"
			>
				{#snippet child({ props })}
					<button
						{...props}
						type="submit"
						class={cn(props.class as string | undefined, 'flex w-full items-center gap-2.5')}
					>
						<LogOut class="size-4 shrink-0" aria-hidden="true" />
						Sign out
					</button>
				{/snippet}
			</DropdownMenu.Item>
		</form>
	</DropdownMenu.Content>
</DropdownMenu.Root>
