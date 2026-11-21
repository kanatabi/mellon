<script lang="ts">
	import { UserPlus, Users } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	// the role picker rides the form POST via Select's hidden input — the
	// action's formData.get('role') reads the same field as the native
	// select it replaced (the wire is untouched)
	let newRole = $state('editor');

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
					roles are per-request facts (lumen reads the row every call) — a reset, a demotion, a
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
						pattern={'^[a-z0-9][a-z0-9.\-_]{1,31}$'}
						title="lowercase letters, digits, dot, dash, underscore — 2 to 32 chars"
					/>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
						>role</span
					>
					<!-- the wire contract: the action reads formData.get('role') — the
					     hidden input carries the value the hand-rolled Select's name
					     prop used to carry -->
					<input type="hidden" name="role" value={newRole} />
					<Select.Root type="single" bind:value={newRole}>
						<Select.Trigger class="w-36" aria-label="Role">
							<Select.Value />
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="editor">editor</Select.Item>
							<Select.Item value="admin">admin</Select.Item>
						</Select.Content>
					</Select.Root>
				</label>
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
					<th class="px-4 py-2 font-medium">role</th>
					<th class="px-4 py-2 font-medium">state</th>
					<th class="px-4 py-2 font-medium">since</th>
					<th class="px-4 py-2 text-right font-medium">reset</th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as u (u.username)}
					<tr class="border-b border-border/50 last:border-0">
						<td class="px-4 py-2 text-foreground">{u.username}</td>
						<td class="px-4 py-2">{u.role}</td>
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
