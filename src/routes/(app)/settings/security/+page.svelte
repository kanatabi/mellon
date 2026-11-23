<script lang="ts">
	import { ShieldCheck } from 'lucide-svelte';
	import SubCrumb from '#lib/components/SubCrumb.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import Button from '#lib/components/ui/button/button.svelte';
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();
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
</section>
