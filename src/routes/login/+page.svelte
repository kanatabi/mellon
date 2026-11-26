<script lang="ts">
	import { enhance } from '$app/forms';
	import { LoaderCircle } from 'lucide-svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { toggleMode, themeState } from '#lib/theme-state.svelte.ts';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import { webauthnGet } from '#lib/webauthn.client.ts';
	import { KeyRound } from 'lucide-svelte';
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
	// the PASSKEY login (the auth-method seam): begin -> the browser's
	// WebAuthn ceremony -> finish. The server relays and mints; the
	// private key never leaves the authenticator (Bitwarden/iCloud/a key).
	let passkeyBusy = $state(false);
	let passkeyMessage = $state('');

	async function loginWithPasskey() {
		if (passkeyBusy) return;
		passkeyBusy = true;
		passkeyMessage = '';
		try {
			// Kit v3 actions speak FORM content types only (application/json
			// is 415-refused) — the ceremony's payload rides urlencoded
			// fields (the response JSON stringified inside its field)
			const beginRes = await fetch('?/passkeyBegin', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ ready: '1' })
			});
			if (!beginRes.ok) {
				const err = await beginRes.json().catch(() => ({ message: 'passkeys unavailable' }));
				throw new Error(err.message ?? 'passkeys unavailable');
			}
			const begin = await beginRes.json();
			const assertion = await webauthnGet(begin.options);
			const finishRes = await fetch('?/passkeyFinish', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					state: begin.state,
					response: JSON.stringify(assertion)
				})
			});
			if (!finishRes.ok) {
				const err = await finishRes.json().catch(() => ({ message: 'passkey login failed' }));
				throw new Error(err.message ?? 'passkey login failed');
			}
			const out = await finishRes.json();
			// the cookie is already set server-side; the destination mirrors
			// the password login's (must_change goes to the guided change)
			window.location.assign(out.mustChange ? '/setup?change=1' : '/');
		} catch (err) {
			passkeyMessage = err instanceof Error && err.message ? err.message : 'passkey login failed';
		} finally {
			passkeyBusy = false;
		}
	}
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
		<ThemeToggle mode={themeState.mode} onToggle={toggleMode} />
	</div>
	<h1 class="relative font-brand text-4xl font-semibold tracking-tight">
		Speak, friend, and enter
	</h1>
	<!-- EVERY login method is a NAMED action: with named actions
	     present, Kit's default action is unreachable
	     (action_default_with_named — hit twice: un-named, then
	     ?/default). password + passkey + (later) oauth = named. -->
	<form
		method="POST"
		action="?/password"
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
			<Input type="text" name="username" required autocomplete="username" />
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
				>password</span
			>
			<Input type="password" name="password" required autocomplete="current-password" />
		</label>
		{#if form?.message}
			<p class="font-mono text-xs text-danger" role="alert">{form.message}</p>
		{/if}
		<Button type="submit" variant="primary" disabled={pending}>
			{#if pending}
				<LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
				<span>Entering…</span>
				<span class="sr-only" role="status">Signing in — the session is being minted</span>
			{:else}
				Enter
			{/if}
		</Button>
		<p class="text-center font-mono text-[10px] text-muted-foreground/70">
			sessions are minted by lumen — the portal only carries the cookie
		</p>
	</form>
	<!-- the passkey door: begin/finish through the form actions, the
	     ceremony in the browser — the private key never leaves home -->
	<div class="relative flex w-full max-w-sm flex-col gap-2">
		<Button
			type="button"
			variant="outline"
			disabled={passkeyBusy}
			onclick={() => void loginWithPasskey()}
		>
			{#if passkeyBusy}
				<LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
				<span>Waiting for the authenticator…</span>
			{:else}
				<KeyRound class="size-4" aria-hidden="true" />
				Login with passkey
			{/if}
		</Button>
		{#if passkeyMessage}
			<p class="font-mono text-xs text-danger" role="alert">{passkeyMessage}</p>
		{/if}
	</div>
</section>
