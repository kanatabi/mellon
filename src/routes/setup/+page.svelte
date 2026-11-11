<script lang="ts">
	import { enhance } from '$app/forms';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { toggleTheme, themeState } from '#lib/theme-state.svelte.ts';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	const registering = $derived(data.mode === 'register');
</script>

<svelte:head>
	<title>{registering ? 'Claim the estate' : 'Set your password'} · mellon</title>
</svelte:head>

<section
	class="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6"
>
	<!-- same sanctioned brand aura as /login (§11.3 exception) — the wizard IS
	     the gate's first impression, it earns the same staging -->
	<div class="login-aura" aria-hidden="true"></div>
	<div class="absolute top-4 right-4 z-10">
		<ThemeToggle theme={themeState.theme} onToggle={toggleTheme} />
	</div>
	<div class="flex flex-col items-center gap-1.5">
		<h1 class="relative font-brand text-4xl font-semibold tracking-tight">
			{registering ? 'No one rules this estate yet' : 'One more thing: your own password'}
		</h1>
		<p class="relative max-w-sm text-center text-sm text-muted-foreground">
			{#if registering}
				Create the first admin. This door locks behind you — it can never open again.
			{:else}
				Hello {data.username} — you arrived with a temporary password. Set your own and the door opens
				normally from here on.
			{/if}
		</p>
	</div>
	<form
		method="POST"
		class="relative flex w-full max-w-sm flex-col gap-4"
		use:enhance={() => {
			return ({ update }) => update();
		}}
	>
		<input type="hidden" name="mode" value={data.mode} />
		<input type="hidden" name="username" value={data.username} />
		{#if !registering}
			<label class="flex flex-col gap-1.5">
				<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
					>current (temporary) password</span
				>
				<input
					type="password"
					name="current"
					required
					autocomplete="current-password"
					class="rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-brand"
				/>
			</label>
		{:else}
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
		{/if}
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
				>{registering ? 'password' : 'new password'}</span
			>
			<input
				type="password"
				name="password"
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
		{#if form?.message}
			<p class="font-mono text-xs text-danger" role="alert">{form.message}</p>
		{/if}
		<button
			type="submit"
			class="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
		>
			{registering ? 'claim the estate' : 'set my password'}
		</button>
		<p class="text-center font-mono text-[10px] text-muted-foreground/70">
			lumen decides every rule this form can break — the portal just renders it
		</p>
	</form>
</section>

<style>
	/* the aura rule lives with the login page's §11.3 exception */
	.login-aura {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			60% 50% at 50% 40%,
			color-mix(in oklab, var(--brand) 14%, transparent),
			transparent
		);
		pointer-events: none;
	}
</style>
