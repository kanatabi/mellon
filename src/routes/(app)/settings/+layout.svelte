<script lang="ts">
	import type { Snippet } from 'svelte';
	import { KeyRound, Keyboard, Palette, ShieldCheck, Users } from 'lucide-svelte';
	import { page } from '$app/state';

	/**
	 * The settings master/detail shell (2026-11-23): a section nav + slot —
	 * the ONE extendable settings shape (a new section = a child route +
	 * one nav entry; no existing file changes). The nav is the shell's own
	 * left-nav grammar, miniaturized: sticky column on lg, a horizontal
	 * chip row on mobile; the active row rides the brand tint. `USERS`
	 * LEAVES the section (it is /admin/users, its own route) — separated
	 * by a hairline, arrowed, admin-only.
	 */
	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	interface Section {
		href: string;
		label: string;
		icon: typeof Palette;
	}
	const sections: Section[] = [
		{ href: '/settings/appearance', label: 'Appearance', icon: Palette },
		{ href: '/settings/editor', label: 'Editor', icon: Keyboard },
		{ href: '/settings/security', label: 'Security', icon: ShieldCheck },
		{ href: '/settings/scopes', label: 'Scopes', icon: KeyRound }
	];
	// the USERS door is the users:manage surface (the RBAC spine): the nav
	// renders lumen's truth as affordance — lumen enforces regardless
	const admin = $derived(page.data.principal?.scopes?.includes('users:manage') ?? false);
</script>

<div class="flex flex-col gap-4 lg:flex-row lg:items-start">
	<nav
		class="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:w-52 lg:shrink-0 lg:flex-col lg:gap-1 lg:pb-0"
		aria-label="Settings sections"
	>
		{#each sections as s (s.href)}
			{@const Icon = s.icon}
			{@const active = page.url.pathname === s.href}
			<a
				href={s.href}
				aria-current={active ? 'page' : undefined}
				class="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors {active
					? 'bg-accent font-medium text-foreground'
					: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
			>
				<Icon class="size-4 {active ? 'text-brand' : 'text-muted-foreground'}" aria-hidden="true" />
				{s.label}
			</a>
		{/each}
		{#if admin}
			<span class="hidden lg:mx-1 lg:block lg:border-t lg:border-border" aria-hidden="true"></span>
			<a
				href="/admin/users"
				class="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
			>
				<Users class="size-4" aria-hidden="true" />
				Users
				<span class="ml-auto text-xs" aria-hidden="true">→</span>
			</a>
		{/if}
	</nav>
	<div class="flex min-w-0 flex-1 flex-col gap-4">
		{@render children()}
		<p class="text-xs leading-relaxed text-muted-foreground/70">
			session length is set by lumen — today a 12h TTL, re-minted on every login
		</p>
	</div>
</div>
