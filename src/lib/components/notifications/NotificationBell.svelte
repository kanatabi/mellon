<script lang="ts">
	import { Bell } from 'lucide-svelte';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import NotificationPanel from './NotificationPanel.svelte';

	/**
	 * The topbar bell (the notifications round): the badge is the LAYOUT's
	 * unread count (server-pulled on navigation, fail-soft at 0 there);
	 * in-session reads move it optimistically. The panel itself is
	 * PULL-ON-OPEN — mounted per open, so every open is a fresh page.
	 */
	interface Props {
		count: number;
	}

	let { count: serverCount }: Props = $props();

	// In-session reads move the badge optimistically; the layout's next
	// navigation load is lumen's truth and RESETS the adjustment. The
	// server render starts from the count, so the badge is in the first
	// paint (no hydration flash).
	let readInSession = $state(0);
	const unread = $derived(Math.max(0, serverCount - readInSession));
	$effect(() => {
		void serverCount;
		readInSession = 0;
	});

	let open = $state(false);
	// 0 hides the badge; 100+ stays honest about being a cap.
	const badge = $derived(unread > 99 ? '99+' : unread > 0 ? String(unread) : '');
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
		class="relative flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
	>
		<Bell class="size-4" aria-hidden="true" />
		{#if badge}
			<span
				aria-hidden="true"
				data-slot="notification-badge"
				class="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 font-mono text-[9px] leading-none font-bold text-primary-foreground"
			>
				{badge}
			</span>
		{/if}
	</Popover.Trigger>

	<Popover.Content
		side="bottom"
		align="end"
		class="w-96 max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0"
	>
		{#if open}
			<NotificationPanel
				{unread}
				onRead={() => (readInSession += 1)}
				onAllRead={() => (readInSession = serverCount)}
				onClose={() => (open = false)}
			/>
		{/if}
	</Popover.Content>
</Popover.Root>
