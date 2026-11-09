<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Eye, EyeOff, History } from 'lucide-svelte';
	import { fade, slide } from 'svelte/transition';
	import Watermark from '#lib/components/Watermark.svelte';
	import { ApiError, client } from '#lib/api/client.ts';
	import { diffLines, type DiffOp } from '#lib/diff.ts';
	import type { SecretPayload } from '#lib/api/types.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// seed; the $effect below resyncs
	// whenever the server load returns a fresh secret.
	// svelte-ignore state_referenced_locally
	const seed = { secret: data.secret, meta: data.meta };
	let rows = $state<Record<string, string>>({ ...seed.secret?.data });
	let order = $state<string[]>(Object.keys(seed.secret?.data ?? {}));
	let cas = $state(seed.meta?.currentVersion ?? 0);
	let message = $state<{ kind: 'ok' | 'err'; text: string } | null>(null);
	let revealed = $state<Record<string, boolean>>({});
	let dirty = $state(false);
	let historyOpen = $state(false);
	let historyVersions = $state<number[]>([]);
	let historyDiff = $state<DiffOp[] | null>(null);

	// Resync the editor when the SERVER returns a fresh payload (mount +
	// invalidateAll after save). Guarded by a PRIMITIVE key: an effect must
	// never read state it writes — the first cut did `rows = {...}` then
	// `Object.keys(rows)`, so every run re-armed itself with a new object,
	// never converged, and Svelte killed the page with
	// effect_update_depth_exceeded (the "INTERNAL 200" boundary: 200 is the
	// navigation status the crash inherited, not an upstream code). Beware
	// the second trap: storing the PAYLOAD OBJECT in $state to compare later
	// also loops forever — Svelte deep-proxies what you store, so `===` is
	// proxy-vs-proxy and never true. Only primitives converge.
	let syncKey = $state('');
	$effect(() => {
		const key = `${data.app}|${data.env}|${data.meta?.currentVersion ?? 0}|${JSON.stringify(data.secret?.data ?? null)}`;
		if (key === syncKey) return;
		syncKey = key;
		const nextRows = { ...(data.secret?.data ?? {}) };
		rows = nextRows;
		order = Object.keys(nextRows); // the LOCAL clone — not `rows` state
		cas = data.meta?.currentVersion ?? 0;
		dirty = false;
		message = null;
	});

	function setVal(k: string, v: string) {
		rows[k] = v;
		dirty = true;
	}
	function addRow() {
		const k = `NEW_KEY_${order.length + 1}`;
		rows[k] = '';
		order = [...order, k];
		dirty = true;
	}
	function removeRow(k: string) {
		if (!confirm(`Drop ${k} from this secret? (history keeps it recoverable)`)) return;
		delete rows[k];
		order = order.filter((x) => x !== k);
		dirty = true;
	}

	async function save() {
		message = null;
		try {
			const v = await client.writeSecret(data.app, data.env, rows, cas);
			await invalidateAll();
			message = { kind: 'ok', text: `saved as version ${v} — Bao has the audit` };
		} catch (e) {
			message = {
				kind: 'err',
				text:
					e instanceof ApiError && e.status === 409
						? 'CAS rejected — someone wrote first; reloading theirs'
						: String(e)
			};
			await invalidateAll();
		}
	}

	function toggleReveal(k: string, on: boolean) {
		revealed = { ...revealed, [k]: on };
	}

	async function openHistory() {
		historyOpen = !historyOpen;
		historyDiff = null;
		if (!historyOpen) return;
		const meta = await client.secretMeta(data.app, data.env);
		historyVersions = (meta?.versions ?? []).map((v) => v.version).reverse();
	}

	async function diffAgainst(version: number) {
		const past = await client.readSecret(data.app, data.env, version);
		if (!past) return;
		historyDiff = lineDiff(past, rows);
	}

	/** Version payloads → sorted K=V lines → pure diff. */
	function lineDiff(older: SecretPayload, newerData: Record<string, string>): DiffOp[] {
		const toLines = (d: Record<string, string>) =>
			Object.keys(d)
				.sort()
				.map((k) => `${k}=${/^.{0,6}$/.test(d[k]) ? d[k] : '•'.repeat(Math.min(d[k].length, 12))}`);
		return diffLines(toLines(older.data).join('\n'), toLines(newerData).join('\n'));
	}

	const selectPath = (app: string, env: string) => goto(`?app=${app}&env=${env}`);

	const pathGroups = $derived.by(() => {
		const groups: [string, string[]][] = [];
		for (const p of data.paths) {
			const hit = groups.find(([app]) => app === p.app);
			if (hit) hit[1].push(p.env);
			else groups.push([p.app, [p.env]]);
		}
		return groups;
	});
</script>

<svelte:head>
	<title>secrets · mellon</title>
</svelte:head>

