<script lang="ts">
	import { Check, Trash2, X } from 'lucide-svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import Button from '#lib/components/ui/button/button.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import Textarea from '#lib/components/ui/textarea/textarea.svelte';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { client, errorText } from '#lib/api/client.ts';
	import type {
		TaskComment,
		TaskDetail,
		TaskMember,
		TaskPatchInput,
		TaskPriority,
		TaskSubtask
	} from '#lib/api/types.ts';
	import { dueAtFromDate, dueDateValue, fullDateLabel } from '#lib/tasks/dates.ts';
	import { activityText, PRIORITIES, userLabel } from '#lib/tasks/labels.ts';
	import { relativeTime } from '#lib/notifications/time.ts';
	import { flash } from '#lib/flash.svelte.ts';
	import TaskDuePicker from './TaskDuePicker.svelte';

	/**
	 * The task drawer — the EXISTING right-side Sheet (no new overlay
	 * dependency). One fetch of taskGet on open and after every mutation;
	 * the workspace list refreshes through onChanged. Sections: Details
	 * (inline title, notes, priority/due/assignee, done), Checklist,
	 * Comments (author-or-admin delete, server-enforced), Activity.
	 *
	 * Read access is any tasks:*; writes need tasks:update, so the controls
	 * degrade to facts when the caller lacks it. Every failure renders
	 * lumen's copy verbatim.
	 */
	type Tab = 'details' | 'checklist' | 'comments' | 'activity';

	interface Props {
		taskId: string | null;
		/** tasks:update — hides the mutating controls (lumen enforces). */
		canEdit: boolean;
		/** Projects the caller administers (comment moderation). */
		adminProjectIds: string[];
		viewerId: string;
		onClose: () => void;
		/** The task changed: refresh the workspace's list + cards. */
		onChanged: () => void;
	}

	let { taskId, canEdit, adminProjectIds, viewerId, onClose, onChanged }: Props = $props();

	let tab = $state<Tab>('details');
	let detail = $state<TaskDetail | null>(null);
	let loading = $state(false);
	let refreshing = $state(false);
	let loadError = $state<string | null>(null);
	let actionError = $state<string | null>(null);

	let members = $state<TaskMember[]>([]);
	let membersFor = '';
	let membersLoading = $state(false);
	let membersError = $state<string | null>(null);
	let membersGen = 0;

	let titleDraft = $state('');
	let titleBaseline = $state('');
	let titleSaving = $state(false);
	let notesDraft = $state('');
	let notesBaseline = $state('');
	let notesSaving = $state(false);
	let fieldBusy = $state(false);

	let subtaskDraft = $state('');
	let subtaskBusy = $state(false);
	let commentDraft = $state('');
	let commentBusy = $state(false);

	const drawerBottom = new MediaQuery('(max-width: 767px)');
	let deleteOpen = $state(false);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);
	let commentTarget = $state<TaskComment | null>(null);
	let commentDeleting = $state(false);
	let commentDeleteError = $state<string | null>(null);

	let detailGen = 0;

	const task = $derived(detail?.task ?? null);
	const notesDirty = $derived(detail !== null && notesDraft !== notesBaseline);
	const projectAdmin = $derived(task !== null && adminProjectIds.includes(task.projectId));
	const assigneeItems = $derived.by(() => {
		const items = [
			{ value: 'unassigned', label: 'unassigned' },
			...members.map((member) => ({ value: member.userId, label: member.username }))
		];
		// A member row can disappear between reads (removal unassigns, but a
		// race is possible) — keep the current assignee selectable/visible.
		const current = task?.assignedTo;
		if (current && !items.some((item) => item.value === current)) {
			items.push({ value: current, label: task?.assigneeName ?? 'unknown member' });
		}
		return items;
	});
	const doneCount = $derived(detail?.subtasks.filter((s) => s.done).length ?? 0);
	const tabs = $derived<{ id: Tab; label: string; count: number | null }[]>([
		{ id: 'details', label: 'Details', count: null },
		{ id: 'checklist', label: 'Checklist', count: detail?.subtasks.length ?? 0 },
		{ id: 'comments', label: 'Comments', count: detail?.comments.length ?? 0 },
		{ id: 'activity', label: 'Activity', count: null }
	]);

	function adopt(next: TaskDetail) {
		// A reload (after a sibling mutation) must never eat an unsaved draft:
		// only fields that matched the previous server value follow the new one.
		const titleClean = titleDraft === titleBaseline;
		const notesClean = notesDraft === notesBaseline;
		if (titleClean) titleDraft = next.task.title;
		if (notesClean) notesDraft = next.task.notes;
		titleBaseline = next.task.title;
		notesBaseline = next.task.notes;
	}

	async function loadMembers(projectId: string) {
		membersFor = projectId;
		const gen = ++membersGen;
		membersLoading = true;
		membersError = null;
		try {
			const rows = await client.taskMembers(projectId);
			if (gen !== membersGen) return;
			members = rows;
		} catch (e) {
			if (gen !== membersGen) return;
			members = [];
			membersError = errorText(e);
		} finally {
			if (gen === membersGen) membersLoading = false;
		}
	}

	async function load(id: string, initial: boolean) {
		const gen = ++detailGen;
		if (initial) {
			loading = true;
			detail = null;
			loadError = null;
		} else {
			refreshing = true;
		}
		try {
			const next = await client.taskGet(id);
			if (gen !== detailGen || taskId !== id) return;
			detail = next;
			adopt(next);
			if (next.task.projectId !== membersFor) void loadMembers(next.task.projectId);
		} catch (e) {
			if (gen !== detailGen || taskId !== id) return;
			// A refresh that fails after a committed mutation keeps the task
			// readable and reports the failure quietly; only the FIRST read
			// owns the panel's error state.
			if (initial) loadError = errorText(e);
			else actionError = errorText(e);
		} finally {
			if (gen === detailGen) {
				loading = false;
				refreshing = false;
			}
		}
	}

	function reset() {
		// Invalidate any in-flight reads: a closed drawer must not paint a
		// late response over the next task's state.
		detailGen++;
		membersGen++;
		detail = null;
		loading = false;
		refreshing = false;
		loadError = null;
		actionError = null;
		members = [];
		membersFor = '';
		membersLoading = false;
		membersError = null;
		titleDraft = '';
		titleBaseline = '';
		titleSaving = false;
		notesDraft = '';
		notesBaseline = '';
		notesSaving = false;
		fieldBusy = false;
		subtaskDraft = '';
		subtaskBusy = false;
		commentDraft = '';
		commentBusy = false;
		deleteOpen = false;
		deleting = false;
		deleteError = null;
		commentTarget = null;
		commentDeleting = false;
		commentDeleteError = null;
	}

	$effect(() => {
		const id = taskId;
		if (!id) {
			reset();
			return;
		}
		tab = 'details';
		reset();
		loading = true;
		void load(id, true);
	});

	async function saveTitle() {
		const id = taskId;
		if (!id || !detail || titleSaving) return;
		const next = titleDraft.trim();
		if (!next) {
			titleDraft = detail.task.title;
			return;
		}
		if (next === detail.task.title) return;
		titleSaving = true;
		actionError = null;
		try {
			const updated = await client.taskUpdate(id, { title: next });
			onChanged();
			if (taskId !== id) return;
			titleBaseline = updated.title;
			titleDraft = updated.title;
			await load(id, false);
		} catch (e) {
			if (taskId === id) actionError = errorText(e);
		} finally {
			titleSaving = false;
		}
	}

	function onTitleKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void saveTitle();
			(e.currentTarget as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			if (detail) titleDraft = detail.task.title;
			(e.currentTarget as HTMLInputElement).blur();
		}
	}

	async function saveNotes() {
		const id = taskId;
		if (!id || !detail || notesSaving || !notesDirty) return;
		notesSaving = true;
		actionError = null;
		try {
			const updated = await client.taskUpdate(id, { notes: notesDraft });
			onChanged();
			if (taskId !== id) return;
			notesBaseline = updated.notes;
			notesDraft = updated.notes;
			await load(id, false);
		} catch (e) {
			if (taskId === id) actionError = errorText(e);
		} finally {
			notesSaving = false;
		}
	}

	async function patchTask(patch: TaskPatchInput) {
		const id = taskId;
		if (!id || fieldBusy) return;
		fieldBusy = true;
		actionError = null;
		try {
			await client.taskUpdate(id, patch);
			onChanged();
			if (taskId !== id) return;
			await load(id, false);
		} catch (e) {
			if (taskId === id) actionError = errorText(e);
		} finally {
			fieldBusy = false;
		}
	}

	function setDue(value: string) {
		if (!value) {
			void patchTask({ dueAt: null });
			return;
		}
		const iso = dueAtFromDate(value);
		if (!iso) {
			actionError = 'that date is not a real day';
			return;
		}
		void patchTask({ dueAt: iso });
	}

	async function toggleDone() {
		const id = taskId;
		if (!id || fieldBusy) return;
		fieldBusy = true;
		actionError = null;
		try {
			await client.taskToggle(id);
			onChanged();
			if (taskId !== id) return;
			await load(id, false);
		} catch (e) {
			if (taskId === id) actionError = errorText(e);
		} finally {
			fieldBusy = false;
		}
	}

	async function deleteTask() {
		const id = taskId;
		if (!id || deleting) return;
		deleting = true;
		deleteError = null;
		try {
			await client.taskDelete(id);
			flash({
				kind: 'ok',
				title: 'Task deleted',
				description: 'it is hidden from every live view'
			});
			onChanged();
			if (taskId === id) {
				deleteOpen = false;
				onClose();
			}
		} catch (e) {
			if (taskId === id) deleteError = errorText(e);
		} finally {
			deleting = false;
		}
	}

	async function addSubtask() {
		const id = taskId;
		const title = subtaskDraft.trim();
		if (!id || !title || subtaskBusy) return;
		subtaskBusy = true;
		actionError = null;
		try {
			await client.taskSubtaskCreate(id, title);
			onChanged();
			if (taskId !== id) return;
			subtaskDraft = '';
			await load(id, false);
		} catch (e) {
			if (taskId === id) actionError = errorText(e);
		} finally {
			subtaskBusy = false;
		}
	}

	async function toggleSubtask(subtask: TaskSubtask) {
		const id = taskId;
		if (!id || subtaskBusy) return;
		subtaskBusy = true;
		actionError = null;
		try {
			await client.taskSubtaskUpdate(id, subtask.id, { done: !subtask.done });
			onChanged();
			if (taskId !== id) return;
			await load(id, false);
		} catch (e) {
			if (taskId === id) actionError = errorText(e);
		} finally {
			subtaskBusy = false;
		}
	}

	async function removeSubtask(subtask: TaskSubtask) {
		const id = taskId;
		if (!id || subtaskBusy) return;
		subtaskBusy = true;
		actionError = null;
		try {
			await client.taskSubtaskDelete(id, subtask.id);
			onChanged();
			if (taskId !== id) return;
			await load(id, false);
		} catch (e) {
			if (taskId === id) actionError = errorText(e);
		} finally {
			subtaskBusy = false;
		}
	}

	async function addComment() {
		const id = taskId;
		const body = commentDraft.trim();
		if (!id || !body || commentBusy) return;
		commentBusy = true;
		actionError = null;
		try {
			await client.taskCommentCreate(id, body);
			onChanged();
			if (taskId !== id) return;
			commentDraft = '';
			await load(id, false);
		} catch (e) {
			if (taskId === id) actionError = errorText(e);
		} finally {
			commentBusy = false;
		}
	}

	function onCommentKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			void addComment();
		}
	}

	async function deleteComment() {
		const id = taskId;
		const target = commentTarget;
		if (!id || !target || commentDeleting) return;
		commentDeleting = true;
		commentDeleteError = null;
		try {
			await client.taskCommentDelete(id, target.id);
			onChanged();
			if (taskId !== id) return;
			commentTarget = null;
			await load(id, false);
		} catch (e) {
			if (taskId === id) commentDeleteError = errorText(e);
		} finally {
			commentDeleting = false;
		}
	}

	function canDeleteComment(comment: TaskComment): boolean {
		return canEdit && (comment.authorId === viewerId || projectAdmin);
	}

	function selectTab(next: Tab, focus: boolean) {
		tab = next;
		if (focus) document.getElementById(`task-tab-${next}`)?.focus();
	}

	function onTabKey(e: KeyboardEvent, index: number) {
		const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (e.key === 'Home' || e.key === 'End') {
			e.preventDefault();
			selectTab(e.key === 'Home' ? tabs[0].id : tabs[tabs.length - 1].id, true);
			return;
		}
		if (!delta) return;
		e.preventDefault();
		const next = tabs[(index + delta + tabs.length) % tabs.length];
		selectTab(next.id, true);
	}
