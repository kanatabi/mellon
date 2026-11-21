<!-- Fixture: the REAL users page with stubbed load data. Exists because the
	round's 500 was a RENDER-time crash (a Dialog.Trigger outside its Root's
	context) that no load could catch — the data endpoint answered 200 while
	the page died. -->
<script lang="ts">
	import UsersPage from './+page.svelte';

	const data = {
		users: [
			{
				username: 'adminv2',
				role: 'admin' as const,
				mustChange: false,
				createdAt: '2026-11-16'
			}
		]
	} as never;
	const form = undefined as never;
</script>

<UsersPage {data} {form} />