{#if !data.secret || !data.meta}
	<div class="relative flex flex-col items-center gap-3 py-24">
		<Watermark
			class="pointer-events-none absolute inset-0 m-auto aspect-square w-80"
			opacity={0.08}
		/>
		<p class="relative font-mono text-xs text-muted-foreground">
			the policy grants no paths — nothing to show
		</p>
	</div>
{:else}
	<section class="flex flex-col gap-6">
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div class="flex flex-col gap-1">
				<h1 class="font-brand text-4xl font-semibold tracking-tight">Secrets</h1>
				<!-- The double-`data` KV-v2 envelope, humanized: kv/<app>/<env>. -->
				<p class="font-mono text-xs text-muted-foreground">
					kv / {data.app} / {page.url.searchParams.get('env') ?? data.env} · v{cas}
				</p>
			</div>
			<div class="flex flex-wrap gap-1.5">
				{#each pathGroups as [app, envs] (app)}
					{#each envs as env (env)}
						<button
							type="button"
							onclick={() => selectPath(app, env)}
							aria-pressed={app === data.app && env === data.env}
							class="rounded-full border px-3 py-1 font-mono text-xs transition-colors {app ===
								data.app && env === data.env
								? 'border-brand bg-brand/10 text-foreground'
								: 'border-border text-muted-foreground hover:text-foreground'}"
						>
							{app}/{env}
						</button>
					{/each}
				{/each}
			</div>
		</div>

		{#if message}
			<p
				class="w-fit rounded-full px-3 py-1 font-mono text-xs {message.kind === 'ok'
					? 'bg-brand/10 text-brand'
					: 'text-danger'}"
				role="status"
			>
				{message.text}
			</p>
		{/if}

		<!-- Config-file anatomy: mono table, masked values, reveal-on-press. -->
		<div class="overflow-hidden rounded-lg border border-border bg-card">
			{#each order as k (k)}
				<div
					class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto_auto] items-center gap-3 border-b border-border px-4 py-2 last:border-b-0"
				>
					<input
						class="min-w-0 bg-transparent font-mono text-xs text-muted-foreground outline-none focus-visible:text-foreground"
						value={k}
						aria-label={`key ${k}`}
						onchange={(e) => {
							const nk = String(e.currentTarget.value);
							if (nk !== k && nk) {
								const rebuilt: Record<string, string> = {};
								for (const key of order) rebuilt[key === k ? nk : key] = rows[key];
								rows = rebuilt;
								order = order.map((x) => (x === k ? nk : x));
								dirty = true;
							}
						}}
					/>
					<input
						class="min-w-0 rounded bg-transparent px-1 font-mono text-xs outline-none focus-visible:bg-muted"
						type={revealed[k] ? 'text' : 'password'}
						value={rows[k]}
						aria-label={`value of ${k}`}
						oninput={(e) => setVal(k, String(e.currentTarget.value))}
					/>
					<button
						type="button"
						class="p-1 transition-colors {revealed[k]
							? 'text-accent-amber'
							: 'text-muted-foreground hover:text-foreground'}"
						aria-label={revealed[k] ? 'Hide value' : 'Reveal value'}
						onpointerdown={() => toggleReveal(k, true)}
						onpointerup={() => toggleReveal(k, false)}
						onpointerleave={() => toggleReveal(k, false)}
						onkeydown={(e) => e.key === ' ' && toggleReveal(k, true)}
						onkeyup={(e) => e.key === ' ' && toggleReveal(k, false)}
					>
						{#if revealed[k]}
							<EyeOff class="size-3.5" />
						{:else}
							<Eye class="size-3.5" />
						{/if}
					</button>
					<button
						type="button"
						class="p-1 font-mono text-xs text-danger transition-colors hover:bg-danger/10"
						onclick={() => removeRow(k)}
						aria-label={`Remove ${k}`}
					>
						×
					</button>
				</div>
			{/each}
		</div>

		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={addRow}
				class="rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				+ key
			</button>
			<button
				type="button"
				onclick={() => void openHistory()}
				class="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
				aria-expanded={historyOpen}
			>
				<History class="size-3.5" /> history
			</button>
			<button
				type="button"
				disabled={!dirty}
				onclick={() => void save()}
				class="ml-auto rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
			>
				save as v{cas + 1}
			</button>
		</div>

		{#if historyOpen}
			<aside
				class="fixed inset-y-0 right-0 z-30 w-96 max-w-[85vw] overflow-y-auto border-l border-border bg-card p-5 shadow-2xl"
				transition:slide={{ axis: 'x', duration: 220 }}
				aria-label="Version history"
			>
				<div class="mb-4 flex items-center justify-between">
					<p class="text-xs font-medium tracking-widest text-muted-foreground uppercase">
						versions
					</p>
					<button
						type="button"
						onclick={() => (historyOpen = false)}
						class="font-mono text-xs text-muted-foreground hover:text-foreground"
					>
						close
					</button>
				</div>
				<div class="flex flex-col gap-1">
					{#each historyVersions as v (v)}
						<button
							type="button"
							onclick={() => void diffAgainst(v)}
							class="flex items-center justify-between rounded-md px-3 py-1.5 font-mono text-xs transition-colors hover:bg-accent {historyDiff
								? 'text-muted-foreground'
								: 'text-foreground'}"
						>
							<span>v{v}</span>
							<span>{v === cas ? 'current' : `diff → now`}</span>
						</button>
					{/each}
				</div>
				{#if historyDiff}
					<pre
						class="mt-4 flex flex-col gap-0.5 overflow-x-auto font-mono text-[11px]"
						transition:fade={{ duration: 150 }}>
						{#each historyDiff as op, i (i + ':' + op.kind + ':' + op.text)}
							<span
								class={op.kind === 'add'
									? 'text-diff-add'
									: op.kind === 'del'
										? 'text-diff-del'
										: 'text-muted-foreground'}
								>{op.kind === 'add' ? '+ ' : op.kind === 'del' ? '- ' : '  '}{op.text}</span
							>
						{/each}
					</pre>
				{/if}
				<p class="mt-6 font-mono text-[10px] leading-relaxed text-muted-foreground/70">
					values are masked in diffs too — Bao's audit (server-side) holds the true bytes
				</p>
			</aside>
		{/if}
	</section>
{/if}