</script>

<Sheet.Root
	open={taskId !== null}
	onOpenChange={(next) => {
		if (!next) onClose();
	}}
>
	<Sheet.Content
		side={drawerBottom.current ? 'bottom' : 'right'}
		class="gap-0 data-[side=bottom]:h-[88svh] data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
	>
		<Sheet.Header class="shrink-0 border-b border-border px-5 py-4 pr-14">
			<Sheet.Title class="text-xl leading-snug font-semibold tracking-tight break-words">
				{task?.title ?? 'Task'}
			</Sheet.Title>
			<Sheet.Description
				class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground"
			>
				{#if task}
					<span>{task.projectName}</span>
					<span aria-hidden="true">·</span>
					<span>created {fullDateLabel(task.createdAt)}</span>
					{#if task.done}
						<span aria-hidden="true">·</span>
						<span class="text-brand">done</span>
					{/if}
				{:else}
					<span>loading…</span>
				{/if}
				{#if refreshing}
					<span class="inline-flex items-center gap-1 text-muted-foreground/70">
						<Spinner class="size-2.5" aria-label="Refreshing task" />
						refreshing
					</span>
				{/if}
			</Sheet.Description>
		</Sheet.Header>

		{#if !loading && !loadError && detail && task}
			<div
				role="tablist"
				aria-label="Task detail sections"
				class="flex shrink-0 flex-wrap gap-1 border-b border-border px-5 pt-3 pb-2"
			>
				{#each tabs as item, index (item.id)}
					<button
						role="tab"
						type="button"
						id="task-tab-{item.id}"
						aria-selected={tab === item.id}
						aria-controls="task-panel-{item.id}"
						tabindex={tab === item.id ? 0 : -1}
						onclick={() => selectTab(item.id, false)}
						onkeydown={(e) => onTabKey(e, index)}
						class="flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/40 {tab ===
						item.id
							? 'bg-brand/10 text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						{item.label}
						{#if item.count !== null}
							<span class="text-[9px] text-muted-foreground/70">{item.count}</span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}

		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
			{#if loading}
				<div class="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Loading task">
					<Skeleton class="h-8 w-full" />
					<Skeleton class="h-24 w-full" />
					<div class="grid grid-cols-2 gap-2">
						<Skeleton class="h-9" />
						<Skeleton class="h-9" />
						<Skeleton class="h-9" />
						<Skeleton class="h-9" />
					</div>
				</div>
			{:else if loadError}
				<div
					class="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border bg-card p-4"
				>
					<p class="text-sm text-foreground">couldn't load this task</p>
					<p class="font-mono text-[11px] break-words text-muted-foreground">{loadError}</p>
					<Button
						type="button"
						variant="quiet"
						class="px-2.5 py-1"
						onclick={() => {
							if (taskId) void load(taskId, true);
						}}
					>
						Try again
					</Button>
				</div>
			{:else if detail && task}
				<div
					role="tabpanel"
					id="task-panel-{tab}"
					aria-labelledby="task-tab-{tab}"
					class="flex flex-col gap-4"
				>
					{#if tab === 'details'}
						<label class="flex flex-col gap-1">
							<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
								title
							</span>
							<Input
								bind:value={titleDraft}
								aria-label="Task title"
								class="font-sans text-sm"
								disabled={!canEdit || titleSaving}
								onblur={() => void saveTitle()}
								onkeydown={onTitleKey}
							/>
							{#if canEdit}
								<span class="font-mono text-[9px] text-muted-foreground/60">
									Enter or blur saves · Esc reverts
								</span>
							{/if}
						</label>

						<div class="flex flex-col gap-1">
							<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
								notes
							</span>
							<Textarea
								bind:value={notesDraft}
								aria-label="Task notes"
								rows={4}
								disabled={!canEdit || notesSaving}
								class="text-sm"
							/>
							{#if canEdit && notesDirty}
								<div class="flex items-center justify-end">
									<Button
										type="button"
										variant="primary"
										class="px-3 py-1 text-xs disabled:opacity-40"
										disabled={notesSaving}
										onclick={() => void saveNotes()}
									>
										{notesSaving ? 'Saving…' : 'Save notes'}
									</Button>
								</div>
							{/if}
						</div>

						<div class="grid gap-3 sm:grid-cols-2">
							<div class="flex flex-col gap-1">
								<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
									priority
								</span>
								<Select.Root
									type="single"
									items={PRIORITIES}
									value={task.priority}
									disabled={!canEdit || fieldBusy}
									onValueChange={(next) => void patchTask({ priority: next as TaskPriority })}
								>
									<Select.Trigger aria-label="Task priority" class="w-full justify-between">
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										{#each PRIORITIES as option (option.value)}
											<Select.Item value={option.value} label={option.label} />
										{/each}
									</Select.Content>
								</Select.Root>
							</div>

							<div class="flex flex-col gap-1">
								<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
									due
								</span>
								<TaskDuePicker
									value={dueDateValue(task.dueAt)}
									label="Task due date"
									disabled={!canEdit || fieldBusy}
									onchange={setDue}
								/>
							</div>

							<div class="flex flex-col gap-1 sm:col-span-2">
								<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
									assignee
								</span>
								<Select.Root
									type="single"
									items={assigneeItems}
									value={task.assignedTo ?? 'unassigned'}
									disabled={!canEdit || fieldBusy || membersLoading}
									onValueChange={(next) =>
										void patchTask({ assignedTo: next === 'unassigned' ? null : next })}
								>
									<Select.Trigger aria-label="Task assignee" class="w-full justify-between">
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										{#each assigneeItems as option (option.value)}
											<Select.Item value={option.value} label={option.label} />
										{/each}
									</Select.Content>
								</Select.Root>
								{#if membersLoading}
									<p class="font-mono text-[9px] text-muted-foreground/60">reading the roster…</p>
								{:else if membersError}
									<p class="font-mono text-[9px] break-words text-muted-foreground/70">
										roster unavailable — {membersError}
										<button
											type="button"
											class="ml-1 underline underline-offset-2 hover:text-foreground"
											onclick={() => void loadMembers(task.projectId)}
										>
											retry
										</button>
									</p>
								{/if}
							</div>
						</div>

						<div
							class="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
						>
							<div>
								<p class="text-sm text-foreground">Done</p>
								<p class="font-mono text-[10px] text-muted-foreground">
									{task.doneAt ? `done ${fullDateLabel(task.doneAt)}` : 'open'}
								</p>
							</div>
							{#if canEdit}
								<button
									type="button"
									role="checkbox"
									aria-checked={task.done}
									aria-label={task.done ? 'Mark task not done' : 'Mark task done'}
									disabled={fieldBusy}
									onclick={() => void toggleDone()}
									class="grid size-6 place-items-center rounded border transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none disabled:opacity-50 {task.done
										? 'border-brand bg-brand text-primary-foreground'
										: 'border-border text-transparent hover:border-brand/60 hover:text-brand/50'}"
								>
									<Check class="size-4" aria-hidden="true" />
								</button>
							{:else}
								<span
									class="grid size-6 place-items-center rounded border {task.done
										? 'border-brand/50 text-brand'
										: 'border-border text-transparent'}"
									aria-hidden="true"
								>
									<Check class="size-4" />
								</span>
							{/if}
						</div>

						<div
							class="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 border-t border-border pt-3 font-mono text-[10px]"
						>
							<span class="text-muted-foreground">project</span>
							<span class="truncate text-foreground">{task.projectName}</span>
							<span class="text-muted-foreground">created by</span>
							<span class="truncate text-foreground">{userLabel(task.creatorName)}</span>
							<span class="text-muted-foreground">created</span>
							<span class="text-foreground">{fullDateLabel(task.createdAt)}</span>
							<span class="text-muted-foreground">updated</span>
							<span class="text-foreground">{fullDateLabel(task.updatedAt)}</span>
							<span class="text-muted-foreground">counts</span>
							<span class="text-foreground">
								{task.commentCount} comments · {task.subtaskDone}/{task.subtaskCount} checklist
							</span>
						</div>

						{#if canEdit}
							<div class="border-t border-border pt-3">
								<Button
									type="button"
									variant="danger"
									class="gap-1.5"
									disabled={deleting}
									onclick={() => {
										deleteError = null;
										deleteOpen = true;
									}}
								>
									<Trash2 class="size-3.5" aria-hidden="true" />
									Delete task
								</Button>
							</div>
						{/if}
					{:else if tab === 'checklist'}
						<form
							class="flex items-center gap-2"
							onsubmit={(e) => {
								e.preventDefault();
								void addSubtask();
							}}
						>
							<Input
								bind:value={subtaskDraft}
								aria-label="New checklist item"
								placeholder="add a checklist item"
								autocomplete="off"
								class="w-full text-xs"
								disabled={!canEdit}
							/>
							<Button
								type="submit"
								variant="quiet"
								class="shrink-0 px-3 py-1 disabled:opacity-40"
								disabled={!canEdit || !subtaskDraft.trim() || subtaskBusy}
							>
								Add
							</Button>
						</form>

						{#if detail.subtasks.length > 0}
							<p class="font-mono text-[10px] text-muted-foreground">
								{doneCount}/{detail.subtasks.length} done
							</p>
							<div class="flex flex-col">
								{#each detail.subtasks as subtask (subtask.id)}
									<div
										class="flex items-center gap-2 border-b border-border/60 py-1.5 last:border-b-0"
									>
										<button
											type="button"
											role="checkbox"
											aria-checked={subtask.done}
											aria-label={subtask.done
												? `Mark ${subtask.title} not done`
												: `Mark ${subtask.title} done`}
											disabled={!canEdit || subtaskBusy}
											onclick={() => void toggleSubtask(subtask)}
											class="grid size-4.5 shrink-0 place-items-center rounded border transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none disabled:opacity-50 {subtask.done
												? 'border-brand bg-brand text-primary-foreground'
												: 'border-border text-transparent hover:border-brand/60 hover:text-brand/50'}"
										>
											<Check class="size-3" aria-hidden="true" />
										</button>
										<span
											class="min-w-0 flex-1 text-sm {subtask.done
												? 'text-muted-foreground line-through'
												: 'text-foreground'}"
										>
											{subtask.title}
										</span>
										{#if canEdit}
											<button
												type="button"
												aria-label="Delete {subtask.title}"
												title="Delete checklist item"
												disabled={subtaskBusy}
												class="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none disabled:opacity-40"
												onclick={() => void removeSubtask(subtask)}
											>
												<X class="size-3.5" aria-hidden="true" />
											</button>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<p
								class="rounded-md border border-dashed border-border px-3 py-6 text-center font-mono text-[11px] text-muted-foreground"
							>
								no checklist items yet
							</p>
						{/if}
					{:else if tab === 'comments'}
						<div class="flex flex-col">
							{#each detail.comments as comment (comment.id)}
								<div class="border-b border-border/60 py-2.5 first:pt-0 last:border-b-0">
									<div class="flex items-center justify-between gap-2">
										<p class="min-w-0 truncate text-xs font-medium text-foreground">
											{userLabel(comment.authorName)}{#if comment.authorId === viewerId}<span
													class="text-muted-foreground/60"
												>
													· you</span
												>{/if}
										</p>
										<div class="flex shrink-0 items-center gap-2">
											<time
												datetime={comment.createdAt}
												class="font-mono text-[10px] text-muted-foreground"
												title={fullDateLabel(comment.createdAt)}
											>
												{relativeTime(comment.createdAt)}
											</time>
											{#if canDeleteComment(comment)}
												<button
													type="button"
													aria-label="Delete comment by {userLabel(comment.authorName)}"
													title="Delete comment"
													class="grid size-6 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
													onclick={() => {
														commentDeleteError = null;
														commentTarget = comment;
													}}
												>
													<Trash2 class="size-3" aria-hidden="true" />
												</button>
											{/if}
										</div>
									</div>
									<p class="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
										{comment.body}
									</p>
								</div>
							{:else}
								<p
									class="rounded-md border border-dashed border-border px-3 py-6 text-center font-mono text-[11px] text-muted-foreground"
								>
									no comments yet
								</p>
							{/each}
						</div>

						{#if canEdit}
							<form
								class="flex flex-col gap-2 border-t border-border pt-3"
								onsubmit={(e) => {
									e.preventDefault();
									void addComment();
								}}
							>
								<Textarea
									bind:value={commentDraft}
									aria-label="New comment"
									rows={3}
									placeholder="write a comment"
									class="text-sm"
									onkeydown={onCommentKey}
								/>
								<div class="flex items-center justify-between gap-2">
									<span class="font-mono text-[9px] text-muted-foreground/60">⌘Enter sends</span>
									<Button
										type="submit"
										variant="primary"
										class="px-3 py-1 text-xs disabled:opacity-40"
										disabled={!commentDraft.trim() || commentBusy}
									>
										{commentBusy ? 'Sending…' : 'Comment'}
									</Button>
								</div>
							</form>
						{:else}
							<p class="border-t border-border pt-3 font-mono text-[10px] text-muted-foreground/70">
								writing needs tasks:update
							</p>
						{/if}
					{:else}
						<div class="flex flex-col">
							{#each detail.activity as item (item.id)}
								<div class="flex gap-3 border-b border-border/60 py-2.5 first:pt-0 last:border-b-0">
									<span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand/40" aria-hidden="true"
									></span>
									<div class="min-w-0 flex-1">
										<p class="text-sm text-muted-foreground">
											<span class="font-medium text-foreground">{userLabel(item.actorName)}</span>
											{activityText(item.verb, item.detail)}
										</p>
										<time
											datetime={item.createdAt}
											class="font-mono text-[10px] text-muted-foreground/70"
											title={fullDateLabel(item.createdAt)}
										>
											{relativeTime(item.createdAt)}
										</time>
									</div>
								</div>
							{:else}
								<p
									class="rounded-md border border-dashed border-border px-3 py-6 text-center font-mono text-[11px] text-muted-foreground"
								>
									no activity yet
								</p>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if actionError}
			<p
				class="shrink-0 border-t border-border bg-popover px-5 py-2 font-mono text-[11px] break-words text-danger"
				role="alert"
			>
				{actionError}
			</p>
		{/if}
	</Sheet.Content>
</Sheet.Root>

{#if deleteOpen && task}
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
				Delete "{task.title}"?
			</AlertDialog.Title>
			<AlertDialog.Description class="text-sm leading-relaxed text-muted-foreground">
				This is a soft delete: the task disappears from every live view and its history stays in the
				database. No restore door ships in the portal yet.
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
					onclick={() => void deleteTask()}
				>
					{deleting ? 'Deleting…' : 'Delete task'}
				</Button>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Root>
{/if}

{#if commentTarget}
	<AlertDialog.Root
		open={true}
		onOpenChange={(next) => {
			if (!next && !commentDeleting) commentTarget = null;
		}}
	>
		<AlertDialog.Content
			class="max-h-[min(90svh,36rem)] max-w-md overflow-y-auto rounded-lg border-0 bg-card p-5 shadow-2xl data-[size=default]:max-w-md data-[size=default]:sm:max-w-md"
		>
			<AlertDialog.Title class="text-xl leading-snug font-semibold tracking-tight break-words">
				Delete this comment?
			</AlertDialog.Title>
			<AlertDialog.Description
				class="text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground"
			>
				"{commentTarget.body}"
			</AlertDialog.Description>
			{#if commentDeleteError}
				<p class="mt-2 text-xs leading-relaxed break-words text-danger" role="alert">
					{commentDeleteError}
				</p>
			{/if}
			<div class="mt-4 flex items-center justify-end gap-2">
				<AlertDialog.Cancel
					class="h-auto rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
					onclick={(e) => {
						if (commentDeleting) e.preventDefault();
					}}
				>
					Cancel
				</AlertDialog.Cancel>
				<Button
					type="button"
					variant="primary"
					class="bg-danger disabled:opacity-40"
					disabled={commentDeleting}
					onclick={() => void deleteComment()}
				>
					{commentDeleting ? 'Deleting…' : 'Delete comment'}
				</Button>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Root>
{/if}
