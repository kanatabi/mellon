<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { BellOff, CheckCheck } from 'lucide-svelte';
	import { client, errorText } from '#lib/api/client.ts';
	import type { NotificationItem } from '#lib/api/types.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { isSameOriginPath, renderNotificationBody } from '#lib/notifications/render.ts';
	import { relativeTime } from '#lib/notifications/time.ts';

	/**
	 * The bell's panel: PULL-ON-OPEN only (no polling, no timers). Mounting
	 * the panel IS the refresh trigger — each open fetches a fresh page.
	 * Lumen's copy is rendered as-is (ghost-field); bodies pass through the
	 * shared sanitizer; click-through accepts same-origin paths only.
	 */
	interface Props {
		/** The bell's current unread count — gates the "mark all" action. */
		unread: number;
		/** One row became read: the bell decrements its badge. */
		onRead: () => void;
		onAllRead: () => void;
		/** The bell owns the popover; close it after a click-through. */
		onClose: () => void;
	}

	let { unread, onRead, onAllRead, onClose }: Props = $props();

	/** A wire row plus its sanitized body, computed once per fetch. */
	interface Row extends NotificationItem {
		html: string;
	}

	let items = $state<Row[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let markingAll = $state(false);
	// Stale-response guard: a retry (or a reopen) must not let an older
	// request overwrite the newer list.
	let generation = 0;

	async function load() {
		const gen = ++generation;
		loading = true;
		loadError = null;
		try {
			const page = await client.notifications({ limit: 20 });
			if (gen !== generation) return;
			items = page.items.map((item) => ({ ...item, html: renderNotificationBody(item.body) }));
		} catch (e) {
			if (gen !== generation) return;
			// Quiet inline failure — an admin-plane outage never becomes a
			// thrown page. errorText keeps lumen's copy verbatim.
			loadError = errorText(e);
		} finally {
			if (gen === generation) loading = false;
		}
	}

	onMount(() => {
		void load();
	});

	async function markReadAndGo(item: Row) {
		if (item.readAt === null) {
			item.readAt = new Date().toISOString();
			onRead();
		}
		// Best-effort: the row is the user's intent. A failed mark is logged
		// quietly and MUST NOT trap the click-through.
		try {
			await client.notificationMarkRead(item.id);
		} catch {
			/* quiet degradation: the next layout load re-reads lumen's truth */
		}
		const target = typeof item.payload?.url === 'string' ? item.payload.url : null;
		// Same-origin paths only — a notification must never point the
		// portal somewhere its bearer does not belong.
		if (target !== null && isSameOriginPath(target)) {
			onClose();
			await goto(target);
		}
	}

	async function markAll() {
		if (markingAll || unread === 0) return;
		markingAll = true;
		actionError = null;
		const now = new Date().toISOString();
		for (const item of items) item.readAt ??= now;
		// Optimistic, per the brief: the visible rows and the badge move now;
		// the call is best-effort and a failure is surfaced quietly below.
		onAllRead();
		try {
			await client.notificationsMarkAllRead();
		} catch (e) {
			actionError = errorText(e);
		} finally {
			markingAll = false;
		}
	}

	function onRowClick(e: MouseEvent, item: Row) {
		// The body's inline links are their own destinations — let SvelteKit
		// route them instead of double-navigating through payload.url.
		if ((e.target as HTMLElement).closest('a')) return;
		void markReadAndGo(item);
	}

	function onRowKey(e: KeyboardEvent, item: Row) {
		if (e.target !== e.currentTarget) return; // a nested link owns its keys
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			void markReadAndGo(item);
		}
	}
</script>

<div class="flex max-h-[min(75vh,32rem)] flex-col">
	<div class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
		<h2 class="text-sm font-semibold text-foreground">Notifications</h2>
		<Button
			type="button"
			variant="soft"
			size="xs"
			class="gap-1.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
			disabled={unread === 0 || loading || markingAll}
			onclick={() => void markAll()}
		>
			<CheckCheck class="size-3" aria-hidden="true" />
			Mark all read
		</Button>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
		{#if loading}
			<div class="space-y-4 p-4" role="status" aria-busy="true" aria-label="Loading notifications">
				{#each [0, 1, 2] as i (i)}
					<div class="space-y-2">
						<Skeleton class="h-3 w-2/3" />
						<Skeleton class="h-3 w-full" />
					</div>
				{/each}
			</div>
		{:else if loadError}
			<div class="space-y-2 p-4">
				<p class="text-sm text-muted-foreground">couldn't load notifications</p>
				<p class="font-mono text-[11px] break-words text-muted-foreground">{loadError}</p>
				<Button type="button" variant="quiet" class="mt-1 px-2.5 py-1" onclick={() => void load()}>
					Try again
				</Button>
			</div>
		{:else if items.length === 0}
			<div class="flex flex-col items-center gap-2 px-4 py-10 text-center text-muted-foreground">
				<BellOff class="size-5" aria-hidden="true" />
				<p class="text-sm">you're all caught up</p>
			</div>
		{:else}
			<ul aria-label="Notifications">
				{#each items as item (item.id)}
					{@const target = typeof item.payload?.url === 'string' ? item.payload.url : null}
					{@const opens = target !== null && isSameOriginPath(target)}
					{@const rowUnread = item.readAt === null}
					<li class="border-b border-border/60 last:border-b-0">
						<!-- A row is a button-shaped target (the house clickable-row
						     pattern): Enter/Space mirror the click; nested body links
						     keep their own navigation. The popover owns Esc/outside. -->
						<div
							role="button"
							tabindex="0"
							data-slot="notification-row"
							data-unread={rowUnread ? 'true' : undefined}
							class="flex cursor-pointer items-start gap-2.5 px-4 py-3 transition-colors outline-none last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-inset {rowUnread
								? 'bg-brand/5'
								: ''}"
							onclick={(e) => onRowClick(e, item)}
							onkeydown={(e) => onRowKey(e, item)}
						>
							<span
								aria-hidden="true"
								class="mt-1.5 size-1.5 shrink-0 rounded-full {rowUnread
									? 'bg-brand'
									: 'bg-transparent'}"
							></span>
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline justify-between gap-3">
									<p
										class="truncate text-sm {rowUnread
											? 'font-semibold text-foreground'
											: 'text-muted-foreground'}"
									>
										{item.title}
									</p>
									<time
										datetime={item.createdAt}
										class="shrink-0 font-mono text-[10px] text-muted-foreground"
									>
										{relativeTime(item.createdAt)}
									</time>
								</div>
								{#if item.html}
									<div
										class="notification-body mt-1 text-xs/relaxed break-words text-muted-foreground [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_b]:font-semibold [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono"
									>
										<!-- eslint-disable-next-line svelte/no-at-html-tags -- item.html IS sanitized output of renderNotificationBody (DOMPurify + lumen's inline allowlist; href/style re-scoped), never raw wire HTML -->
										{@html item.html}
									</div>
								{/if}
								{#if opens}
									<span class="sr-only">opens {target}</span>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if actionError}
		<p
			class="shrink-0 border-t border-border px-4 py-2 text-[11px] break-words text-muted-foreground"
		>
			mark all read failed — <span class="font-mono">{actionError}</span>
		</p>
	{/if}
</div>
