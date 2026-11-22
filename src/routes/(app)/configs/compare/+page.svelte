<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeftRight, Eye, EyeOff, GitCompareArrows, WrapText } from 'lucide-svelte';
	import * as Select from '#lib/components/ui/select/index.js';
	import Button from '#lib/components/ui/button/button.svelte';
	import { stateToggle } from '#lib/command-kit.ts';
	import { setPageCommands } from '#lib/page-commands.svelte.ts';
	import type { Command } from '#lib/commands.ts';
	import {
		alignDiff,
		diffSecrets,
		displayValue,
		DIFF_BLOCK,
		orderEnvs,
		tableDiff,
		type CompareContent
	} from '#lib/secrets-diff.ts';
	import DiffTable from '#lib/components/DiffTable.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// as const: the segmented loops hand TYPED values to the state setters
	const PRESENTATIONS = ['table', 'split', 'inline'] as const;
	const CONTENTS = ['parsed', 'raw'] as const;

	let presentation = $state<'table' | 'split' | 'inline'>('split');
	let content = $state<CompareContent>('parsed');
	let revealAll = $state(false); // display-only, never persisted (masked is the safe default)
	// wrap: long secret lines wrap instead of hiding behind a horizontal
	// scrollbar — the mobile default the owner asked for; persisted furniture.
	let wrap = $state(true);
	let hideSame = $state(false);

	// Preferences survive navigation but NOT the first-paint: read once on
	// mount (guarded by a PRIMITIVE flag — an effect that writes state it
	// reads without a convergence gate loops; the INTERNAL 200 lesson), then
	// persist on every change. localStorage: presentation taste is device
	// furniture, not page state — URLs stay shareable without it.
	let prefsLoaded = $state(false);
	$effect(() => {
		if (typeof window === 'undefined') return;
		if (!prefsLoaded) {
			prefsLoaded = true;
			const p = localStorage.getItem('mellon.compare.presentation');
			const c = localStorage.getItem('mellon.compare.content');
			if (p === 'table' || p === 'split' || p === 'inline') presentation = p;
			if (c === 'parsed' || c === 'raw') content = c;
			wrap = localStorage.getItem('mellon.compare.wrap') !== '0';
			return;
		}
		localStorage.setItem('mellon.compare.presentation', presentation);
		localStorage.setItem('mellon.compare.content', content);
		localStorage.setItem('mellon.compare.wrap', wrap ? '1' : '0');
	});

	const apps = $derived.by(() => {
		const out: { app: string; envs: string[] }[] = [];
		for (const p of data.paths) {
			const hit = out.find((x) => x.app === p.app);
			if (hit) hit.envs.push(p.env);
			else out.push({ app: p.app, envs: [p.env] });
		}
		return out.sort((a, b) => a.app.localeCompare(b.app));
	});
	const envs = $derived(orderEnvs(apps.find((a) => a.app === data.app)?.envs ?? []));
	const versionsDesc = $derived(
		[...(data.meta?.versions ?? [])].sort((a, b) => b.version - a.version)
	);
	const pinned = $derived(data.meta?.pinnedVersion ?? null);
	// one class source for every scrolling text mode (split rows + inline
	// ops) — table is cells, not lines, so wrap doesn't apply there.
	// `kind` adds the BLOCK highlight (a solid row background — the shared
	// DIFF_BLOCK language, not a font-only tint).
	const lineCls = (tone: string, kind?: 'add' | 'del' | 'same' | null) =>
		`${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} ${tone} ${
			kind && kind !== 'same' ? DIFF_BLOCK[kind] : ''
		}`;

	const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' });
	const stamp = (iso: string) => {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : fmt.format(d);
	};

	// hand-rolled query: the linter rightly bans MUTABLE URLSearchParams in
	// component state paths — and we need exactly four pairs.
	const go = (o: { app?: string; env?: string; from?: number; to?: number }) => {
		const params: [string, string | number][] = [
			['app', o.app ?? data.app],
			['env', o.env ?? data.env]
		];
		const from = o.from ?? data.fromV;
		const to = o.to ?? data.toV;
		if (from) params.push(['from', from]);
		if (to) params.push(['to', to]);
		const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
		void goto(`/secrets/compare?${qs}`);
	};
	const swap = () => go({ from: data.toV, to: data.fromV });

	const fromData = $derived(data.fromPayload?.data ?? {});
	const toData = $derived(data.toPayload?.data ?? {});
	const ready = $derived(!!(data.fromPayload && data.toPayload));
	const ops = $derived(ready ? diffSecrets(fromData, toData, content, revealAll) : []);
	const splitRows = $derived(alignDiff(ops));
	const table = $derived(tableDiff(fromData, toData));
	const changed = $derived(table.filter((r) => r.status !== 'same').length);
	const shownTable = $derived(hideSame ? table.filter((r) => r.status !== 'same') : table);

	// palette verbs for THIS page — same contract as the editor page
	$effect(() => {
		const cycle = () =>
			(presentation =
				presentation === 'split' ? 'inline' : presentation === 'inline' ? 'table' : 'split');
		const cmds: Command[] = [
			{
				id: 'compare.presentation',
				title: `Presentation: ${presentation}`,
				group: 'actions',
				shortcut: 'cycle',
				run: cycle
			},
			stateToggle({
				id: 'compare.content',
				title: content === 'parsed' ? 'Switch to raw JSON' : 'Switch to parsed view',
				on: content === 'raw',
				onHint: 'raw',
				offHint: 'parsed',
				run: () => (content = content === 'parsed' ? 'raw' : 'parsed')
			}),
			stateToggle({
				id: 'compare.wrap',
				title: wrap ? 'Turn off line wrap' : 'Wrap long lines',
				on: wrap,
				onHint: 'wrapped',
				offHint: 'nowrap',
				run: () => (wrap = !wrap)
			}),
			stateToggle({
				id: 'compare.reveal',
				title: revealAll ? 'Hide all values' : 'Show all values',
				on: revealAll,
				onHint: 'shown',
				offHint: 'masked',
				run: () => (revealAll = !revealAll)
			}),
			{ id: 'compare.swap', title: 'Swap versions', group: 'actions', run: swap },
			{
				id: 'compare.back',
				title: 'Back to editor',
				group: 'actions',
				run: () => void goto(`/secrets?app=${data.app}&env=${data.env}`)
			}
		];
		setPageCommands(cmds);
		return () => setPageCommands([]);
	});
