<script lang="ts">
	import { onMount } from 'svelte';
	import { Check, RotateCcw, Trash2, UserMinus, UserPlus } from 'lucide-svelte';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import Button from '#lib/components/ui/button/button.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { client, errorText } from '#lib/api/client.ts';
	import type {
		TaskInvite,
		TaskMember,
		TaskPerson,
		TaskProject,
		TaskRole
	} from '#lib/api/types.ts';
	import { expiryLabel } from '#lib/tasks/dates.ts';
	import { mentionQuery } from '#lib/tasks/people.ts';
	import { flash } from '#lib/flash.svelte.ts';

	/**
	 * The project settings door — reached only from a project row the
	 * caller administers AND while holding tasks:manage (lumen enforces
	 * both; the menu is courtesy). Rename, complete/reopen, soft delete,
	 * the member roster (roles + removal, last-admin courtesy guards), and
	 * the invite form that makes the multi-user feature usable end to end.
	 *
	 * Every write goes through client.*; every failure renders lumen's copy
	 * verbatim (ghost field), including the last-admin 409 the courtesy
	 * guards normally keep out of reach.
	 */
	interface Props {
		project: TaskProject;
		viewerId: string;
		onClose: () => void;
		onChanged: () => void;
		onDeleted: (id: string) => void;
	}

	let { project, viewerId, onClose, onChanged, onDeleted }: Props = $props();

	let open = $state(true);

	// Local truth for the header and the completed field: the project prop
	// refreshes from the workspace, but the dialog must not wait for it to
	// paint the answer to its own write. The dialog remounts per open, so
	// the initial prop IS the honest seed.
	// svelte-ignore state_referenced_locally
	let savedName = $state(project.name);
	// svelte-ignore state_referenced_locally
	let nameDraft = $state(project.name);
	// svelte-ignore state_referenced_locally
	let completed = $state(project.completedAt !== null);

	let members = $state<TaskMember[]>([]);
	let membersLoading = $state(true);
	let membersError = $state<string | null>(null);
	let membersGen = 0;

	let actionError = $state<string | null>(null);
	let busy = $state(false);

	let inviteName = $state('');
	let inviteInput = $state<HTMLInputElement | null>(null);
	let inviting = $state(false);
	let inviteError = $state<string | null>(null);
	// the @-mention typeahead: server rows, one in-flight generation, and a
	// focus/keyboard contract that never turns the free-text path off
	let people = $state<TaskPerson[]>([]);
	let peopleOpen = $state(false);
	let peopleLoading = $state(false);
	let peopleError = $state<string | null>(null);
	let peopleGen = 0;
	let activePerson = $state(-1);
	let peopleTimer: ReturnType<typeof setTimeout> | undefined;
	let lastInvite = $state<{ invite: TaskInvite; username: string } | null>(null);
	let revoking = $state(false);

	let roleBusyId = $state<string | null>(null);
	let removeTarget = $state<TaskMember | null>(null);
	let removing = $state(false);
	let removeError = $state<string | null>(null);

	let deleteOpen = $state(false);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);

	const adminCount = $derived(members.filter((m) => m.role === 'admin').length);
	const nameDirty = $derived(nameDraft.trim() !== '' && nameDraft.trim() !== savedName);

	async function loadMembers() {
		const gen = ++membersGen;
		membersLoading = true;
		membersError = null;
		try {
			const rows = await client.taskMembers(project.id);
			if (gen !== membersGen) return;
			members = rows;
		} catch (e) {
			if (gen !== membersGen) return;
			membersError = errorText(e);
		} finally {
			if (gen === membersGen) membersLoading = false;
		}
	}

	onMount(() => {
		void loadMembers();
	});

	async function rename() {
		const next = nameDraft.trim();
		if (!next || !nameDirty) return;
		busy = true;
		actionError = null;
		try {
			await client.taskProjectRename(project.id, next);
			savedName = next;
			nameDraft = next;
			flash({ kind: 'ok', title: 'Project renamed', description: next });
			onChanged();
		} catch (e) {
			actionError = errorText(e);
		} finally {
			busy = false;
		}
	}

	async function toggleComplete() {
		busy = true;
		actionError = null;
		try {
			const next = await client.taskProjectComplete(project.id, !completed);
			completed = next;
			flash({
				kind: 'ok',
				title: next ? 'Project completed' : 'Project reopened',
				description: next
					? 'the flag is a shelf label — nothing was deleted'
					: 'the project reads as live again'
			});
			onChanged();
		} catch (e) {
			actionError = errorText(e);
		} finally {
			busy = false;
		}
	}

	async function chooseRole(member: TaskMember, role: TaskRole) {
		if (member.role === role || roleBusyId) return;
		roleBusyId = member.userId;
		actionError = null;
		try {
			await client.taskMemberRole(project.id, member.userId, role);
			flash({
				kind: 'ok',
				title: 'Role updated',
				description: `${member.name} is now ${role}`
			});
			await loadMembers();
			onChanged();
		} catch (e) {
			// a last-admin 409 is the server's copy, verbatim
			actionError = errorText(e);
		} finally {
			roleBusyId = null;
		}
	}

	async function removeMember() {
		const target = removeTarget;
		if (!target) return;
		removing = true;
		removeError = null;
		try {
			await client.taskMemberRemove(project.id, target.userId);
			removeTarget = null;
			flash({
				kind: 'ok',
				title: 'Member removed',
				description:
					target.userId === viewerId
						? 'you left the project — its tasks are no longer here'
						: `${target.name}'s tasks in this project are unassigned`
			});
			await loadMembers();
			onChanged();
			if (target.userId === viewerId) onClose();
		} catch (e) {
			removeError = errorText(e);
		} finally {
			removing = false;
		}
	}

	// A leading "@" switches the field to the people search; plain typing
	// stays the free-text username path (the server still resolves it). The
	// effect owns the debounce and the stale-response guard: every keystroke
	// bumps the generation, so an older response can never overwrite a newer.
	$effect(() => {
		const term = mentionQuery(inviteName);
		peopleError = null;
		if (term === null || term.length === 0) {
			peopleGen++; // any in-flight response is now stale
			people = [];
			peopleOpen = false;
			peopleLoading = false;
			activePerson = -1;
			return;
		}
		peopleOpen = true;
		const gen = ++peopleGen;
		peopleLoading = true;
		clearTimeout(peopleTimer);
		peopleTimer = setTimeout(async () => {
			try {
				const rows = await client.taskInviteeSearch(project.id, term);
				if (gen !== peopleGen) return;
				people = rows;
				activePerson = rows.length > 0 ? 0 : -1;
			} catch (e) {
				if (gen !== peopleGen) return;
				people = [];
				peopleError = errorText(e);
				activePerson = -1;
			} finally {
				if (gen === peopleGen) peopleLoading = false;
			}
		}, 160);
		return () => clearTimeout(peopleTimer);
	});

	function chooseInvitee(person: TaskPerson) {
		// The FIELD carries the username (the invite wire's lookup key); the
		// stored invite is lumen's users.id, resolved server-side.
		inviteName = person.username;
		peopleOpen = false;
		people = [];
		activePerson = -1;
		inviteInput?.focus();
	}

	function onInviteKeydown(event: KeyboardEvent) {
		if (!peopleOpen) return;
		if (event.key === 'ArrowDown' && people.length > 0) {
			event.preventDefault();
			activePerson = (activePerson + 1) % people.length;
		} else if (event.key === 'ArrowUp' && people.length > 0) {
			event.preventDefault();
			activePerson = activePerson <= 0 ? people.length - 1 : activePerson - 1;
		} else if (event.key === 'Enter' && activePerson >= 0 && people[activePerson]) {
			// Enter commits the highlighted person instead of submitting the form
			event.preventDefault();
			chooseInvitee(people[activePerson]);
		} else if (event.key === 'Escape' || event.key === 'Tab') {
			peopleOpen = false;
		}
	}

	async function invite() {
		// The field's friendly "@name" spelling is accepted here too; the wire
		// carries the bare handle (lumen resolves it to the users.id).
		const username = inviteName.trim().replace(/^@/, '');
		if (!username || inviting) return;
		inviting = true;
		inviteError = null;
		try {
			const invite = await client.taskInviteCreate(project.id, username);
			lastInvite = { invite, username };
			inviteName = '';
			flash({
				kind: 'ok',
				title: 'Invitation sent',
				description: `${username} · ${expiryLabel(invite.expiresAt)}`
			});
			onChanged();
		} catch (e) {
			inviteError = errorText(e);
		} finally {
			inviting = false;
		}
	}

	async function revokeInvite() {
		if (!lastInvite || revoking) return;
		revoking = true;
		inviteError = null;
		try {
			await client.taskInviteRevoke(project.id, lastInvite.invite.id);
			lastInvite = null;
			flash({ kind: 'ok', title: 'Invitation revoked' });
			onChanged();
		} catch (e) {
			inviteError = errorText(e);
		} finally {
			revoking = false;
		}
	}

	async function deleteProject() {
		if (deleting) return;
		deleting = true;
		deleteError = null;
		try {
			await client.taskProjectDelete(project.id);
			flash({
				kind: 'ok',
				title: 'Project deleted',
				description: 'it is hidden from every live view; history stays'
			});
			onDeleted(project.id);
			onClose();
		} catch (e) {
			deleteError = errorText(e);
			deleting = false;
		}
	}

	const initial = (name: string | null) => name?.slice(0, 1).toUpperCase() ?? '?';
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) onClose();
	}}
