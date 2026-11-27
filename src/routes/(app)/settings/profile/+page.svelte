<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { UserRound } from 'lucide-svelte';
	import SubCrumb from '#lib/components/SubCrumb.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let saving = $state(false);

	const initial = $derived((data.profile.name || data.profile.username).slice(0, 1).toUpperCase());
</script>

<svelte:head>
	<title>Profile · settings · mellon</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<SubCrumb href="/settings" label="settings">
		<span>profile</span>
	</SubCrumb>
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold tracking-tight">Profile</h1>
		<p class="max-w-2xl text-xs leading-relaxed text-muted-foreground">
			How you appear in the estate — and, once authoring lands, on your posts.
		</p>
	</div>

	<!-- Identity card: the same avatar/name grammar as the account menu. -->
	<div class="flex max-w-xl items-center gap-4 rounded-lg border border-border bg-card p-4">
		<span
			aria-hidden="true"
			class="grid size-12 shrink-0 place-items-center rounded-full bg-brand/15 font-mono text-lg font-bold text-brand uppercase"
		>
			{initial}
		</span>
		<span class="min-w-0">
			<span class="block truncate text-sm font-semibold text-foreground">
				{data.profile.name || data.profile.username}
			</span>
			<span class="block truncate text-xs text-muted-foreground">@{data.profile.username}</span>
		</span>
		<span class="ml-auto hidden shrink-0 font-mono text-[10px] text-muted-foreground/60 sm:block">
			since {data.profile.createdAt}
		</span>
	</div>

	<form
		method="POST"
		action="?/profile"
		class="flex max-w-xl flex-col gap-4 rounded-lg border border-border bg-card p-4"
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				saving = false;
				await update();
				if (result.type === 'success') await invalidateAll();
			};
		}}
	>
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
				>Display name</span
			>
			<Input
				type="text"
				name="name"
				value={data.profile.name}
				required
				maxlength={80}
				class="w-full"
			/>
			<span class="text-xs leading-relaxed text-muted-foreground/70">
				Shown in the console. Once authoring lands, this becomes your byline.
			</span>
		</label>

		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase">Email</span>
			<Input
				type="email"
				name="email"
				value={data.profile.email}
				autocomplete="email"
				placeholder="you@example.com"
				class="w-full"
			/>
			<span class="text-xs leading-relaxed text-muted-foreground/70">
				Private account contact — never shown on the blog. Leave it empty to unset it.
			</span>
		</label>

		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
				>Username</span
			>
			<Input type="text" value={data.profile.username} disabled class="w-full" />
			<span class="text-xs leading-relaxed text-muted-foreground/70">
				Your login handle. It cannot be changed here.
			</span>
		</label>

		<div class="flex flex-col gap-1.5 border-t border-border/70 pt-4">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase">Access</span
			>
			<div class="flex flex-wrap gap-1.5">
				{#each data.profile.scopes as scope (scope)}
					<span class="rounded-sm bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
						{scope}
					</span>
				{/each}
			</div>
		</div>

		{#if form?.message}
			<p class="text-xs leading-relaxed text-danger" role="alert">{form.message}</p>
		{:else if form?.ok}
			<p class="text-xs leading-relaxed text-brand" role="status">Profile saved.</p>
		{/if}

		<div class="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
			<span
				class="hidden items-center gap-1.5 font-mono text-[10px] text-muted-foreground/60 sm:flex"
			>
				<UserRound class="size-3.5" aria-hidden="true" />
				your identity travels with the session
			</span>
			<Button type="submit" variant="primary" disabled={saving} class="ml-auto">
				{saving ? 'Saving…' : 'Save profile'}
			</Button>
		</div>
	</form>
</section>
