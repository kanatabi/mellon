<!-- Fixture: the REAL vault page with stubbed load data — the restore
	replacement contract (the restore-v2 round). -->
<script lang="ts">
	import VaultPage from './+page.svelte';

	const data = {
		paths: [{ app: 'mellon', env: 'production' }],
		app: 'mellon',
		env: 'production',
		secret: {
			data: { ADMIN_URL: 'http://lumen-admin.lumen.svc.cluster.local', 'Hello World': 'Test' },
			createdTime: '2026-11-21T09:00:00Z',
			version: 5,
			destroyed: false,
			deletionTime: null
		},
		meta: {
			currentVersion: 5,
			versions: [
				{ version: 5, createdTime: '2026-11-21T09:00:00Z', destroyed: false },
				{ version: 2, createdTime: '2026-11-14T10:00:00Z', destroyed: false }
			],
			pinnedVersion: null
		}
	} as never;
</script>

<VaultPage {data} />
