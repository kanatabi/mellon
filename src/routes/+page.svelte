<script lang="ts">
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>mellon · portal</title>
</svelte:head>

<section class="flex flex-1 flex-col items-start justify-center gap-3 px-6 py-16">
	<p class="text-xs font-medium tracking-widest text-muted-foreground uppercase">mellon</p>
	<!-- Entity titles wear the serif (DESIGN §11.2) — the one brand signature in the admin. -->
	<h1 class="font-brand text-5xl leading-[1.05] font-semibold tracking-tight">
		Speak, friend, and enter<span class="text-brand">;</span>
	</h1>
	<p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
		Scaffold ready — theme parity is live (flip it, reload, no flash); the app shell, command
		palette, and mock-lumen data layer arrive in M2. Signed in as
		<span class="font-mono text-foreground">{data.theme}</span>
		mode.
	</p>
</section>
