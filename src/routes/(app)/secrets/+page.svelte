<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import {
		ArrowLeftRight,
		Eye,
		EyeOff,
		History,
		Pin,
		PinOff,
		Plus,
		Search,
		X
	} from 'lucide-svelte';
	import { fade, slide } from 'svelte/transition';
	import { focusOnMount } from '#lib/actions.ts';
	import Watermark from '#lib/components/Watermark.svelte';
	import { ApiError, client } from '#lib/api/client.ts';
	import { diffLines, type DiffOp } from '#lib/diff.ts';
	import { rankByFuzzy } from '#lib/fuzzy.ts';
	import { displayValue, orderEnvs } from '#lib/secrets-diff.ts';
	import { editField, stateToggle } from '#lib/command-kit.ts';
	import { setPageCommands } from '#lib/page-commands.svelte.ts';
	import type { Command } from '#lib/commands.ts';
	import type { SecretPayload } from '#lib/api/types.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// seed; the $effect below resyncs whenever the server load returns a fresh secret.
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
	let pinnedVersion = $state<number | null>(seed.meta?.pinnedVersion ?? null);

	// search (B2/D3): current-env rows only, key names AND values, client-side.
	let query = $state('');
	// regex QUANTIFIERS must be EXPRESSIONS in attributes: a raw {1,31} in a
	// static attr is eaten as a Svelte template interpolation (the parser
	// turned it into the comma-expression {(1, 31)} and split my title attr
	// across lines — caught by check; Prettier then formalized the damage).
	const APP_PATTERN = '^[a-z][a-z0-9-]{1,31}$';
	const ENV_PATTERN = '^[a-z][a-z0-9-]{0,31}$';
	// onboarding + add-env dialogs; the input carries the slug, the busy flag
	// gates double-submit while the relay round-trips.
	let onboardOpen = $state(false);
	let onboardName = $state('');
	let onboardBusy = $state(false);
	let addEnvOpen = $state(false);
	let addEnvName = $state('');
	// version inspector: a live version payload the user chose to VIEW (read-only)
	// or RESTORE (overlay onto the current key set → dirty → save). Separate from
	// historyDiff (which is a shape diff, not the secret bytes).
	let viewing = $state<{ version: number; data: Record<string, string> } | null>(null);
	let searchEl: HTMLInputElement | undefined = $state();
	// REVEAL ALL: a display switch only — the values already live in this
	// page's memory; nothing new crosses the network. Never persisted:
	// a refresh returning to masked is the safe direction of failure.
	let revealAll = $state(false);

	// Palette verbs (DESIGN §7 contract): the page owns its actions, the
	// shell composes them. The effect RE-READS live state (dirty target,
	// open drawer, pin, filter) so every row's title/hint is the truth at
	// the moment Enter falls — and unmount clears, no stale secrets-verbs
	// haunting the dashboard.
	$effect(() => {
		const loaded = !!(data.secret && data.meta);
		const cmds: Command[] = [];
		if (loaded) {
			cmds.push({
				id: 'secrets.save',
				title: `save as v${cas + 1}`,
				group: 'actions',
				shortcut: dirty ? 'unsaved' : 'clean',
				run: () => void save()
			});
			cmds.push({ id: 'secrets.add-key', title: 'Add key', group: 'actions', run: addRow });
			cmds.push(
				stateToggle({
					id: 'secrets.history',
					title: 'Version history',
					on: historyOpen,
					onHint: 'open',
					offHint: 'close',
					run: () => void openHistory()
				})
			);
			cmds.push(
				stateToggle({
					id: 'secrets.pin',
					title: pinnedVersion !== null ? `Unpin v${pinnedVersion}` : `Pin v${cas} (intent)`,
					on: pinnedVersion !== null,
					onHint: 'pinned',
					offHint: 'unpinned',
					run: () => void togglePin(cas)
				})
			);
			cmds.push(
				stateToggle({
					id: 'secrets.reveal',
					title: revealAll ? 'Hide all values' : 'Show all values',
					on: revealAll,
					onHint: 'shown',
					offHint: 'masked',
					run: () => (revealAll = !revealAll)
				})
			);
			cmds.push({
				id: 'secrets.compare',
				title: `Compare v${pinnedVersion ?? Math.max(1, cas - 1)} ↔ head`,
				group: 'actions',
				run: () =>
					void goto(
						`/secrets/compare?app=${data.app}&env=${data.env}&from=${pinnedVersion ?? Math.max(1, cas - 1)}&to=${cas}`
					)
			});
			cmds.push({
				id: 'secrets.add-env',
				title: 'Add environment…',
				group: 'actions',
				run: () => (addEnvOpen = true)
			});
			cmds.push({
				id: 'secrets.filter',
				title: 'Filter keys and values',
				group: 'actions',
				run: () => searchEl?.focus()
			});
			// the keyboard-first door: SET the filter through the buffer
			cmds.push(
				editField({
					id: 'secrets.set-filter',
					title: 'Set search filter',
					pill: 'filter',
					seed: query,
					commit: (v) => {
						query = v;
						return true;
					}
				})
			);
		}
		// onboarding is legal even in the EMPTY state (no paths granted yet)
		cmds.push({
			id: 'secrets.onboard',
			title: 'Onboard app…',
			group: 'actions',
			run: () => (onboardOpen = true)
		});
		setPageCommands(cmds);
		return () => setPageCommands([]);
	});

	// Resync the editor when the SERVER returns a fresh payload (mount +
	// invalidateAll after save). Guarded by a PRIMITIVE key: an effect must
	// never read state it writes — the first cut did `rows = {...}` then
	// `Object.keys(rows)`, so every run re-armed itself with a new object,
	// never converged, and Svelte killed the page with
	// effect_update_depth_exceeded (the "INTERNAL 200" boundary: 200 is the
	// navigation status the crash inherited, not an upstream code). Beware
	// the second trap: storing the PAYLOAD OBJECT in $state to compare later
	// also loops forever — Svelte deep-proxies what you store, so `===` is
	// proxy-vs-proxy and never true. Only primitives converge. The pin rides
	// the same resync (it is meta, and meta changes exactly when a fresh
	// payload does — plus local pin/unpin set it eagerly for instant feedback).
	let syncKey = $state('');
	$effect(() => {
		const key = `${data.app}|${data.env}|${data.meta?.currentVersion ?? 0}|${JSON.stringify(data.secret?.data ?? null)}`;
		if (key === syncKey) return;
		syncKey = key;
		const nextRows = { ...(data.secret?.data ?? {}) };
		rows = nextRows;
		order = Object.keys(nextRows); // the LOCAL clone — not `rows` state
		cas = data.meta?.currentVersion ?? 0;
		pinnedVersion = data.meta?.pinnedVersion ?? null;
		dirty = false;
		message = null;
		viewing = null;
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
		if (
			!confirm(
				`Drop ${k} from this secret? (the key-set mirror removes it from EVERY env — history keeps it recoverable)`
			)
		)
			return;
		delete rows[k];
		order = order.filter((x) => x !== k);
		dirty = true;
	}

	// ONE error path for all control ops: 409 stories (mirror-stale,
	// collisions) arrive VERBATIM from lumen — they NAME the env; the
	// success text is returned by the op itself, so nothing double-writes.
	async function run(fn: () => Promise<string>): Promise<boolean> {
		message = null;
		try {
			message = { kind: 'ok', text: await fn() };
			await invalidateAll();
			return true;
		} catch (e) {
			message = {
				kind: 'err',
				text: e instanceof ApiError && e.status === 409 ? e.message : String(e)
			};
			await invalidateAll();
			return false;
		}
	}

	async function save() {
		await run(async () => {
			const v = await client.writeSecret(data.app, data.env, rows, cas);
			return `saved as version ${v} — key-set mirrored to siblings, Bao has the audit`;
		});
	}

	function toggleReveal(k: string, on: boolean) {
		revealed = { ...revealed, [k]: on };
	}

	async function openHistory() {
		historyOpen = !historyOpen;
		historyDiff = null;
		viewing = null;
		if (!historyOpen) return;
		const meta = await client.secretMeta(data.app, data.env);
		historyVersions = (meta?.versions ?? []).map((v) => v.version).reverse();
		pinnedVersion = meta?.pinnedVersion ?? null;
	}

	async function diffAgainst(version: number) {
		const past = await client.readSecret(data.app, data.env, version);
		if (!past) return;
		historyDiff = lineDiff(past, rows);
		viewing = null;
	}

	async function viewVersion(version: number) {
		const past = await client.readSecret(data.app, data.env, version);
		if (!past) return;
		viewing = { version, data: past.data };
		historyDiff = null;
	}

	// RESTORE (D2): overlay a past version's VALUES onto the CURRENT key set —
	// keys the shape no longer has do NOT resurrect; the result is a dirty edit
	// the user saves, so the mirror fan-out + CAS apply exactly as any write.
	async function restoreVersion(version: number) {
		const past = await client.readSecret(data.app, data.env, version);
		if (!past) return;
		for (const k of order) if (k in past.data) rows[k] = past.data[k];
		dirty = true;
		viewing = null;
		message = {
			kind: 'ok',
			text: `values from v${version} overlaid on the current keys — save to promote`
		};
	}

	async function togglePin(version: number) {
		await run(async () => {
			if (pinnedVersion === version) {
				await client.unpinSecret(data.app, data.env);
				pinnedVersion = null; // eager: a pin-only change never moves the meta resync key
				return 'unpinned — head is all you need';
			}
			await client.pinSecret(data.app, data.env, version);
			pinnedVersion = version;
			return `pinned v${version} — intent only; reads still serve head (D1)`;
		});
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

	// apps are the OUTER grouping (owner: pick app, THEN env) — a data-derived
	// list; zero app names in code (§2.2-1: apps are DATA).
	const apps = $derived.by(() => {
		const out: { app: string; envs: string[] }[] = [];
		for (const p of data.paths) {
			const hit = out.find((x) => x.app === p.app);
			if (hit) hit.envs.push(p.env);
			else out.push({ app: p.app, envs: [p.env] });
		}
		return out.sort((a, b) => a.app.localeCompare(b.app));
	});
	const currentEnvs = $derived(orderEnvs(apps.find((a) => a.app === data.app)?.envs ?? []));
	const envIsPinned = (v: number) => pinnedVersion === v;

	// the search-filtered row order — empty query is identity (B2 contract).
	const visibleOrder = $derived(rankByFuzzy(query.trim(), order, (k) => [k, rows[k] ?? '']));

	async function onboard() {
		const name = onboardName.trim();
		if (!name) return;
		onboardBusy = true;
		try {
			const res = await client.onboardApp(name);
			onboardOpen = false;
			onboardName = '';
			await invalidateAll();
			await goto(`?app=${res.app}&env=${res.envs[0]}`);
			message = { kind: 'ok', text: `onboarded ${res.app} — seeded ${res.envs.join(', ')}` };
		} catch (e) {
			message = { kind: 'err', text: e instanceof ApiError ? e.message : String(e) };
		} finally {
			onboardBusy = false;
		}
	}

	async function submitAddEnv() {
		const name = addEnvName.trim();
		if (!name) return;
		const done = await run(async () => {
			await client.addEnv(data.app, name);
			return `added ${data.app}/${name} — seeded to the canonical key set`;
		});
		if (done) {
			addEnvOpen = false;
			addEnvName = '';
		}
	}
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
		<button
			type="button"
			onclick={() => (onboardOpen = true)}
			class="relative mt-2 flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
		>
			<Plus class="size-3.5" /> onboard an app
		</button>
	</div>
{:else}
	<section class="flex flex-col gap-6">
		<div
			class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-4"
		>
			<div class="flex flex-col gap-1">
				<h1 class="font-brand text-4xl font-semibold tracking-tight">Secrets</h1>
				<!-- The double-`data` KV-v2 envelope, humanized: kv/<app>/<env>. -->
				<p class="font-mono text-xs text-muted-foreground">
					kv / {data.app} / {data.env} · v{cas}
					{#if pinnedVersion !== null}
						<span
							class="ml-1 rounded-full px-1.5 py-0.5 text-[10px] {pinnedVersion === cas
								? 'bg-brand/10 text-brand'
								: 'bg-accent-amber/15 text-accent-amber'}"
							title="D1: pin is intent — reads still serve head"
						>
							<Pin class="mr-1 inline size-3 align-[-2px]" />pinned v{pinnedVersion}
							{#if pinnedVersion !== cas}· head v{cas}{/if}
						</span>
					{/if}
				</p>
			</div>
			<div class="flex flex-col gap-2 md:items-end">
				<!-- APP picker (outer) → ENV tabs (inner); + onboard / + add-env.
				     Mobile: full-width stack, select grows; desktop: right cluster. -->
				<div class="flex flex-wrap items-center gap-2 md:justify-end">
					<label class="flex min-w-0 grow items-center gap-1.5 md:grow-0">
						<span class="sr-only">App namespace</span>
						<select
							value={data.app}
							onchange={(e) => {
								const app = String(e.currentTarget.value);
								const first = apps.find((a) => a.app === app)?.envs[0] ?? 'dev';
								selectPath(app, first);
							}}
							aria-label="App namespace"
							class="w-full rounded-md border border-border bg-card px-2 py-1 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/40 md:w-auto"
						>
							{#each apps as a (a.app)}
								<option value={a.app}>{a.app}</option>
							{/each}
						</select>
					</label>
					<button
						type="button"
						onclick={() => (onboardOpen = true)}
						class="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
						aria-label="Onboard app"
					>
						<Plus class="size-3.5" /> app
					</button>
				</div>
				<div class="flex flex-wrap items-center gap-1.5 md:justify-end">
					{#each currentEnvs as env (env)}
						<button
							type="button"
							onclick={() => selectPath(data.app, env)}
							aria-pressed={env === data.env}
							aria-label={`Environment ${env}`}
							class="rounded-full border px-3 py-1 font-mono text-xs transition-colors {env ===
							data.env
								? 'border-brand bg-brand/10 text-foreground'
								: 'border-border text-muted-foreground hover:text-foreground'}"
						>
							{env}
						</button>
					{/each}
					<button
						type="button"
						onclick={() => (addEnvOpen = true)}
						class="rounded-full border border-dashed border-border px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
						aria-label="Add environment"
					>
						+ env
					</button>
				</div>
			</div>
		</div>

		{#if message && message.text}
			<p
				class="w-fit rounded-full px-3 py-1 font-mono text-xs {message.kind === 'ok'
					? 'bg-brand/10 text-brand'
					: 'text-danger'}"
				role="status"
			>
				{message.text}
			</p>
		{/if}

		<!-- Search bar (D3) + the reveal-all display switch. -->
		<div class="flex items-center gap-2">
			<div class="relative flex grow items-center">
				<Search
					class="pointer-events-none absolute left-3 size-3.5 text-muted-foreground/60"
					aria-hidden="true"
				/>
				<input
					type="search"
					bind:this={searchEl}
					bind:value={query}
					placeholder="filter keys and values…"
					aria-label="Search keys and values"
					class="w-full rounded-lg border border-border bg-card py-2 pr-9 pl-9 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
				/>
				{#if query}
					<button
						type="button"
						onclick={() => (query = '')}
						aria-label="Clear search"
						class="absolute right-2.5 p-1 text-muted-foreground hover:text-foreground"
					>
						<X class="size-3.5" />
					</button>
				{/if}
			</div>
			<button
				type="button"
				onclick={() => (revealAll = !revealAll)}
				aria-pressed={revealAll}
				aria-label={revealAll ? 'Hide all values' : 'Show all values'}
				class="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-xs transition-colors {revealAll
					? 'border-accent-amber bg-accent-amber/10 text-accent-amber'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				{#if revealAll}<EyeOff class="size-3.5" />{:else}<Eye class="size-3.5" />{/if}
				{revealAll ? 'hide all' : 'show all'}
			</button>
		</div>

		<!-- Config-file anatomy: mono table, masked values, reveal-on-press. -->
		<div class="overflow-hidden rounded-lg border border-border bg-card">
			{#each visibleOrder as k (k)}
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
						type={revealed[k] || revealAll ? 'text' : 'password'}
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
			{:else}
				<p class="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
					no keys match “{query}”
				</p>
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
						<div
							class="flex items-center justify-between rounded-md px-3 py-1.5 font-mono text-xs transition-colors hover:bg-accent"
						>
							<span class="flex items-center gap-2">
								<span>v{v}</span>
								{#if envIsPinned(v)}
									<span class="text-accent-amber" title="pinned (intent)">
										<Pin class="inline size-3 align-[-2px]" />
									</span>
								{/if}
							</span>
							<span class="flex items-center gap-1">
								<button
									type="button"
									onclick={() => void viewVersion(v)}
									class="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
									aria-label={`View v${v}`}
								>
									view
								</button>
								<button
									type="button"
									onclick={() => void diffAgainst(v)}
									class="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
									aria-label={`Diff v${v}`}
								>
									diff
								</button>
								<button
									type="button"
									onclick={() => void restoreVersion(v)}
									class="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
									aria-label={`Restore v${v}`}
								>
									restore
								</button>
								<a
									href={`/secrets/compare?app=${data.app}&env=${data.env}&from=${v}&to=${cas}`}
									class="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
									aria-label={`Compare v${v} with head`}
									title="Compare with head"
								>
									<ArrowLeftRight class="size-3.5" />
								</a>
								<button
									type="button"
									onclick={() => void togglePin(v)}
									class="rounded px-1.5 py-0.5 transition-colors {envIsPinned(v)
										? 'text-accent-amber hover:text-foreground'
										: 'text-muted-foreground hover:text-foreground'}"
									aria-label={envIsPinned(v) ? `Unpin v${v}` : `Pin v${v}`}
								>
									{#if envIsPinned(v)}
										<PinOff class="size-3.5" />
									{:else}
										<Pin class="size-3.5" />
									{/if}
								</button>
							</span>
						</div>
					{/each}
				</div>

				{#if viewing}
					<!-- read-only version payload (values masked — same rule as the
					     editor and diffs; D1: viewing a version never changes head). -->
					<div class="mt-4 rounded-lg border border-border bg-muted/30 p-3">
						<p class="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
							viewing v{viewing.version} (read-only)
						</p>
						<div class="flex flex-col gap-1">
							{#each Object.keys(viewing.data).sort() as k (k)}
								<div class="flex justify-between gap-3 font-mono text-[11px]">
									<span class="text-muted-foreground">{k}</span>
									<span class="truncate">{displayValue(viewing.data[k], revealAll)}</span>
								</div>
							{/each}
						</div>
						<button
							type="button"
							onclick={() => viewing && void restoreVersion(viewing.version)}
							class="mt-3 rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
						>
							restore these values
						</button>
					</div>
				{/if}

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
					values are masked in views and diffs too — Bao's audit (server-side) holds the true bytes
				</p>
			</aside>
		{/if}
	</section>
{/if}

{#if onboardOpen}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label="Onboard app namespace"
		onclick={(e) => e.target === e.currentTarget && (onboardOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (onboardOpen = false)}
	>
		<form
			class="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-2xl"
			onsubmit={(e) => {
				e.preventDefault();
				void onboard();
			}}
		>
			<h2 class="font-brand text-lg font-semibold">Onboard an app</h2>
			<p class="font-mono text-xs leading-relaxed text-muted-foreground">
				creates <code class="text-foreground"
					>kv/{onboardName || '<app>'}/{'{dev, staging, production}'}</code
				>
				as empty bundles — the trio is a default, not a schema, and onboarding never overwrites.
			</p>
			<label class="flex flex-col gap-1">
				<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
					>app name</span
				>
				<input
					bind:value={onboardName}
					use:focusOnMount
					required
					pattern={APP_PATTERN}
					title={APP_PATTERN + ' — apps are data: validated slugs, underscores banned'}
					class="rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
					placeholder="credit"
				/>
			</label>
			<div class="mt-2 flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (onboardOpen = false)}
					class="rounded-full px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					cancel
				</button>
				<button
					type="submit"
					disabled={onboardBusy || !onboardName.trim()}
					class="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-40"
				>
					{onboardBusy ? 'seeding…' : 'onboard'}
				</button>
			</div>
		</form>
	</div>
{/if}

{#if addEnvOpen}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label="Add environment"
		onclick={(e) => e.target === e.currentTarget && (addEnvOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (addEnvOpen = false)}
	>
		<form
			class="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-2xl"
			onsubmit={(e) => {
				e.preventDefault();
				void submitAddEnv();
			}}
		>
			<h2 class="font-brand text-lg font-semibold">Add environment to {data.app}</h2>
			<p class="font-mono text-xs leading-relaxed text-muted-foreground">
				seeded to the app's canonical key set (union of live siblings, empty values) — a late env
				never drifts a smaller shape.
			</p>
			<label class="flex flex-col gap-1">
				<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
					>env name</span
				>
				<input
					bind:value={addEnvName}
					use:focusOnMount
					required
					pattern={ENV_PATTERN}
					title={ENV_PATTERN}
					class="rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
					placeholder="lab"
				/>
			</label>
			<div class="mt-2 flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (addEnvOpen = false)}
					class="rounded-full px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					cancel
				</button>
				<button
					type="submit"
					disabled={!addEnvName.trim()}
					class="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-40"
				>
					add env
				</button>
			</div>
		</form>
	</div>
{/if}
