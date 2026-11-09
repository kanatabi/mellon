<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Check, Hash, Minus, Plus, X } from 'lucide-svelte';
	import { editField } from '#lib/command-kit.ts';
	import { setPageCommands } from '#lib/page-commands.svelte.ts';
	import type { Command } from '#lib/commands.ts';
	import { ApiError, client } from '#lib/api/client.ts';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let createName = $state('');
	let busyRow: string | null = $state(null); // one mutation in flight, per-row feedback
	let message = $state<{ kind: 'ok' | 'err'; text: string } | null>(null);

	// ONE error path: lumen's guard messages arrive VERBATIM — the delete
	// refusal carries the referencing COUNT, and that number is the point.
	async function run(fn: () => Promise<string>) {
		message = null;
		try {
			message = { kind: 'ok', text: await fn() };
			await invalidateAll();
			return true;
		} catch (e) {
			message = { kind: 'err', text: e instanceof ApiError ? e.message : String(e) };
			await invalidateAll();
			return false;
		}
	}

	async function create() {
		const name = createName.trim();
		if (!name) return;
		const done = await run(async () => {
			const t = await client.createTag(name);
			return `created ${t.name} — feature it when it earns the widget`;
		});
		if (done) createName = '';
	}

	function toggleFeature(name: string, featured: boolean) {
		busyRow = name;
		void run(async () => {
			await client.updateTag(name, { featured: !featured });
			return featured
				? `unfeatured ${name}`
				: `featured ${name} — earendil lists it once a post uses it`;
		}).finally(() => (busyRow = null));
	}

	function rename(old: string, next: string) {
		const trimmed = next.trim();
		if (!trimmed || trimmed === old) return;
		busyRow = old;
		void run(async () => {
			const t = await client.updateTag(old, { name: trimmed });
			return `renamed → ${t.name} — every post followed (id-keyed) `;
		}).finally(() => (busyRow = null));
	}

	function remove(name: string) {
		if (!confirm(`Drop the tag "${name}" from the vocabulary?`)) return;
		busyRow = name;
		void run(async () => {
			await client.deleteTag(name);
			return `deleted ${name}`;
		}).finally(() => (busyRow = null));
	}

	// palette verbs for THIS page (house contract: register live, clear on leave)
	$effect(() => {
		const cmds: Command[] = [
			editField({
				id: 'tags.new',
				title: 'New tag…',
				pill: 'tag',
				seed: createName,
				commit: (v) => {
					createName = v;
					void create();
					return true;
				}
			}),
			{
				id: 'tags.feature-help',
				title: `Featured: ${data.tags.filter((t) => t.featured).length} of ${data.tags.length}`,
				group: 'actions',
				run: () => {}
			}
		];
		setPageCommands(cmds);
		return () => setPageCommands([]);
	});
</script>

<svelte:head>
	<title>tags · mellon</title>
</svelte:head>

<section class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="font-brand text-4xl font-semibold tracking-tight">Tags</h1>
			<p class="font-mono text-xs text-muted-foreground">
				{data.tags.length} names in the vocabulary — the featured ones become earendil's TOPICS
			</p>
		</div>
		<form
			class="flex items-center gap-2"
			onsubmit={(e) => {
				e.preventDefault();
				void create();
			}}
		>
			<input
				bind:value={createName}
				aria-label="New tag name"
				placeholder="new-tag-name"
				class="w-48 rounded-full border border-border bg-transparent px-3 py-1.5 font-mono text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-brand/40"
			/>
			<button
				type="submit"
				disabled={!createName.trim()}
				class="flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 font-mono text-xs font-medium text-white transition-all hover:brightness-110 disabled:opacity-40"
			>
				<Plus class="size-3.5" /> create
			</button>
		</form>
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

	<div class="overflow-hidden rounded-lg border border-border bg-card">
		<div
			class="grid grid-cols-[minmax(0,1.2fr)_auto_auto_minmax(0,1.4fr)_auto] items-center gap-3 border-b border-border px-4 py-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
		>
			<span>name</span>
			<span class="text-right">posts</span>
			<span>featured</span>
			<span>rename</span>
			<span></span>
		</div>
		{#each data.tags as tag (tag.name)}
			<div
				class="grid grid-cols-[minmax(0,1.2fr)_auto_auto_minmax(0,1.4fr)_auto] items-center gap-3 border-b border-border/60 px-4 py-2 last:border-b-0 {busyRow ===
				tag.name
					? 'opacity-50'
					: ''}"
			>
				<span class="flex items-center gap-1.5 truncate font-mono text-xs text-foreground">
					<Hash class="size-3 shrink-0 text-muted-foreground/50" aria-hidden="true" />
					{tag.name}
				</span>
				<span
					class="min-w-8 text-right font-mono text-xs {tag.posts
						? 'text-foreground'
						: 'text-muted-foreground/50'}"
				>
					{tag.posts}
				</span>
				<button
					type="button"
					onclick={() => toggleFeature(tag.name, tag.featured)}
					aria-label={tag.featured ? `Unfeature ${tag.name}` : `Feature ${tag.name}`}
					aria-pressed={tag.featured}
					class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors {tag.featured
						? 'border-brand bg-brand/10 text-brand'
						: 'border-border text-muted-foreground hover:text-foreground'}"
				>
					{#if tag.featured}<Check class="size-3" />{:else}<Minus class="size-3" />{/if}
					{tag.featured ? 'in widget' : 'hidden'}
				</button>
				<input
					class="min-w-0 rounded bg-transparent px-1 font-mono text-xs text-muted-foreground outline-none focus-visible:bg-muted focus-visible:text-foreground"
					defaultValue={tag.name}
					aria-label={`Rename ${tag.name}`}
					onchange={(e) => rename(tag.name, String(e.currentTarget.value))}
				/>
				<button
					type="button"
					onclick={() => remove(tag.name)}
					aria-label={`Delete ${tag.name}`}
					class="p-1 font-mono text-xs text-danger transition-colors hover:bg-danger/10"
				>
					<X class="size-3.5" />
				</button>
			</div>
		{/each}
	</div>

	<p class="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
		featured = listed in the earendil TOPICS widget, once it also has a published post (the widget
		never shows "0"). deletion refuses while any live post references the name — unassign in the
		editor first; renaming is free and every post follows.
	</p>
</section>
