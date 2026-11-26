<script lang="ts">
	import { enhance } from '$app/forms';
	import { LoaderCircle } from 'lucide-svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { toggleMode, themeState } from '#lib/theme-state.svelte.ts';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import { webauthnGet, type SerializedRequestOptions } from '#lib/webauthn.client.ts';
	import { ActionFailure, submitAction } from '#lib/action-post.ts';
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
			// the action envelope is NOT the action's return value — unwrap it
			// in ONE place (src/lib/action-post.ts); reading `begin.options`
			// off the envelope crashed the register twin the same way
			const begin = await submitAction<{ state: string; options: SerializedRequestOptions }>(
				'passkeyBegin',
				{ ready: '1' }
			);
			if (begin.kind !== 'data') {
				window.location.assign(begin.location);
				return;
			}
			const assertion = await webauthnGet(begin.data.options);
			// the cookie is already set server-side; the destination is the
			// SERVER's call (must_change goes to the guided change, `next`
			// returns where the session bounced from) — a redirect envelope
			// carries it, never a guessed '/'
			const done = await submitAction<never>('passkeyFinish', {
				state: begin.data.state,
				response: JSON.stringify(assertion)
			});
			window.location.assign(done.kind === 'redirect' ? done.location : '/');
		} catch (err) {
			const fail = err instanceof ActionFailure ? (err.data as { message?: string }) : null;
			passkeyMessage =
				fail?.message ??
				(err instanceof Error && err.message ? err.message : 'passkey login failed');
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
