<!-- Fixture: the regex-cue layer's doc — the deflist's two accepted forms,
	the non-cues, the alternation proof, and the code-exclusion zone. -->
<script lang="ts">
	import CodeMirrorEditor from './components/CodeMirrorEditor.svelte';

	const value = `a term line
: spaced definition
:glued definition
: third consecutive def

:
: 

\`\`\`go
==comparison==  // not a highlight
: not a deflist
\`\`\`

==real highlight==
`;
</script>

<CodeMirrorEditor {value} onchange={() => {}} vim={false} wrap={false} />
