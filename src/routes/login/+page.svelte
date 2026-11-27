<script lang="ts">
	import { enhance } from '$app/forms';
	import { Eye, EyeOff, KeyRound, LoaderCircle } from 'lucide-svelte';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import { webauthnGet, type SerializedRequestOptions } from '#lib/webauthn.client.ts';
	import { ActionFailure, submitAction } from '#lib/action-post.ts';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let pending = $state(false);
	let passkeyBusy = $state(false);
	let passkeyMessage = $state('');
	let showPassword = $state(false);

	async function loginWithPasskey() {
		if (passkeyBusy) return;
		passkeyBusy = true;
		passkeyMessage = '';
		try {
			const begin = await submitAction<{ state: string; options: SerializedRequestOptions }>(
				'passkeyBegin',
				{ ready: '1' }
			);
			if (begin.kind !== 'data') {
				window.location.assign(begin.location);
				return;
			}
			const assertion = await webauthnGet(begin.data.options);
			const done = await submitAction<never>('passkeyFinish', {
				state: begin.data.state,
				response: JSON.stringify(assertion),
				next: data.next
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

<AuthShell title="Welcome back." subtitle="Sign in to manage the blog, the vault, and the work.">
	<!-- EVERY login method is a NAMED action: with named actions present,
	     Kit's default action is unreachable. password + passkey = named. -->
	<form
		method="POST"
		action="?/password"
		class="flex flex-col gap-4"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				pending = false;
				await update();
			};
		}}
	>
		<input type="hidden" name="next" value={data.next} />
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
				>Username</span
			>
			<Input
				type="text"
				name="username"
				required
				autocomplete="username"
				class="w-full"
				placeholder="your username"
			/>
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
				>Password</span
			>
			<span class="relative block">
				<Input
					type={showPassword ? 'text' : 'password'}
					name="password"
					required
					autocomplete="current-password"
					class="w-full pr-10"
					placeholder="your password"
				/>
				<button
					type="button"
					class="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
					aria-label={showPassword ? 'Hide password' : 'Show password'}
					aria-pressed={showPassword}
					onclick={() => (showPassword = !showPassword)}
				>
					{#if showPassword}
						<EyeOff class="size-4" aria-hidden="true" />
					{:else}
						<Eye class="size-4" aria-hidden="true" />
					{/if}
				</button>
			</span>
		</label>
		{#if form?.message}
			<p class="text-xs leading-relaxed text-danger" role="alert">{form.message}</p>
		{/if}
		<Button type="submit" variant="primary" class="mt-1 w-full justify-center" disabled={pending}>
			{#if pending}
				<LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
				<span>Signing in…</span>
				<span class="sr-only" role="status">Signing in — the session is being minted</span>
			{:else}
				Sign in
			{/if}
		</Button>
		<p class="text-center text-xs leading-relaxed text-muted-foreground/70">
			Sessions last 12 hours. Need a reset? Ask the owner for a temporary password.
		</p>
	</form>

	{#if data.methods.includes('passkey')}
		<div class="mt-5 flex flex-col gap-3">
			<div class="flex items-center gap-3" aria-hidden="true">
				<span class="h-px flex-1 bg-border"></span>
				<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
					or
				</span>
				<span class="h-px flex-1 bg-border"></span>
			</div>
			<Button
				type="button"
				variant="outline"
				class="w-full justify-center gap-2"
				disabled={passkeyBusy}
				onclick={() => void loginWithPasskey()}
			>
				{#if passkeyBusy}
					<LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
					<span>Waiting for the authenticator…</span>
				{:else}
					<KeyRound class="size-4" aria-hidden="true" />
					Sign in with a passkey
				{/if}
			</Button>
			{#if passkeyMessage}
				<p class="text-xs leading-relaxed text-danger" role="alert">{passkeyMessage}</p>
			{/if}
		</div>
	{/if}
</AuthShell>