</script>

<svelte:head>
	<title>Compare · Configs · mellon</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="flex items-center gap-2 font-brand text-3xl font-semibold tracking-tight">
				<GitCompareArrows class="size-5 text-muted-foreground" aria-hidden="true" />
				Compare versions
			</h1>
			<p class="font-mono text-xs text-muted-foreground">
				kv / {data.app} / {data.env} · v{data.fromV} → v{data.toV}
			</p>
		</div>
		<a
			href="/configs/vault?app={data.app}&env={data.env}"
			class="self-start rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground md:self-auto"
		>
			← editor
		</a>
	</div>

	<!-- pickers: app → env → versions; every change re-runs the SSR load -->
	<div class="flex flex-wrap items-center gap-2">
		<label class="flex items-center gap-1.5">
			<span class="sr-only">App namespace</span>
			<Select.Root
				type="single"
				items={apps.map((a) => ({ value: a.app, label: a.app }))}
				value={data.app}
				onValueChange={(app) =>
					go({
						app,
						env: undefined,
						from: undefined,
						to: undefined
					})}
			>
				<Select.Trigger aria-label="App namespace">
					<Select.Value />
				</Select.Trigger>
				<Select.Content>
					{#each apps as a (a.app)}
						<Select.Item value={a.app} label={a.app} />
					{/each}
				</Select.Content>
			</Select.Root>
		</label>
		<label class="flex items-center gap-1.5">
			<span class="sr-only">Environment</span>
			<Select.Root
				type="single"
				items={envs.map((env) => ({ value: env, label: env }))}
				value={String(data.env)}
				onValueChange={(env) => go({ env, from: undefined, to: undefined })}
			>
				<Select.Trigger aria-label="Environment">
					<Select.Value />
				</Select.Trigger>
				<Select.Content>
					{#each envs as env (env)}
						<Select.Item value={env} label={env} />
					{/each}
				</Select.Content>
			</Select.Root>
		</label>
		<span class="font-mono text-xs text-muted-foreground/60">from</span>
		<label class="flex items-center gap-1.5">
			<span class="sr-only">From version</span>
			<Select.Root
				type="single"
				items={versionsDesc.map((v) => ({
					value: String(v.version),
					label: `v${v.version}${v.version === pinned ? ' · pinned' : ''}${v.version === data.meta?.currentVersion ? ' · head' : ''} · ${stamp(v.createdTime)}${v.destroyed ? ' · destroyed' : ''}`
				}))}
				value={String(data.fromV)}
				onValueChange={(from) => go({ from: Number(from) })}
			>
				<Select.Trigger aria-label="From version">
					<Select.Value />
				</Select.Trigger>
				<Select.Content class="min-w-[340px]">
					{#each versionsDesc as v (v.version)}
						<Select.Item
							value={String(v.version)}
							label={`v${v.version}${v.version === pinned ? ' · pinned' : ''}${v.version === data.meta?.currentVersion ? ' · head' : ''} · ${stamp(v.createdTime)}${v.destroyed ? ' · destroyed' : ''}`}
						/>
					{/each}
				</Select.Content>
			</Select.Root>
		</label>
		<span class="font-mono text-xs text-muted-foreground/60">to</span>
		<label class="flex items-center gap-1.5">
			<span class="sr-only">To version</span>
			<Select.Root
				type="single"
				items={versionsDesc.map((v) => ({
					value: String(v.version),
					label: `v${v.version}${v.version === pinned ? ' · pinned' : ''}${v.version === data.meta?.currentVersion ? ' · head' : ''} · ${stamp(v.createdTime)}${v.destroyed ? ' · destroyed' : ''}`
				}))}
				value={String(data.toV)}
				onValueChange={(to) => go({ to: Number(to) })}
			>
				<Select.Trigger aria-label="To version">
					<Select.Value />
				</Select.Trigger>
				<Select.Content class="min-w-[340px]">
					{#each versionsDesc as v (v.version)}
						<Select.Item
							value={String(v.version)}
							label={`v${v.version}${v.version === pinned ? ' · pinned' : ''}${v.version === data.meta?.currentVersion ? ' · head' : ''} · ${stamp(v.createdTime)}${v.destroyed ? ' · destroyed' : ''}`}
						/>
					{/each}
				</Select.Content>
			</Select.Root>
		</label>
		<Button
			type="button"
			onclick={swap}
			aria-label="Swap versions"
			variant="soft"
			class="border-border p-1.5"
		>
			<ArrowLeftRight class="size-3.5" />
		</Button>
	</div>

	<!-- presentation + content + reveal -->
	<div class="flex flex-wrap items-center gap-2">
		<div
			class="flex rounded-full border border-border p-0.5"
			role="group"
			aria-label="Presentation"
		>
			{#each PRESENTATIONS as p (p)}
				<button
					type="button"
					onclick={() => (presentation = p)}
					aria-pressed={presentation === p}
					class="rounded-full px-3 py-1 font-mono text-xs capitalize transition-colors {presentation ===
					p
						? 'bg-brand/10 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{p}
				</button>
			{/each}
		</div>
		<div
			class="flex rounded-full border border-border p-0.5"
			role="group"
			aria-label="Content form"
			title="Raw JSON diffs the serialized bytes; parsed diffs sorted KEY=value lines"
		>
			{#each CONTENTS as c (c)}
				<button
					type="button"
					onclick={() => (content = c)}
					aria-pressed={content === c}
					disabled={presentation === 'table' && c === 'raw'}
					class="rounded-full px-3 py-1 font-mono text-xs transition-colors disabled:opacity-40 {content ===
					c
						? 'bg-brand/10 text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{c === 'raw' ? 'Raw JSON' : 'Parsed'}
				</button>
			{/each}
		</div>
		<Button
			type="button"
			onclick={() => (wrap = !wrap)}
			aria-pressed={wrap}
			aria-label="Wrap long lines"
			title={presentation === 'table'
				? 'Table cells wrap on their own — wrap applies to split/inline'
				: 'Wrap long diff lines instead of scrolling'}
			disabled={presentation === 'table'}
			variant="quiet"
			class="gap-1.5 disabled:opacity-40 {wrap ? 'text-foreground' : 'hover:text-foreground'}"
		>
			<WrapText class="size-3.5" />
			Wrap</Button
		>
		<Button
			type="button"
			onclick={() => (revealAll = !revealAll)}
			aria-pressed={revealAll}
			aria-label={revealAll ? 'Hide all values' : 'Show all values'}
			variant="quiet"
			class="gap-1.5 {revealAll
				? 'border-accent-amber bg-accent-amber/10 text-accent-amber'
				: 'hover:text-foreground'}"
		>
			{#if revealAll}<EyeOff class="size-3.5" />{:else}<Eye class="size-3.5" />{/if}
			{revealAll ? 'Hide values' : 'Show values'}</Button
		>
		{#if presentation === 'table'}
			<label class="ml-auto flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
				<input type="checkbox" bind:checked={hideSame} class="accent-[var(--brand)]" />
				Hide unchanged
			</label>
		{/if}
	</div>

	{#if !ready}
		<p
			class="rounded-lg border border-border bg-card px-4 py-8 text-center font-mono text-xs text-muted-foreground"
		>
			{data.meta && data.meta.versions.length <= 1
				? 'this path has a single version — nothing to compare yet'
				: 'the selected versions are unreadable (destroyed, or outside policy scope)'}
		</p>
	{:else if presentation === 'table'}
		<DiffTable
			rows={shownTable}
			keyHeading="key"
			fromHeading={`v${data.fromV}`}
			toHeading={`v${data.toV}`}
			cell={configCell}
			foot={configFoot}
		/>
		<!-- the configs' cell grammar, verbatim: the mask + the truncate +
		     the title (the redaction's hover leak-guard) + the tints -->
		{#snippet configCell(row: (typeof table)[number], side: 'from' | 'to')}
			{@const val = side === 'from' ? row.from : row.to}
			<td
				class="max-w-40 truncate px-4 py-2 {side === 'from'
					? row.status === 'removed' || row.status === 'changed'
						? `${DIFF_BLOCK.del} text-diff-del`
						: ''
					: row.status === 'added' || row.status === 'changed'
						? `${DIFF_BLOCK.add} text-diff-add`
						: ''}"
				title={val === null ? '' : displayValue(val, revealAll)}
			>
				{val === null ? '—' : displayValue(val, revealAll)}
			</td>
		{/snippet}
		{#snippet configFoot()}
			{changed} of {table.length} keys changed between v{data.fromV} and v{data.toV}
		{/snippet}
	{:else if presentation === 'split'}
		<div class="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
			<div class="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
				<p
					class="border-b border-border px-3 py-1.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
				>
					v{data.fromV} — from
				</p>
				<div class="px-3 py-2 font-mono text-[11px] leading-relaxed">
					{#each splitRows as r, i (i)}
						<div
							class={lineCls(
								r.left?.kind === 'del' ? 'text-diff-del' : 'text-muted-foreground/80',
								r.left?.kind
							)}
						>
							{r.left?.text ?? '\u00A0'}
						</div>
					{/each}
				</div>
			</div>
			<div class="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
				<p
					class="border-b border-border px-3 py-1.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
				>
					v{data.toV} — to
				</p>
				<div class="px-3 py-2 font-mono text-[11px] leading-relaxed">
					{#each splitRows as r, i (i)}
						<div
							class={lineCls(
								r.right?.kind === 'add' ? 'text-diff-add' : 'text-muted-foreground/80',
								r.right?.kind
							)}
						>
							{r.right?.text ?? '\u00A0'}
						</div>
					{/each}
				</div>
			</div>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-border bg-card px-3 py-2">
			<div class="font-mono text-[11px] leading-relaxed">
				{#each ops as op, i (i + ':' + op.kind + ':' + op.text)}
					<div
						class={lineCls(
							op.kind === 'add'
								? 'text-diff-add'
								: op.kind === 'del'
									? 'text-diff-del'
									: 'text-muted-foreground',
							op.kind
						)}
					>
						{op.kind === 'add' ? '+' : op.kind === 'del' ? '-' : '\u00A0'}
						{op.text}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
		values mask by default (short ones read as-is); "show values" is display-only and resets on
		reload — Bao's audit holds the true bytes
	</p>
</section>
