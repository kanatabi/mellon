<script lang="ts">
	import { LayoutGrid } from 'lucide-svelte';
	import { orderEnvs } from '#lib/secrets-diff.ts';
	import type { EstateRow } from '#lib/api/types.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const apps = $derived.by(() => {
		const out: string[] = [];
		for (const r of data.rows) if (!out.includes(r.app)) out.push(r.app);
		return out.sort((a, b) => a.localeCompare(b));
	});
	// the RANKED env column — one order truth for the estate (shared → dev →
	// staging → production, exotics last); matrix, compare rail, and vault
	// cockpit all read it from orderEnvs so they can never disagree
	const cols = $derived.by(() => {
		const envs: string[] = [];
		for (const r of data.rows) if (!envs.includes(r.env)) envs.push(r.env);
		return orderEnvs(envs);
	});
	const cell = (app: string, env: string): EstateRow | undefined =>
		data.rows.find((r) => r.app === app && r.env === env);
	const maxKeys = (app: string): number =>
		Math.max(0, ...data.rows.filter((r) => r.app === app).map((r) => r.keys));

	const status = (r: EstateRow, appMax: number) => {
		const drift = r.keys < appMax; // this env trails the widest sibling
		const pinDrift = r.pinnedVersion !== null && r.pinnedVersion !== r.version;
		return { drift, pinDrift };
	};
</script>

<svelte:head>
	<title>Configs · mellon</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="flex items-center gap-2 font-brand text-3xl font-semibold tracking-tight">
				<LayoutGrid class="size-5 text-muted-foreground" aria-hidden="true" />
				Secrets summary
			</h1>
			<p class="font-mono text-xs text-muted-foreground">
				{apps.length} apps · {data.rows.length} paths — versions, pins, key counts; values stay in Bao
			</p>
		</div>
		<a
			href="/configs/vault"
			class="self-start rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
		>
			← Vault
		</a>
	</div>

	<div class="overflow-x-auto rounded-lg border border-border bg-card">
		<table class="w-full border-collapse font-mono text-xs">
			<thead>
				<tr
					class="border-b border-border text-left text-[10px] tracking-widest text-muted-foreground uppercase"
				>
					<th class="px-4 py-2 font-medium">app</th>
					{#each cols as env (env)}
						<th class="px-3 py-2 text-center font-medium">{env}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each apps as app (app)}
					{@const appMax = maxKeys(app)}
					<tr class="border-b border-border/50 last:border-0">
						<td class="px-4 py-2">
							<a
								href="/configs/vault?app={encodeURIComponent(app)}"
								class="text-foreground underline-offset-2 hover:underline"
							>
								{app}
							</a>
						</td>
						{#each cols as env (env)}
							{@const r = cell(app, env)}
							<td class="px-2 py-2 text-center">
								{#if r}
									{@const { drift, pinDrift } = status(r, appMax)}
									<a
										href="/configs/vault?app={encodeURIComponent(app)}&env={encodeURIComponent(
											env
										)}"
										class="inline-flex min-w-16 flex-col items-center gap-0.5 rounded-md border px-2 py-1 transition-colors hover:border-brand/60 {drift ||
										pinDrift
											? 'border-accent-amber/50'
											: 'border-border'}"
										title="v{r.version} · {r.keys} keys ({r.emptyKeys} empty){r.pinnedVersion !==
										null
											? ` · pinned v${r.pinnedVersion}`
											: ''}"
									>
										<span class="text-foreground">v{r.version}</span>
										<span class="flex items-center gap-1 text-[10px]">
											{#if r.pinnedVersion !== null}
												<span class={pinDrift ? 'text-accent-amber' : 'text-brand'}>
													pin v{r.pinnedVersion}
												</span>
											{/if}
											{#if r.emptyKeys > 0}
												<span
													class="text-accent-amber"
													title="{r.emptyKeys} keys waiting for values"
												>
													○{r.emptyKeys}
												</span>
											{/if}
											{#if drift}
												<span class="text-accent-amber" title="shape trails the widest sibling"
													>↓</span
												>
											{/if}
										</span>
									</a>
								{:else}
									<span class="text-muted-foreground/30">—</span>
								{/if}
							</td>
						{/each}
					</tr>
				{:else}
					<tr>
						<td colspan={cols.length + 1} class="px-4 py-10 text-center text-muted-foreground">
							the plane lists no paths yet — onboard from the cockpit
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
		○n = n keys awaiting values (onboarded shape, unfilled env) · pin vN = write lock (saves to that
		path are refused until unpin — head stays what everything reads; amber when pin ≠ head) · ↓ =
		this env's key set trails its widest sibling. Cells deep-link the cockpit.
	</p>
</section>
