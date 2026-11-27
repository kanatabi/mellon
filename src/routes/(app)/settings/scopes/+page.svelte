<script lang="ts">
	import { KeyRound, Plus, Trash2 } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import { fade } from 'svelte/transition';
	import SubCrumb from '#lib/components/SubCrumb.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	// The SCOPE CATALOG section (the RBAC round's third cut): the
	// PORTAL-MANAGED vocabulary — onboarding a scope is a portal action,
	// never manual SQL. Delete REFUSES while any user holds the scope
	// (409 with the counts) — lumen's copy renders VERBATIM (ghost-field).
</script>

<svelte:head>
	<title>Scopes · settings · mellon</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<SubCrumb href="/settings" label="settings">
		<span>scopes</span>
	</SubCrumb>
	<h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
		<KeyRound class="size-5 text-muted-foreground" aria-hidden="true" />
		Scopes
	</h1>

	<p class="text-xs leading-relaxed text-muted-foreground">
		the assignable vocabulary — every scope here appears in the users page's grant pickers; deleting
		one that users still hold is refused, never cascaded.
	</p>

	{#if form?.scopeError}
		<p class="text-xs leading-relaxed text-danger" role="alert">{form.scopeError}</p>
	{/if}
	{#if form?.scopeAdded}
		<p class="text-xs leading-relaxed text-brand" role="status" transition:fade={{ duration: 150 }}>
			{form.scopeAdded.scope} onboarded — it appears in the users page's grant pickers.
		</p>
	{/if}
	{#if form?.scopeDeleted}
		<p class="text-xs leading-relaxed text-brand" role="status" transition:fade={{ duration: 150 }}>
			{form.scopeDeleted} deleted.
		</p>
	{/if}

	<div class="rounded-lg border border-border bg-card p-4">
		<ul class="flex flex-col gap-1" aria-label="Scope catalog">
			{#each data.catalog as c (c.scope)}
				<li
					class="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
				>
					<span class="min-w-0">
						<span class="block font-mono text-xs text-foreground">{c.scope}</span>
						<span class="block truncate text-[10px] text-muted-foreground">{c.description}</span>
					</span>
					<form method="POST" action="?/scopeDelete" use:enhance class="shrink-0">
						<input type="hidden" name="scope" value={c.scope} />
						<Button
							type="submit"
							variant="danger"
							aria-label="Delete the {c.scope} scope"
							title="Delete (refused while any user holds it)"
						>
							<Trash2 class="size-3.5" />
						</Button>
					</form>
				</li>
			{/each}
		</ul>
	</div>

	<form
		method="POST"
		action="?/scopeAdd"
		class="flex items-end gap-2 rounded-lg border border-border bg-card p-4"
		use:enhance
	>
		<label class="flex w-44 shrink-0 flex-col gap-1">
			<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
				>scope</span
			>
			<Input name="scope" required pattern="^[a-z]+:[a-z]+$" title="<domain>:<verb>, lowercase" />
		</label>
		<label class="flex min-w-0 flex-1 flex-col gap-1">
			<span class="text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
				>description</span
			>
			<Input name="description" required placeholder="what this scope opens" />
		</label>
		<Button type="submit" variant="primary">
			<Plus class="size-4" aria-hidden="true" />
			Add scope
		</Button>
	</form>
</section>
