<!-- Fixture: the REAL CodeMirror editor with a doc covering the cue
	families (the quote's block border, the fence's fill, the marks). The
	button drives the LIVE-FOLLOW test: it prepends a new quote block
	through the value binding — the component's real external-update path. -->
<script lang="ts">
	import CodeMirrorEditor from './components/CodeMirrorEditor.svelte';

	let value_ = $state(`# Title

> a quoted line
> a second quoted line

\`\`\`go
func main() {}
\`\`\`

- an item

This has **bold text**, *italic text*, ~~struck text~~, \`inline code\`, and a [link](https://example.com).

| col a | col b |
| --- | :---: |
| one | two |
`);
</script>

<button aria-label="prepend quote block" onclick={() => (value_ = `> inserted quote\n\n` + value_)}>
	prepend
</button>

<CodeMirrorEditor bind:value={value_} onchange={() => {}} vim={false} wrap={true} />
