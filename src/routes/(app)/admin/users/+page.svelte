<script lang="ts">
	import { UserPlus, Users } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	// the picker IS the grant (roles are gone — the spine ruling): the
	// checkboxes ride the form POST as repeated `scopes` fields, the
	// action's formData.getAll('scopes') reads exactly those
	let newScopes = $state<string[]>(['content:manage']);

	// The creation form lives in a dialog (owner ask 2026-11-21): the page
	// keeps a `Create New User` door above the table. The dialog closes
	// itself on SUCCESS so the one-time temp-password reveal (page-level,
	// below) is what the user reads next; a failed submit keeps it open.
	let createOpen = $state(false);

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
				<!-- the grant: one checkbox per catalog scope, grouped by the
				     namespace the grammar's left half names -->
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
					<th class="px-4 py-2 text-right font-medium">reset</th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as u (u.username)}
					<tr class="border-b border-border/50 align-top last:border-0">
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
							{#if u.mustChange}
								<span class="text-accent-amber" title="temp password — guided change on next login"
									>Temp</span
								>
							{:else}
								<span class="text-muted-foreground">Set</span>
							{/if}
						</td>
						<td class="px-4 py-2 text-muted-foreground">{u.createdAt}</td>
						<td class="px-4 py-2 text-right">
							<form
								method="POST"
								action="?/reset"
								use:enhance={() => {
									return ({ update }) => update();
								}}
							>
								<input type="hidden" name="username" value={u.username} />
								<Button
									type="submit"
									variant="quiet"
									class="py-1 text-inherit hover:border-accent-amber/60 hover:text-accent-amber"
								>
									Issue new temp
								</Button>
							</form>
						</td>
					</tr>
					<!-- the scope editor: the assignment REPLACES the set and
					     bumps token_version — the copy says what the user loses -->
					<tr class="border-b border-border/50 last:border-0">
						<td colspan="5" class="bg-background/40 px-4 py-2">
							<form
								method="POST"
								action="?/scopes"
								class="flex flex-wrap items-center gap-2"
								use:enhance
							>
								<input type="hidden" name="username" value={u.username} />
								{#each data.catalog as c (c.scope)}
									<label
										class="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] transition-colors hover:bg-muted/60"
									>
										<input
											type="checkbox"
											name="scopes"
											value={c.scope}
											checked={u.scopes.includes(c.scope)}
											class="size-3.5 accent-brand"
										/>
										{c.scope}
									</label>
								{/each}
								<Button type="submit" variant="quiet" class="ml-auto py-1 text-inherit"
									>Set scopes</Button
								>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
		creating or resetting issues a SERVER-GENERATED temporary password (syllable form, ~50 bits): it
		appears once in this page's response, is never logged, never stored in plaintext, and the new
		user must replace it at /setup before the portal does anything else (lumen answers 428 until
		they do).
	</p>
</section>
