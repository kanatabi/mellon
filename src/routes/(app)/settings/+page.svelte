<script lang="ts">
	import { Moon, ShieldCheck, Sun, Users } from 'lucide-svelte';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { fade } from 'svelte/transition';
	import { setTheme, themeState } from '#lib/theme-state.svelte.ts';
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
</script>

<svelte:head>
	<title>Settings · mellon</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-xl flex-col gap-6 py-4">
	<h1 class="font-brand text-4xl font-semibold tracking-tight">Settings</h1>

	<!-- Appearance: the theme, where it belongs — a setting, not only a
	     topbar control. One write path (setTheme: store + cookie +
	     View Transition) shared with the topbar toggle and the palette. -->
	<div class="flex flex-col gap-4">
		<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
			Appearance
		</p>
		<div class="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
			<span class="flex flex-col gap-1">
				<span class="text-sm font-medium">Theme</span>
				<span class="font-mono text-xs leading-relaxed text-muted-foreground">
					light or dark, flipped with a crossfade and persisted via the theme cookie — instant on
					every surface
				</span>
			</span>
			<div
				class="flex shrink-0 gap-1 rounded-full border border-border bg-card p-1"
				role="radiogroup"
				aria-label="Theme"
			>
				<button
					type="button"
					role="radio"
					aria-checked={themeState.theme === 'light'}
					onclick={() => setTheme('light')}
					class="flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-colors {themeState.theme ===
					'light'
						? 'bg-brand/15 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<Sun class="size-3.5" />
					Light
				</button>
				<button
					type="button"
					role="radio"
					aria-checked={themeState.theme === 'dark'}
					onclick={() => setTheme('dark')}
					class="flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-colors {themeState.theme ===
					'dark'
						? 'bg-brand/15 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<Moon class="size-3.5" />
					Dark
				</button>
			</div>
		</div>
	</div>

	<form
		method="POST"
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
			<button
				type="submit"
				class="w-fit rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
			>
				Save
			</button>
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
				<input
					type="password"
					name="current"
					required
					autocomplete="current-password"
					class="rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-brand"
				/>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
					>new password</span
				>
				<input
					type="password"
					name="next"
					required
					minlength={10}
					autocomplete="new-password"
					class="rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-brand"
				/>
			</label>
			<label class="flex flex-col gap-1.5">
				<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
					>confirm</span
				>
				<input
					type="password"
					name="confirm"
					required
					minlength={10}
					autocomplete="new-password"
					class="rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-brand"
				/>
			</label>
		</div>
		{#if form?.pw && !form.pw.ok}
			<p class="font-mono text-xs text-danger" role="alert">{form.pw.message}</p>
		{:else if form?.pw?.ok}
			<p class="font-mono text-xs text-brand" role="status">
				{form.pw.loginAgain ? 'Password updated — sign in again to continue.' : 'Password updated.'}
			</p>
		{/if}
		<button
			type="submit"
			class="w-fit rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
		>
			Update password
		</button>
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
