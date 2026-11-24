<script lang="ts">
	import { KeyRound, Plus, UserPlus, Users } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import DeleteDialog from '#lib/components/DeleteDialog.svelte';
	import { client } from '#lib/api/client.ts';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	// The users page is QUIET on purpose (owner call 2026-11-24): the table
	// reads username · scopes · state · since · Manage, and every lifecycle
	// verb lives in the PER-USER dialog — one user at a time, the list
	// visible behind it. Scope VOCABULARY management is the dedicated
	// settings/scopes section, not this page.
	let createOpen = $state(false);
	let manageTarget = $state<string | null>(null);
	let deleteTarget = $state<string | null>(null);
	const manageUser = $derived(data.users.find((u) => u.username === manageTarget) ?? null);

	// the grant: the picker IS the grant (roles are gone — the spine ruling)
	let newScopes = $state<string[]>(['content:manage']);

	// the one-time truth: temps exist in THIS render only — navigating away
	// (or any next action) drops them, exactly like lumen's response does.
	const reveal = $derived(
		form?.created ??
			(form?.resetFor ? { username: form.resetFor, tempPassword: form.tempPassword } : null)
	);
</script>

<svelte:head>
	<title>Users · mellon</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<Dialog.Root bind:open={createOpen}>
		<div class="flex items-end justify-between gap-4">
			<div class="flex flex-col gap-1">
				<h1 class="flex items-center gap-2 font-brand text-3xl font-semibold tracking-tight">
					<Users class="size-5 text-muted-foreground" aria-hidden="true" />
					Users
				</h1>
				<p class="font-mono text-xs text-muted-foreground">
					scopes are per-request facts (lumen reads the row every call) — a reset, a demotion, a
					completed password change all bite on the NEXT request
				</p>
			</div>
			<!-- the door sits above the table, in the header row (owner call) -->
			<Dialog.Trigger
				class="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
			>
				<UserPlus class="size-4" aria-hidden="true" />
				Create New User
			</Dialog.Trigger>
		</div>

		{#if reveal?.tempPassword}
			<div
				class="flex flex-col gap-1 rounded-lg border border-accent-amber/60 bg-accent-amber/10 px-4 py-3"
				role="status"
			>
				<span class="font-mono text-xs text-accent-amber"
					>{reveal.username} — temporary password, shown exactly once:</span
				>
				<code class="font-mono text-sm font-semibold select-all">{reveal.tempPassword}</code>
				<span class="font-mono text-[10px] text-muted-foreground"
					>hand it over out-of-band. It is not stored anywhere readable — not by lumen (argon2id
					only), not by this page (leaving loses it).</span
				>
			</div>
		{/if}
		{#if form?.error}
			<p class="font-mono text-xs text-danger" role="alert">{form.error}</p>
		{/if}
		{#if form?.deleteError}
			<p class="font-mono text-xs text-danger" role="alert">{form.deleteError}</p>
		{/if}

		<!-- Closes on SUCCESS: the one-time temp-password reveal below is what
		     the user reads next; a failed submit keeps the dialog open with the
		     error inline. bits-ui autofocuses the username field. -->
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>Create a user</Dialog.Title>
				<Dialog.Description class="font-mono text-xs text-muted-foreground">
					lumen mints a server-generated temporary password, shown once on this page after the
					dialog closes.
				</Dialog.Description>
			</Dialog.Header>
			<form
				method="POST"
				action="?/create"
				class="flex flex-col gap-4"
				use:enhance={() => {
					// close on SUCCESS only — a failed submit keeps the dialog open
					// with the error inline; the one-time reveal lives on the page
					return async ({ update, result }) => {
						await update();
						if (result.type === 'success') createOpen = false;
					};
				}}
			>
				<label class="flex flex-col gap-1.5">
					<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
						>username</span
					>
					<Input
						type="text"
						name="username"
						required
						pattern={'^[a-z0-9][a-z0-9.\\-_]{1,31}$'}
						title="lowercase letters, digits, dot, dash, underscore — 2 to 32 chars"
					/>
				</label>
				<!-- the grant: one checkbox per catalog scope — the picker IS the
				     grant (roles are gone, the spine ruling) -->
				<fieldset class="flex flex-col gap-1.5">
					<legend class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
						scopes — the exact grant
					</legend>
					{#each data.catalog as c (c.scope)}
						<label
							class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
						>
							<input
								type="checkbox"
								name="scopes"
								value={c.scope}
								checked={newScopes.includes(c.scope)}
								onchange={(e) => {
									newScopes = e.currentTarget.checked
										? [...newScopes, c.scope]
										: newScopes.filter((s) => s !== c.scope);
								}}
								class="size-4 accent-brand"
							/>
							<span class="min-w-0">
								<span class="block font-mono text-xs text-foreground">{c.scope}</span>
								<span class="block truncate text-[10px] text-muted-foreground">{c.description}</span
								>
							</span>
						</label>
					{/each}
				</fieldset>
				{#if form?.error}
					<p class="font-mono text-xs text-danger" role="alert">{form.error}</p>
				{/if}
				<Dialog.Footer>
					<Button type="submit">
						<UserPlus class="size-4" aria-hidden="true" />
						Create
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<div class="overflow-x-auto rounded-lg border border-border bg-card">
		<table class="w-full border-collapse font-mono text-xs">
			<thead>
				<tr
					class="border-b border-border text-left text-[10px] tracking-widest text-muted-foreground uppercase"
				>
					<th class="px-4 py-2 font-medium">username</th>
					<th class="px-4 py-2 font-medium">scopes</th>
					<th class="px-4 py-2 font-medium">state</th>
					<th class="px-4 py-2 font-medium">since</th>
					<th class="px-4 py-2 text-right font-medium">manage</th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as u (u.username)}
					<tr class="border-b border-border/50 last:border-0">
						<td class="px-4 py-2 text-foreground">{u.username}</td>
						<td class="px-4 py-2">
							<span class="flex flex-wrap gap-1">
								{#each u.scopes as sc (sc)}
									<span class="rounded-full bg-muted px-2 py-0.5 text-[10px]">{sc}</span>
								{:else}
									<span class="text-muted-foreground/50">none</span>
								{/each}
							</span>
						</td>
						<td class="px-4 py-2">
							{#if u.disabled}
								<span class="text-danger" title="login denied — re-enable to undo">Disabled</span>
							{:else if u.mustChange}
								<span class="text-accent-amber" title="temp password — guided change on next login"
									>Temp</span
								>
							{:else}
								<span class="text-muted-foreground">Set</span>
							{/if}
						</td>
						<td class="px-4 py-2 text-muted-foreground">{u.createdAt}</td>
						<td class="px-4 py-2 text-right">
							<Button
								type="button"
								variant="quiet"
								class="py-1 text-inherit"
								onclick={() => (manageTarget = u.username)}
							>
								Manage
							</Button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if manageTarget && manageUser}
		<Dialog.Root
			open={manageTarget !== null}
			onOpenChange={(o) => {
				if (!o) manageTarget = null;
			}}
		>
			<Dialog.Content class="flex max-h-[85svh] flex-col gap-4 overflow-y-auto sm:max-w-lg">
				<Dialog.Header>
					<Dialog.Title class="font-brand text-lg font-semibold"
						>Manage {manageUser.username}</Dialog.Title
					>
					<Dialog.Description class="font-mono text-[10px] text-muted-foreground">
						set · {manageUser.createdAt} · every verb here is lumen's — the portal renders, never decides
					</Dialog.Description>
				</Dialog.Header>

				{#if form?.manageError}
					<p class="font-mono text-xs text-danger" role="alert">{form.manageError}</p>
				{/if}
				{#if form?.revoked}
					<p class="font-mono text-xs text-brand" role="status">
						{form.revoked.username}'s sessions revoked — they sign in again.
					</p>
				{/if}
				{#if form?.forced}
					<p class="font-mono text-xs text-brand" role="status">
						{form.forced} must complete a password change on next use.
					</p>
				{/if}

				<!-- SCOPES: the assignment REPLACES the set and bumps
				     token_version — the user's other sessions die (the copy says
				     what they lose) -->
				<form method="POST" action="?/scopes" class="flex flex-col gap-2" use:enhance>
					<input type="hidden" name="username" value={manageUser.username} />
					<fieldset class="flex flex-col gap-1.5">
						<legend class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
							scopes — saving REPLACES the set
						</legend>
						{#each data.catalog as c (c.scope)}
							<label
								class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
							>
								<input
									type="checkbox"
									name="scopes"
									value={c.scope}
									checked={manageUser.scopes.includes(c.scope)}
									class="size-4 accent-brand"
								/>
								<span class="min-w-0">
									<span class="block font-mono text-xs text-foreground">{c.scope}</span>
									<span class="block truncate text-[10px] text-muted-foreground"
										>{c.description}</span
									>
								</span>
							</label>
						{/each}
					</fieldset>
					<Button type="submit" variant="primary" class="w-fit">Save scopes</Button>
				</form>

				<!-- SESSIONS & PASSWORD -->
				<div class="flex flex-col gap-2 border-t border-border pt-3">
					<p class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
						sessions &amp; password
					</p>
					<div class="flex flex-wrap items-center gap-2">
						<form method="POST" action="?/reset" use:enhance>
							<input type="hidden" name="username" value={manageUser.username} />
							<Button type="submit" variant="quiet" class="py-1.5 text-inherit">
								Issue new temp
							</Button>
						</form>
						<form method="POST" action="?/forceChange" use:enhance>
							<input type="hidden" name="username" value={manageUser.username} />
							<Button type="submit" variant="quiet" class="py-1.5 text-inherit">
								Force change on next login
							</Button>
						</form>
						<form method="POST" action="?/revoke" use:enhance>
							<input type="hidden" name="username" value={manageUser.username} />
							<Button type="submit" variant="quiet" class="py-1.5 text-inherit">
								Revoke all sessions
							</Button>
						</form>
					</div>
				</div>

				<!-- DANGER ZONE: destructive verbs wear danger red at rest -->
				<div class="flex flex-col gap-2 border-t border-border pt-3">
					<p class="text-[10px] font-medium tracking-widest text-danger uppercase">danger zone</p>
					<div class="flex flex-wrap items-center gap-2">
						{#if manageUser.disabled}
							<form method="POST" action="?/enable" use:enhance>
								<input type="hidden" name="username" value={manageUser.username} />
								<Button type="submit" variant="danger">Enable account</Button>
							</form>
						{:else}
							<form method="POST" action="?/disable" use:enhance>
								<input type="hidden" name="username" value={manageUser.username} />
								<Button type="submit" variant="danger">Disable account</Button>
							</form>
						{/if}
						<Button
							type="button"
							variant="danger"
							onclick={() => (deleteTarget = manageUser.username)}
						>
							Delete user…
						</Button>
					</div>
				</div>
			</Dialog.Content>
		</Dialog.Root>
	{/if}

	{#if deleteTarget}
		<DeleteDialog
			heading={'Delete the user "' + deleteTarget + '"?'}
			description="the account and its scope grants are removed — the estate's content is NOT theirs, it survives — their sessions die immediately"
			confirmText={deleteTarget}
			confirmLabel="Delete user"
			onConfirm={async () => {
				// the browser client relays to lumen (the RBAC guards' 400/409
				// copies land in the dialog's inline failure — verbatim)
				await client.deleteUser(deleteTarget ?? '');
				await invalidateAll();
			}}
			onClose={() => (deleteTarget = null)}
		/>
	{/if}
</section>
