<script lang="ts">
	import { ShieldCheck, KeyRound, Trash2, LoaderCircle } from 'lucide-svelte';
	import SubCrumb from '#lib/components/SubCrumb.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { webauthnCreate } from '#lib/webauthn.client.ts';
	import { AdminApiError } from '#lib/api/types.ts';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	// the PASSKEY registration (the auth-method seam): begin (authed via
	// the session cookie) -> the browser's WebAuthn ceremony -> finish.
	// The private key never leaves the authenticator; the server stores
	// the public half. The roster refreshes via invalidateAll.
	let registering = $state(false);
	let pkMessage = $state('');
	let pkLabel = $state('');
	let pkOk = $state('');

	async function addPasskey() {
		if (registering) return;
		registering = true;
		pkMessage = '';
		const label = pkLabel.trim() || 'passkey';
		try {
			const beginRes = await fetch('?/passkeyRegisterBegin', { method: 'POST' });
			if (!beginRes.ok) {
				const err = await beginRes.json().catch(() => ({ message: 'passkeys unavailable' }));
				throw new Error(err.pk?.message ?? 'passkeys unavailable');
			}
			const begin = await beginRes.json();
			const attestation = await webauthnCreate(begin.options);
			const finishRes = await fetch('?/passkeyRegisterFinish', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ state: begin.state, label, response: attestation })
			});
			if (!finishRes.ok) {
				const err = await finishRes
					.json()
					.catch(() => ({ message: 'passkey registration failed' }));
				throw new Error(err.pk?.message ?? 'passkey registration failed');
			}
			const out = await finishRes.json();
			pkOk = out.pk.passkey.label;
			pkLabel = '';
			await invalidateAll();
		} catch (err) {
			pkMessage =
				err instanceof AdminApiError && err.message
					? err.message
					: err instanceof Error
						? err.message
						: 'passkey registration failed';
		} finally {
			registering = false;
		}
	}
</script>

<svelte:head>
	<title>Security · settings · mellon</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<SubCrumb href="/settings" label="settings">
		<span>security</span>
	</SubCrumb>
	<h1 class="font-brand text-2xl font-semibold tracking-tight">Security</h1>

	<form
		method="POST"
		action="?/password"
		class="flex max-w-xl flex-col gap-4 rounded-lg border border-border bg-card p-4"
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

	<!-- the PASSKEYS card (the auth-method seam, C1): the roster, the
	     add ceremony (begin in a form action -> the BROWSER's WebAuthn ->
	     finish), and delete. Registering never signs anything out. -->
	<div class="flex max-w-xl flex-col gap-3 rounded-lg border border-border bg-card p-4">
		<span class="flex flex-col gap-1">
			<span class="flex items-center gap-2 text-sm font-medium">
				<KeyRound class="size-4 text-muted-foreground" aria-hidden="true" />
				Passkeys
			</span>
			<span class="font-mono text-[10px] text-muted-foreground"
				>stored in your authenticator (Bitwarden, iCloud, a key) — signing in needs no password;
				deleting one never locks you out (the password remains)</span
			>
		</span>
		{#if data.passkeys.length === 0}
			<p class="font-mono text-xs text-muted-foreground">no passkeys registered yet</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each data.passkeys as pk (pk.id)}
					<form
						method="POST"
						action="?/passkeyDelete"
						class="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
						use:enhance={() => {
							return async ({ update }) => update();
						}}
					>
						<input type="hidden" name="id" value={pk.id} />
						<span class="flex min-w-0 flex-col">
							<span class="truncate text-sm">{pk.label}</span>
							<span class="font-mono text-[10px] text-muted-foreground/70">
								added {pk.createdAt}
								{pk.lastUsedAt ? `· last used ${pk.lastUsedAt}` : '· never used'}
							</span>
						</span>
						<Button
							type="submit"
							variant="ghost"
							class="size-8 shrink-0 p-0 text-muted-foreground hover:text-danger"
							aria-label="Delete {pk.label}"
						>
							<Trash2 class="size-4" aria-hidden="true" />
						</Button>
					</form>
				{/each}
			</ul>
		{/if}
		<div class="flex items-end gap-2">
			<label class="flex min-w-0 flex-1 flex-col gap-1.5">
				<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
					>add a passkey — name it</span
				>
				<Input type="text" bind:value={pkLabel} placeholder="Bitwarden" maxlength={40} />
			</label>
			<Button
				type="button"
				variant="outline"
				disabled={registering}
				onclick={() => void addPasskey()}
			>
				{#if registering}
					<LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
				{:else}
					<KeyRound class="size-4" aria-hidden="true" />
					Add
				{/if}
			</Button>
		</div>
		{#if pkMessage}
			<p class="font-mono text-xs text-danger" role="alert">{pkMessage}</p>
		{:else if pkOk}
			<p class="font-mono text-xs text-brand" role="status">
				"{pkOk}" is ready — use it on the login screen
			</p>
		{:else if form?.pk && 'message' in form.pk}
			<p class="font-mono text-xs text-danger" role="alert">{form.pk.message}</p>
		{/if}
	</div>
</section>
