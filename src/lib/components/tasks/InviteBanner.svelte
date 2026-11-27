<script lang="ts">
	import { Mail } from 'lucide-svelte';
	import type { TaskInvite } from '#lib/api/types.ts';
	import { expiryLabel, fullDateLabel } from '#lib/tasks/dates.ts';
	import { userLabel } from '#lib/tasks/labels.ts';
	import Button from '#lib/components/ui/button/button.svelte';

	interface Props {
		invites: TaskInvite[];
		/** The invite currently being accepted/declined. */
		busyId: string | null;
		/** An action's failure — lumen's copy, verbatim. */
		error: string | null;
		/** The inbox fetch failed (the workspace itself may still be fine). */
		loadError: string | null;
		onretry: () => void;
		onaccept: (invite: TaskInvite) => void;
		ondecline: (invite: TaskInvite) => void;
	}

	let { invites, busyId, error, loadError, onretry, onaccept, ondecline }: Props = $props();
</script>

{#if invites.length > 0 || error || loadError}
	<section
		class="flex shrink-0 flex-col gap-2 rounded-lg border border-brand/40 bg-brand/5 px-3 py-2.5"
		aria-label="Pending invitations"
	>
		<div class="flex items-center gap-2">
			<Mail class="size-3.5 text-brand" aria-hidden="true" />
			<h2 class="font-mono text-[10px] font-medium tracking-widest text-brand uppercase">
				invitations
			</h2>
			{#if invites.length > 0}
				<span class="font-mono text-[10px] text-muted-foreground">{invites.length}</span>
			{/if}
		</div>

		{#each invites as invite (invite.id)}
			<div
				class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-brand/20 pt-2 first:border-t-0 first:pt-0"
			>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm text-foreground">
						<span class="font-medium">{invite.projectName}</span>
						<span class="text-muted-foreground">— invited by {userLabel(invite.inviterName)}</span>
					</p>
					<p
						class="font-mono text-[10px] text-muted-foreground"
						title={fullDateLabel(invite.expiresAt)}
					>
						{expiryLabel(invite.expiresAt)}
					</p>
				</div>
				<div class="flex shrink-0 items-center gap-1.5">
					<Button
						type="button"
						variant="primary"
						class="px-3 py-1 text-xs disabled:opacity-40"
						disabled={busyId !== null}
						onclick={() => onaccept(invite)}
					>
						{busyId === invite.id ? 'Working…' : 'Accept'}
						<span class="sr-only"> invitation to {invite.projectName}</span>
					</Button>
					<Button
						type="button"
						variant="quiet"
						class="px-3 py-1 disabled:opacity-40"
						disabled={busyId !== null}
						onclick={() => ondecline(invite)}
					>
						Decline
						<span class="sr-only"> invitation to {invite.projectName}</span>
					</Button>
				</div>
			</div>
		{/each}

		{#if loadError}
			<div
				class="flex flex-wrap items-center gap-2 border-t border-brand/20 pt-2 first:border-t-0 first:pt-0"
			>
				<p class="min-w-0 flex-1 font-mono text-[11px] break-words text-muted-foreground">
					couldn't check invitations — {loadError}
				</p>
				<Button type="button" variant="quiet" class="px-2.5 py-1" onclick={onretry}>Retry</Button>
			</div>
		{/if}

		{#if error}
			<p class="font-mono text-[11px] break-words text-danger" role="alert">{error}</p>
		{/if}
	</section>
{/if}
