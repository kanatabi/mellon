<!-- Test fixture: the REAL (app) layout with stubbed page data, so the
	toggle wiring (Provider bind:open ⇄ navRail.setOpen) is tested end to
	end — the two-click bug lived exactly in that loop. Not a +file, so
	this is not a route. -->
<script lang="ts">
	import AppLayout from './+layout.svelte';
	import { createRawSnippet } from 'svelte';

	const children = createRawSnippet(() => ({ render: () => '<div data-testid="page">x</div>' }));

	const data = {
		theme: { theme: 'portal', mode: 'light' } as const,
		principal: {
			username: 'probe',
			id: 'u-probe',
			scopes: ['content:manage', 'secrets:admin', 'users:manage', 'settings:manage'],
			mustChange: false,
			disabled: false
		},
		recent: [],
		vim: false,
		autosaveSeconds: 60
	};
	const params = {};
</script>

<AppLayout {data} {params} {children} />
