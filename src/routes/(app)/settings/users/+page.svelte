<script lang="ts">
	import { UserPlus, Users } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	// the one-time truth: temps exist in THIS render only — navigating away
	// (or any next action) drops them, exactly like lumen's response does.
	const reveal = $derived(
		form?.created ??
			(form?.resetFor ? { username: form.resetFor, tempPassword: form.tempPassword } : null)
	);
</script>

<svelte:head>
	<title>users · mellon</title>
</svelte:head>

<section class="flex flex-col gap-6">
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
									>temp</span
								>
							{:else}
								<span class="text-muted-foreground">set</span>
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
								<button
									type="submit"
									class="rounded-full border border-border px-3 py-1 transition-colors hover:border-accent-amber/60 hover:text-accent-amber"
								>
									issue new temp
								</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<form
		method="POST"
		action="?/create"
		class="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card px-4 py-3"
		use:enhance={() => {
			return ({ update }) => update();
		}}
	>
		<label class="flex flex-col gap-1.5">
			<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
				>username</span
			>
			<input
				type="text"
				name="username"
				required
				pattern={'^[a-z0-9][a-z0-9._-]{1,31}$'}
				title="lowercase letters, digits, dot, dash, underscore — 2 to 32 chars"
				class="rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-brand"
			/>
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
				>role</span
			>
			<select
				name="role"
				class="rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-brand"
			>
				<option value="editor">editor</option>
				<option value="admin">admin</option>
			</select>
		</label>
		<button
			type="submit"
			class="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
		>
			<UserPlus class="size-4" aria-hidden="true" />
			create
		</button>
	</form>

	<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
		creating or resetting issues a SERVER-GENERATED temporary password (syllable form, ~50 bits): it
		appears once in this page's response, is never logged, never stored in plaintext, and the new
		user must replace it at /setup before the portal does anything else (lumen answers 428 until
		they do).
	</p>
</section>