>
	<Dialog.Content class="max-h-[min(90svh,44rem)] overflow-y-auto sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title class="text-xl font-semibold tracking-tight">Project settings</Dialog.Title>
			<Dialog.Description class="text-xs leading-relaxed text-muted-foreground">
				{savedName}
			</Dialog.Description>
		</Dialog.Header>

		{#if actionError}
			<p class="text-xs leading-relaxed break-words text-danger" role="alert">{actionError}</p>
		{/if}

		<!-- rename -->
		<form
			class="flex flex-col gap-1.5"
			onsubmit={(e) => {
				e.preventDefault();
				void rename();
			}}
		>
			<label class="flex flex-col gap-1">
				<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
					name
				</span>
				<Input bind:value={nameDraft} aria-label="Project name" class="text-sm" />
			</label>
			<div class="flex items-center justify-end">
				<Button
					type="submit"
					variant="quiet"
					class="px-3 py-1 disabled:opacity-40"
					disabled={!nameDirty || busy}
				>
					Save name
				</Button>
			</div>
		</form>

		<!-- completion flag -->
		<div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
			<div>
				<p class="text-sm text-foreground">{completed ? 'Completed' : 'Live'}</p>
				<p class="font-mono text-[10px] text-muted-foreground">
					completed is a shelf label — tasks stay readable
				</p>
			</div>
			<Button
				type="button"
				variant="quiet"
				class="gap-1.5 px-3 py-1"
				disabled={busy}
				onclick={() => void toggleComplete()}
			>
				{#if completed}
					<RotateCcw class="size-3" aria-hidden="true" />
				{:else}
					<Check class="size-3" aria-hidden="true" />
				{/if}
				{completed ? 'Reopen project' : 'Complete project'}
			</Button>
		</div>

		<!-- members -->
		<div class="flex flex-col gap-2 border-t border-border pt-3">
			<div class="flex items-center justify-between gap-2">
				<div>
					<p class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
						members
					</p>
					<p class="font-mono text-[10px] text-muted-foreground/70">
						{#if membersLoading}
							reading the roster…
						{:else if membersError}
							roster unavailable
						{:else}
							{members.length}
							{members.length === 1 ? 'person' : 'people'} · {adminCount}
							{adminCount === 1 ? 'admin' : 'admins'}
						{/if}
					</p>
				</div>
				<Button
					type="button"
					variant="soft"
					class="font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
					disabled={membersLoading}
					onclick={() => void loadMembers()}
				>
					Refresh
				</Button>
			</div>

			{#if membersLoading}
				<div class="flex flex-col gap-1.5" role="status" aria-label="Loading members">
					{#each [0, 1] as i (i)}
						<Skeleton class="h-9 w-full" />
					{/each}
				</div>
			{:else if membersError}
				<div class="flex flex-col gap-1">
					<p class="font-mono text-[11px] break-words text-muted-foreground">
						couldn't load the roster — {membersError}
					</p>
					<Button
						type="button"
						variant="quiet"
						class="w-fit px-2.5 py-1"
						onclick={() => void loadMembers()}
					>
						Try again
					</Button>
				</div>
			{:else}
				<div class="flex flex-col gap-1">
					{#each members as member (member.userId)}
						{@const lastAdmin = member.role === 'admin' && adminCount <= 1}
						<div class="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1.5">
							<span
								aria-hidden="true"
								class="grid size-6 shrink-0 place-items-center rounded-full bg-brand/15 font-mono text-[9px] font-bold text-brand uppercase"
							>
								{initial(member.name)}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm">
									{member.name}{#if member.userId === viewerId}<span
											class="text-muted-foreground/60"
										>
											· you</span
										>{/if}
								</span>
								<span class="block truncate font-mono text-[10px] text-muted-foreground/70">
									@{member.username}
								</span>
							</span>
							<Select.Root
								type="single"
								items={[
									{ value: 'admin', label: 'admin' },
									{ value: 'member', label: 'member' }
								]}
								value={member.role}
								disabled={roleBusyId !== null || lastAdmin}
								onValueChange={(role) => void chooseRole(member, role as TaskRole)}
							>
								<Select.Trigger
									size="sm"
									aria-label="Role for {member.name}"
									title={lastAdmin ? 'a project keeps at least one admin' : undefined}
									class="w-24 justify-between"
								>
									<Select.Value />
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="admin" label="admin" />
									<Select.Item value="member" label="member" />
								</Select.Content>
							</Select.Root>
							<Button
								type="button"
								variant="soft"
								class="rounded-full p-1 text-muted-foreground hover:text-danger disabled:opacity-30"
								aria-label="Remove {member.name} from {savedName}"
								title={lastAdmin ? 'a project keeps at least one admin' : 'Remove member'}
								disabled={lastAdmin || roleBusyId !== null}
								onclick={() => {
									removeError = null;
									removeTarget = member;
								}}
							>
								<UserMinus class="size-3.5" aria-hidden="true" />
							</Button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- invite -->
			<form
				class="flex items-end gap-2 pt-1"
				onsubmit={(e) => {
					e.preventDefault();
					void invite();
				}}
			>
				<div class="flex min-w-0 flex-1 flex-col gap-1">
					<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
						invite · @ to search
					</span>
					<div class="relative">
						<Input
							bind:ref={inviteInput}
							bind:value={inviteName}
							aria-label="Username or @name to invite"
							role="combobox"
							aria-expanded={peopleOpen}
							aria-controls="invite-people"
							aria-autocomplete="list"
							aria-activedescendant={activePerson >= 0
								? `invite-person-${activePerson}`
								: undefined}
							placeholder="@username or email"
							autocomplete="off"
							class="w-full text-xs"
							onkeydown={onInviteKeydown}
							onblur={() => (peopleOpen = false)}
						/>
						{#if peopleOpen}
							<div
								id="invite-people"
								role="listbox"
								aria-label="Matching accounts"
								class="absolute bottom-full z-20 mb-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-xl"
							>
								{#if peopleLoading && people.length === 0}
									<p class="px-2 py-1.5 font-mono text-[10px] text-muted-foreground/60">
										searching…
									</p>
								{:else if peopleError}
									<p class="px-2 py-1.5 font-mono text-[10px] break-words text-muted-foreground/70">
										search unavailable — {peopleError}
									</p>
								{:else if people.length === 0}
									<p class="px-2 py-1.5 font-mono text-[10px] text-muted-foreground/60">
										no matching account
									</p>
								{:else}
									{#each people as person, index (person.username)}
										<button
											type="button"
											id="invite-person-{index}"
											role="option"
											aria-selected={index === activePerson}
											class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors {index ===
											activePerson
												? 'bg-accent text-foreground'
												: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
											onmousedown={(e) => e.preventDefault()}
											onclick={() => chooseInvitee(person)}
											onmouseenter={() => (activePerson = index)}
										>
											<span
												aria-hidden="true"
												class="grid size-5 shrink-0 place-items-center rounded-full bg-brand/15 font-mono text-[8px] font-bold text-brand uppercase"
											>
												{initial(person.name)}
											</span>
											<span class="min-w-0 flex-1 truncate">{person.name}</span>
											<span
												class="max-w-28 truncate font-mono text-[10px] text-muted-foreground/70"
											>
												@{person.username}
											</span>
										</button>
									{/each}
								{/if}
							</div>
						{/if}
					</div>
				</div>
				<Button
					type="submit"
					variant="primary"
					class="gap-1.5 px-3 py-2 disabled:opacity-40"
					disabled={!inviteName.trim() || inviting}
				>
					<UserPlus class="size-3.5" aria-hidden="true" />
					{inviting ? 'Inviting…' : 'Invite'}
				</Button>
			</form>

			{#if lastInvite}
				<div
					class="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-2 py-1.5"
				>
					<p class="min-w-0 flex-1 font-mono text-[11px] text-muted-foreground">
						invited <span class="text-foreground">{lastInvite.username}</span> · {expiryLabel(
							lastInvite.invite.expiresAt
						)}
					</p>
					<Button
						type="button"
						variant="quiet"
						class="px-2.5 py-1"
						disabled={revoking}
						onclick={() => void revokeInvite()}
					>
						{revoking ? 'Revoking…' : 'Revoke'}
					</Button>
				</div>
			{/if}

			{#if inviteError}
				<p class="font-mono text-[11px] break-words text-danger" role="alert">{inviteError}</p>
			{/if}
		</div>

		<!-- the soft delete: warned, confirmed, and honestly labelled -->
		<div class="border-t border-border pt-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-xs leading-relaxed text-muted-foreground">
					delete is soft — every live view hides the project and its tasks; there is no restore door
					in the portal yet.
				</p>
				<Button
					type="button"
					variant="danger"
					class="gap-1.5"
					disabled={busy || deleting}
					onclick={() => {
						deleteError = null;
						deleteOpen = true;
					}}
				>
					<Trash2 class="size-3.5" aria-hidden="true" />
					Delete project
				</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>

{#if removeTarget}
	<AlertDialog.Root
		open={true}
		onOpenChange={(next) => {
			if (!next && !removing) removeTarget = null;
		}}
	>
		<AlertDialog.Content
			class="max-h-[min(90svh,36rem)] max-w-md overflow-y-auto rounded-lg border-0 bg-card p-5 shadow-2xl data-[size=default]:max-w-md data-[size=default]:sm:max-w-md"
		>
			<AlertDialog.Title class="text-xl leading-snug font-semibold tracking-tight break-words">
				Remove {removeTarget.name} from {savedName}?
			</AlertDialog.Title>
			<AlertDialog.Description class="text-sm leading-relaxed text-muted-foreground">
				<span class="font-mono text-[10px] text-muted-foreground/70">@{removeTarget.username}</span>
				<br />
				Their tasks in this project become unassigned. Their account and every other project are untouched.
			</AlertDialog.Description>
			{#if removeError}
				<p class="mt-2 text-xs leading-relaxed break-words text-danger" role="alert">
					{removeError}
				</p>
			{/if}
			<div class="mt-4 flex items-center justify-end gap-2">
				<AlertDialog.Cancel
					class="h-auto rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
					onclick={(e) => {
						if (removing) e.preventDefault();
					}}
				>
					Cancel
				</AlertDialog.Cancel>
				<Button
					type="button"
					variant="primary"
					class="bg-danger disabled:opacity-40"
					disabled={removing}
					onclick={() => void removeMember()}
				>
					{removing ? 'Removing…' : 'Remove member'}
				</Button>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Root>
{/if}

{#if deleteOpen}
	<AlertDialog.Root
		open={true}
		onOpenChange={(next) => {
			if (!next && !deleting) deleteOpen = false;
		}}
	>
		<AlertDialog.Content
			class="max-h-[min(90svh,36rem)] max-w-md overflow-y-auto rounded-lg border-0 bg-card p-5 shadow-2xl data-[size=default]:max-w-md data-[size=default]:sm:max-w-md"
		>
			<AlertDialog.Title class="text-xl leading-snug font-semibold tracking-tight break-words">
				Delete "{savedName}"?
			</AlertDialog.Title>
			<AlertDialog.Description class="text-sm leading-relaxed text-muted-foreground">
				This is a soft delete: the project and its tasks disappear from every live view, history
				stays in the database, and no restore door ships in the portal yet.
			</AlertDialog.Description>
			{#if deleteError}
				<p class="mt-2 text-xs leading-relaxed break-words text-danger" role="alert">
					{deleteError}
				</p>
			{/if}
			<div class="mt-4 flex items-center justify-end gap-2">
				<AlertDialog.Cancel
					class="h-auto rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
					onclick={(e) => {
						if (deleting) e.preventDefault();
					}}
				>
					Cancel
				</AlertDialog.Cancel>
				<Button
					type="button"
					variant="primary"
					class="bg-danger disabled:opacity-40"
					disabled={deleting}
					onclick={() => void deleteProject()}
				>
					{deleting ? 'Deleting…' : 'Delete project'}
				</Button>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Root>
{/if}
