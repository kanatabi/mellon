<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	const registering = $derived(data.mode === 'register');
</script>

<svelte:head>
	<title>{registering ? 'Claim the estate' : 'Set your password'} · mellon</title>
</svelte:head>

<AuthShell
	title={registering ? 'Claim the estate.' : 'Set your password.'}
	subtitle={registering
		? 'Create the first admin. This door locks behind you — it can never open again.'
		: `Hello ${data.username} — you arrived with a temporary password. Set your own and the door opens normally from here on.`}
>
	<form
		method="POST"
		class="flex flex-col gap-4"
		use:enhance={() => {
			return ({ update }) => update();
		}}
	>
		<input type="hidden" name="mode" value={data.mode} />
		<!-- the username carrier exists ONLY in change mode: in register mode
		     data.username is '', and a second [name=username] field would be
		     read FIRST by the action (FormData.get) — the empty ghost field
		     shadowed real claims. -->
		{#if !registering}
			<input type="hidden" name="username" value={data.username} />
			<label class="flex flex-col gap-1.5">
				<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
					>Current password</span
				>
				<Input
					type="password"
					name="current"
					required
					autocomplete="current-password"
					class="w-full"
					placeholder="the temporary password"
				/>
			</label>
		{:else}
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
		{/if}
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase">
				{registering ? 'Password' : 'New password'}
			</span>
			<Input
				type="password"
				name="password"
				required
				minlength={10}
				autocomplete="new-password"
				class="w-full"
				placeholder="at least 10 characters"
			/>
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
				>Confirm</span
			>
			<Input
				type="password"
				name="confirm"
				required
				minlength={10}
				autocomplete="new-password"
				class="w-full"
				placeholder="the same password again"
			/>
		</label>
		{#if form?.message}
			<p class="text-xs leading-relaxed text-danger" role="alert">{form.message}</p>
		{/if}
		<Button type="submit" variant="primary" class="mt-1 w-full justify-center">
			{registering ? 'Claim the estate' : 'Set my password'}
		</Button>
		<p class="text-center text-xs leading-relaxed text-muted-foreground/70">
			Your password is hashed by lumen — the portal only carries the form.
		</p>
	</form>
</AuthShell>
