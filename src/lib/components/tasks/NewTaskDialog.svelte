<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import Button from '#lib/components/ui/button/button.svelte';
	import Input from '#lib/components/ui/input/input.svelte';
	import { client, errorText } from '#lib/api/client.ts';
	import type { TaskItem, TaskMember, TaskPriority, TaskProject } from '#lib/api/types.ts';
	import { PRIORITIES } from '#lib/tasks/labels.ts';
	import { memberLabels } from '#lib/tasks/people.ts';
	import { dueAtFromDate } from '#lib/tasks/dates.ts';
	import TaskDuePicker from './TaskDuePicker.svelte';

	/**
	 * The new-task composer: the minimum the server asks for (project, title,
	 * priority, due, assignee). The assignee roster is the project's members —
	 * read on open and re-read on every project change; a roster failure never
	 * blocks the task, it just leaves "unassigned" as the honest offer.
	 */
	interface Props {
		projects: TaskProject[];
		initialProjectId: string | null;
		onClose: () => void;
		onCreated: (task: TaskItem) => void;
	}

	let { projects, initialProjectId, onClose, onCreated }: Props = $props();

	let open = $state(true);
	// The dialog mounts per open, so the initial props ARE the honest seed.
	// svelte-ignore state_referenced_locally
	let projectId = $state(
		initialProjectId && projects.some((p) => p.id === initialProjectId)
			? initialProjectId
			: (projects[0]?.id ?? '')
	);
	let title = $state('');
	let priority = $state<TaskPriority>('none');
	let due = $state('');
	let assignee = $state('unassigned');

	let members = $state<TaskMember[]>([]);
	let membersLoading = $state(false);
	let membersError = $state<string | null>(null);
	let membersGen = 0;

	let busy = $state(false);
	let error = $state<string | null>(null);
	let titleInput = $state<HTMLElement | null>(null);

	// The composer mounts per open; the ref binding is the focus trigger.
	$effect(() => {
		titleInput?.focus();
	});

	const assigneeItems = $derived.by(() => {
		const labels = memberLabels(members);
		return [
			{ value: 'unassigned', label: 'unassigned' },
			...members.map((member) => ({
				value: member.userId, // the FK; the display name is only a label
				label: labels.get(member.userId) ?? member.name
			}))
		];
	});

	async function loadMembers(pid: string) {
		const gen = ++membersGen;
		membersLoading = true;
		membersError = null;
		try {
			const rows = await client.taskMembers(pid);
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

	// Roster follows the project. The generation guard keeps a fast switch
	// from painting the previous project's people.
	$effect(() => {
		const pid = projectId;
		if (!pid) {
			members = [];
			membersLoading = false;
			membersError = null;
			return;
		}
		void loadMembers(pid);
	});

	function chooseProject(id: string) {
		projectId = id;
		assignee = 'unassigned';
	}

	async function submit() {
		const nextTitle = title.trim();
		if (!nextTitle || !projectId || busy) return;
		busy = true;
		error = null;
		try {
			const task = await client.taskCreate({
				projectId,
				title: nextTitle,
				priority,
				dueAt: due ? dueAtFromDate(due) : null,
				assignedTo: assignee === 'unassigned' ? null : assignee
			});
			onCreated(task);
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) onClose();
	}}
>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="text-xl font-semibold tracking-tight">New task</Dialog.Title>
			<Dialog.Description class="font-mono text-[11px] text-muted-foreground">
				the title is the only field the server insists on
			</Dialog.Description>
		</Dialog.Header>

		<form
			class="flex flex-col gap-3"
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<label class="flex flex-col gap-1">
				<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
					title
				</span>
				<Input
					bind:value={title}
					bind:ref={titleInput}
					aria-label="Task title"
					placeholder="what needs doing?"
					autocomplete="off"
					class="font-sans text-sm"
				/>
			</label>

			<div class="grid gap-3 sm:grid-cols-2">
				<label class="flex flex-col gap-1">
					<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
						project
					</span>
					<Select.Root
						type="single"
						items={projects.map((p) => ({
							value: p.id,
							label: p.completedAt ? `${p.name} · completed` : p.name
						}))}
						value={projectId}
						onValueChange={chooseProject}
					>
						<Select.Trigger aria-label="Project" class="w-full justify-between">
							<Select.Value />
						</Select.Trigger>
						<Select.Content>
							{#each projects as project (project.id)}
								<Select.Item
									value={project.id}
									label={project.completedAt ? `${project.name} · completed` : project.name}
								/>
							{/each}
						</Select.Content>
					</Select.Root>
				</label>

				<label class="flex flex-col gap-1">
					<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
						priority
					</span>
					<Select.Root
						type="single"
						items={PRIORITIES}
						value={priority}
						onValueChange={(next) => (priority = next as TaskPriority)}
					>
						<Select.Trigger aria-label="Priority" class="w-full justify-between">
							<Select.Value />
						</Select.Trigger>
						<Select.Content>
							{#each PRIORITIES as option (option.value)}
								<Select.Item value={option.value} label={option.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</label>

				<div class="flex flex-col gap-1">
					<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
						due
					</span>
					<TaskDuePicker value={due} onchange={(next) => (due = next)} />
				</div>

				<div class="flex flex-col gap-1">
					<span class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
						assignee
					</span>
					<Select.Root
						type="single"
						items={assigneeItems}
						value={assignee}
						disabled={membersLoading}
						onValueChange={(next) => (assignee = next)}
					>
						<Select.Trigger aria-label="Assignee" class="w-full justify-between">
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
								onclick={() => void loadMembers(projectId)}
							>
								retry
							</button>
						</p>
					{/if}
				</div>
			</div>

			{#if error}
				<p class="text-xs leading-relaxed break-words text-danger" role="alert">{error}</p>
			{/if}

			<Dialog.Footer>
				<Button type="button" variant="quiet" onclick={onClose}>Cancel</Button>
				<Button
					type="submit"
					variant="primary"
					class="px-4 py-1.5 disabled:opacity-40"
					disabled={!title.trim() || !projectId || busy}
				>
					{busy ? 'Creating…' : 'Create task'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
