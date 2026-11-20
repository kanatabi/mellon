<script lang="ts">
	import { enhance } from '$app/forms';
	import { LoaderCircle } from 'lucide-svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { toggleTheme, themeState } from '#lib/theme-state.svelte.ts';
	import type { ActionData } from './$types';

	interface Props {
		form: ActionData;
	}

	let { form }: Props = $props();

	// The gate's progress indicator (owner ask 2026-11-21): the submit round
	// trip (lumen mints the session) previously showed NOTHING. The spinner
	// rides the enhance lifecycle; the button disables so a second Enter
	// can't double-mint.
	let pending = $state(false);
</script>

<svelte:head>
	<title>Sign in · mellon</title>
</svelte:head>

<section
	class="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6"
>
	<!-- The login is the portal's brand moment: a soft brand aura behind the
	     gate. This is the ONE sanctioned radial (§11.3 exception, owner
	     decision 2026-11-08) — all other chrome stays flat. -->
	<div class="login-aura" aria-hidden="true"></div>
	<div class="absolute top-4 right-4 z-10">
		<ThemeToggle theme={themeState.theme} onToggle={toggleTheme} />
	</div>
	<h1 class="relative font-brand text-4xl font-semibold tracking-tight">
		Speak, friend, and enter
	</h1>
	<form
		method="POST"
		class="relative flex w-full max-w-sm flex-col gap-4"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				pending = false;
				await update();
			};
		}}
	>
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
				>username</span
			>
			<input
				type="text"
				name="username"
				required
				autocomplete="username"
				class="rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-brand"
			/>
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
				>password</span
			>
			<input
				type="password"
				name="password"
				required
				autocomplete="current-password"
				class="rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-brand"
			/>
		</label>
		{#if form?.message}
			<p class="font-mono text-xs text-danger" role="alert">{form.message}</p>
		{/if}
		<button
			type="submit"
			disabled={pending}
			class="flex items-center justify-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-70"
		>
			{#if pending}
				<LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
				<span>Entering…</span>
				<span class="sr-only" role="status">Signing in — the session is being minted</span>
			{:else}
				Enter
			{/if}
		</button>
		<p class="text-center font-mono text-[10px] text-muted-foreground/70">
			sessions are minted by lumen — the portal only carries the cookie
		</p>
	</form>
</section>
