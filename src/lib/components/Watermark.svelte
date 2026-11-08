<script lang="ts">
	interface Props {
		/** Opacity of the ink field; whisper-quiet on reading surfaces. */
		opacity?: number;
		/** Placement + size live at the call site — the component is a pure
		    decorative mask field; the parent owns geometry. */
		class?: string;
	}

	let { opacity = 0.06, class: cls = '' }: Props = $props();
</script>

<!-- Vendored from earendil (DESIGN §10: shared-theme extraction deferred).
     The brand's ASCII ghost: glyph mask painted with the theme's ink token. -->
<span
	class={cls}
	aria-hidden="true"
	style="opacity: {opacity}; background-color: var(--ascii-ink); -webkit-mask-image: var(--ascii-mask); mask-image: var(--ascii-mask); -webkit-mask-size: cover; mask-size: cover; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;"
></span>
