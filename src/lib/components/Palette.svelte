<script lang="ts">
	import { Command } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import { focusOnMount } from '#lib/actions.ts';
	import { client } from '#lib/api/client.ts';
	import type { PostSummaryAdmin } from '#lib/api/types.ts';
	import type { Command as Cmd } from '#lib/commands.ts';

	interface Props {
		commands: Cmd[];
		onClose: () => void;
	}

	let { commands, onClose }: Props = $props();

	let query = $state('');
	let active = $state(0);

	// The palette searches POSTS, not just commands (owner call 2026-11-08):
	// 2+ chars triggers a debounced listPosts({q}) through the same relay the
	// API doctrine demands — the palette stays the portal's single "find
	// anything" door, and the mobile search key has something real to open.
	let postResults = $state<PostSummaryAdmin[]>([]);
	let searchSeq = 0;
	let searchTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		const q = query.trim();
		clearTimeout(searchTimer);
		if (q.length < 2) {
			postResults = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			const seq = ++searchSeq;
			try {
				const res = await client.listPosts({ q });
				if (seq === searchSeq) postResults = res.slice(0, 5);
			} catch {
				if (seq === searchSeq) postResults = [];
			}
		}, 200);
		return () => clearTimeout(searchTimer);
	});

	const postCommands = $derived<Cmd[]>(
		postResults.map((p) => ({
			id: `post.${p.slug}`,
			title: p.title,
			group: 'posts' as const,
			shortcut: p.status,
			run: () => void goto(`/posts/${p.slug}`)
		}))
	);

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		// post results already went through the server-side q filter — they
		// join verbatim; static commands filter locally as before
		const list = q
			? [...commands.filter((c) => c.title.toLowerCase().includes(q)), ...postCommands]
			: commands;
		const order = { actions: 0, posts: 1, 'go to': 2, 'open recent': 3 };
		return [...list].sort(
			(a, b) => order[a.group] - order[b.group] || a.title.localeCompare(b.title)
		);
	});

	// The active row resets whenever the query (the only input to `filtered`)
	// changes — handled at the input, not via $effect, so `active` stays a
	// plain, user-mutated $state.
	function run(cmd: Cmd | undefined) {
		if (!cmd) return;
		onClose();
		cmd.run();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(active + 1, filtered.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(active - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			run(filtered[active]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}

	function scrollActiveIntoView(el: HTMLUListElement) {
		$effect(() => {
			el.children[active]?.scrollIntoView({ block: 'nearest' });
		});
	}
</script>

<!-- Modal scrim like the blog's palette (dim + blur); sheet is command-first.
     Escape/outside close; focus returns to the opener (shell owns that half). -->
<div
	transition:fade={{ duration: 120 }}
	class="fixed inset-0 z-40 flex items-start justify-center bg-background/70 p-4 pt-[12vh] backdrop-blur-sm"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onClose();
	}}
	onkeydown={onKey}
>
	<div
		transition:fly={{ y: -10, duration: 160 }}
		class="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-label="Command palette"
	>
		<label class="flex items-center gap-3 border-b border-border px-4 focus-within:border-brand">
			<Command class="size-4 shrink-0 text-muted-foreground" />
			<input
				type="text"
				class="w-full bg-transparent py-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
				placeholder="Type a command or search…"
				bind:value={query}
				oninput={() => (active = 0)}
				aria-label="Search commands"
				use:focusOnMount
			/>
			<kbd
				class="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
				>esc</kbd
			>
		</label>
		<ul
			class="max-h-[min(48vh,360px)] overflow-y-auto p-1.5"
			use:scrollActiveIntoView
			role="listbox"
			aria-label="Commands"
		>
			{#each filtered as cmd, i (cmd.id)}
				<li role="option" aria-selected={i === active}>
					<button
						type="button"
						class="flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-2 text-left text-sm {i ===
						active
							? 'bg-accent text-foreground'
							: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
						onclick={() => run(cmd)}
						onpointerenter={() => (active = i)}
					>
						<span class="min-w-0 truncate">
							<span
								class="mr-2 font-mono text-[10px] tracking-widest text-muted-foreground/60 uppercase"
							>
								{cmd.group}
							</span>
							{cmd.title}
						</span>
						{#if cmd.shortcut}
							<span class="shrink-0 font-mono text-[10px] text-muted-foreground/70"
								>{cmd.shortcut}</span
							>
						{/if}
					</button>
				</li>
			{:else}
				<li class="px-3 py-6 text-center font-mono text-xs text-muted-foreground">
					nothing matches &ldquo;{query}&rdquo;
				</li>
			{/each}
		</ul>
	</div>
</div>
