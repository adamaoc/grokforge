import { describe, expect, it } from 'vitest'
import {
  AGENT_EDIT_EMPTY_WRITE_REASON,
  AGENT_EDIT_CORRUPT_ENCODING_REASON,
  AGENT_EDIT_CORRUPT_JS_ORPHAN_PAREN_REASON,
  AGENT_EDIT_HTML_ENTITY_ARTIFACT_REASON,
  AGENT_EDIT_JAMMED_JS_FILE_REASON,
  AGENT_EDIT_MALFORMED_JSX_REASON,
  AGENT_EDIT_INCOMPLETE_TS_REASON,
  AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON,
  detectIncompleteTypeScriptSource,
  detectMalformedJsxAttributes,
  assessProposalWriteContent,
  detectCorruptEncoding,
  detectCorruptSourceLines,
  detectHtmlEncodingArtifacts,
  detectIncompleteHtmlDocument,
  detectJammedJavaScriptFile,
  recordCrushedJavaScriptProposalFailure,
  recordCreationIntegrityProposalFailure,
  recordIncompleteHtmlProposalFailure,
  shouldInjectCreationIncrementalRecoveryNudge,
  shouldInjectCrushedJavaScriptProposalNudge,
  shouldInjectIncompleteHtmlProposalNudge,
} from '../harness-support/diff/edit-corrupt-content'
import {
  hasGluedJavaScriptStatements,
  normalizeAgentWriteFileContent,
} from '../harness-support/context/file-content-normalize'

const CORRUPT_SAMPLE = `<!DOCTYPE html>
<html>
<body>
)
)
)
)
);
)
)
</body>
</html>`

const CLEAN_TODO_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Todo</title></head>
<body>
  <ul id="todo-list"></ul>
  <script>
    const list = document.getElementById('todo-list');
    list.appendChild(document.createElement('li'));
  </script>
</body>
</html>`

describe('detectCorruptSourceLines', () => {
  it('flags many orphan close-paren lines', () => {
    const r = detectCorruptSourceLines(CORRUPT_SAMPLE)
    expect(r.corrupt).toBe(true)
    expect(r.reason).toMatch(/orphan closing parentheses/i)
  })

  it('allows clean todo HTML', () => {
    expect(detectCorruptSourceLines(CLEAN_TODO_HTML).corrupt).toBe(false)
  })

  it('flags truncated HTML opener without html tag', () => {
    expect(
      detectIncompleteHtmlDocument('<!DOCTYPE html> html lang="en"').incomplete,
    ).toBe(true)
    expect(
      assessProposalWriteContent('<!DOCTYPE html> html lang="en"').ok,
    ).toBe(false)
  })

  it('rejects empty write_file content', () => {
    expect(assessProposalWriteContent('   ').ok).toBe(false)
    expect(assessProposalWriteContent('   ').reason).toBe(AGENT_EDIT_EMPTY_WRITE_REASON)
  })

  it('tracks incomplete HTML failures for harness nudge threshold', () => {
    const map = new Map<string, number>()
    expect(shouldInjectIncompleteHtmlProposalNudge(map)).toBe(false)
    recordIncompleteHtmlProposalFailure(map, '/proj/index.html')
    expect(shouldInjectIncompleteHtmlProposalNudge(map)).toBe(true)
  })

  it('tracks crushed JavaScript failures for second-attempt harness nudge', () => {
    const map = new Map<string, number>()
    expect(shouldInjectCrushedJavaScriptProposalNudge(map)).toBe(false)
    recordCrushedJavaScriptProposalFailure(map, '/proj/script.js')
    expect(shouldInjectCrushedJavaScriptProposalNudge(map)).toBe(false)
    recordCrushedJavaScriptProposalFailure(map, '/proj/script.js')
    expect(shouldInjectCrushedJavaScriptProposalNudge(map)).toBe(true)
  })

  it('recordCreationIntegrityProposalFailure counts only integrity rejections on absent paths', () => {
    const map = new Map<string, number>()
    recordCreationIntegrityProposalFailure(map, '/proj/new.js', AGENT_EDIT_EMPTY_WRITE_REASON, false)
    expect(map.get('/proj/new.js')).toBe(1)
    recordCreationIntegrityProposalFailure(map, '/proj/new.js', 'Path outside workspace roots', false)
    expect(map.get('/proj/new.js')).toBe(1)
    recordCreationIntegrityProposalFailure(map, '/proj/existing.js', AGENT_EDIT_EMPTY_WRITE_REASON, true)
    expect(map.has('/proj/existing.js')).toBe(false)
    recordCreationIntegrityProposalFailure(map, '/proj/new.js', AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON, false)
    expect(shouldInjectCreationIncrementalRecoveryNudge(map)).toBe(true)
  })

  it('counts raw crushed pre-validation as creation integrity rejection', () => {
    const map = new Map<string, number>()
    recordCreationIntegrityProposalFailure(map, '/proj/new.js', AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON, false)
    expect(map.get('/proj/new.js')).toBe(1)
    recordCreationIntegrityProposalFailure(map, '/proj/new.js', AGENT_EDIT_JAMMED_JS_FILE_REASON, false)
    expect(shouldInjectCreationIncrementalRecoveryNudge(map)).toBe(true)
  })

  it('rejects HTML with jammed inline script even when tags close', () => {
    const jammed = `<!DOCTYPE html><html><head><title>T</title></head><body>
<script>
const todos=[];function save(){}function init(){}updateCount();})// xfunction setup(){}
</script>
</body></html>`
    const result = assessProposalWriteContent(jammed)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/crushed|jammed|script/i)
  })

  it('rejects HTML with complete tags but truncated inline script', () => {
    const truncatedScript = `<!DOCTYPE html>
<html><head><title>Todo</title></head>
<body>
<script>
(function () {
  const form = document.getElementById('todo-form');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
</script>
</body></html>`
    const result = assessProposalWriteContent(truncatedScript)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/script/i)
  })

  it('allows a few isolated closing parens in real JS', () => {
    const js = `function a() {
  return (
    1
  );
}
function b() {
  return (
    2
  );
}
`
    expect(detectCorruptSourceLines(js).corrupt).toBe(false)
  })

  it('flags orphan parens on script.js with actionable reason', () => {
    const corruptJs = `function init() {
)
)
)
);
)
)
`
    const r = detectCorruptSourceLines(corruptJs, { resolvedPath: '/proj/script.js' })
    expect(r.corrupt).toBe(true)
    expect(r.reason).toBe(AGENT_EDIT_CORRUPT_JS_ORPHAN_PAREN_REASON)
  })

  it('rejects glued imports in App.tsx-style source before normalize', () => {
    const crushed =
      "import { useState } from 'react'import './App.css'export default function App() { return null }"
    expect(detectJammedJavaScriptFile(crushed, '/proj/src/App.tsx').jammed).toBe(true)
  })

  it('accepts App.tsx-style source after normalize repairs glued imports', () => {
    const crushed =
      "import { useState } from 'react'import './App.css'export default function App() { return null }"
    const normalized = normalizeAgentWriteFileContent(crushed, '/proj/src/App.tsx')
    expect(hasGluedJavaScriptStatements(normalized)).toBe(false)
    expect(assessProposalWriteContent(normalized, { resolvedPath: '/proj/src/App.tsx' }).ok).toBe(
      true,
    )
  })

  it('rejects incomplete const type declaration in TSX', () => {
    const truncated = `import { useState } from 'react'

const COLUMNS: {
`
    expect(detectIncompleteTypeScriptSource(truncated, '/proj/src/App.tsx').incomplete).toBe(true)
    expect(assessProposalWriteContent(truncated, { resolvedPath: '/proj/src/App.tsx' }).ok).toBe(
      false,
    )
    expect(assessProposalWriteContent(truncated, { resolvedPath: '/proj/src/App.tsx' }).reason).toBe(
      AGENT_EDIT_INCOMPLETE_TS_REASON,
    )
  })

  it('rejects glued return on same line as const in TSX', () => {
    const glued = `function loadTasks() {
  const saved = localStorage.getItem('tasks')  return saved ? JSON.parse(saved) : []
}`
    expect(hasGluedJavaScriptStatements(glued)).toBe(true)
    expect(detectJammedJavaScriptFile(glued, '/proj/src/App.tsx').jammed).toBe(true)
    expect(assessProposalWriteContent(glued, { resolvedPath: '/proj/src/App.tsx' }).ok).toBe(false)
  })

  it('rejects malformed escaped className in TSX', () => {
    const bad = '<div className=\\"card\\">Hi</div>'
    expect(detectMalformedJsxAttributes(bad, '/proj/App.tsx').malformed).toBe(true)
    expect(detectMalformedJsxAttributes(bad, '/proj/App.tsx').reason).toBe(
      AGENT_EDIT_MALFORMED_JSX_REASON,
    )
    expect(assessProposalWriteContent(bad, { resolvedPath: '/proj/App.tsx' }).ok).toBe(false)
  })

  it('rejects multi-line script with glued statements per line', () => {
    const crushed = `let todos = [] function loadTodos() {
const list = document.getElementById('todo-list') list.innerHTML = ''
}`
    expect(assessProposalWriteContent(crushed, { resolvedPath: '/proj/script.js' }).ok).toBe(false)
  })

  it('rejects jammed standalone script.js', () => {
    const jammed =
      "const todos=[];function save(){localStorage.setItem('t',JSON.stringify(todos));}function init(){render();}updateCount();})// xfunction setup(){form.addEventListener('submit',onSubmit);}"
    const r = detectJammedJavaScriptFile(jammed, '/proj/script.js')
    expect(r.jammed).toBe(true)
    expect(r.reason).toBe(AGENT_EDIT_JAMMED_JS_FILE_REASON)
    expect(assessProposalWriteContent(jammed, { resolvedPath: '/proj/script.js' }).ok).toBe(false)
  })

  it('rejects replacement characters and control bytes', () => {
    expect(detectCorruptEncoding('hello \uFFFD world').corrupt).toBe(true)
    expect(assessProposalWriteContent('hello \uFFFD world').reason).toBe(
      AGENT_EDIT_CORRUPT_ENCODING_REASON,
    )
    expect(detectCorruptEncoding('a\u0001b').corrupt).toBe(true)
  })

  it('rejects HTML with entity artifacts after normalize cannot decode them', () => {
    const broken = '<html lang=&#34;en&#34;><body>\uFFFD</body></html>'
    expect(detectHtmlEncodingArtifacts(broken, '/proj/index.html').artifact).toBe(true)
    expect(assessProposalWriteContent(broken, { resolvedPath: '/proj/index.html' }).ok).toBe(false)
  })

  it('accepts HTML once entity encoding is normalized to UTF-8 quotes', () => {
    const raw =
      '<!DOCTYPE html><html lang=&#34;en&#34;><head><meta charset=&#34;UTF-8&#34;><title>Todo</title></head><body><h1>Hi</h1></body></html>'
    const normalized = normalizeAgentWriteFileContent(raw, '/proj/index.html')
    expect(assessProposalWriteContent(normalized, { resolvedPath: '/proj/index.html' }).ok).toBe(true)
    expect(normalized).toContain('lang="en"')
    expect(detectHtmlEncodingArtifacts(normalized, '/proj/index.html').artifact).toBe(false)
  })

  it('flags leftover html entity artifacts with actionable reason', () => {
    const artifact = '<html lang=&quot;en&quot;><body>Ok</body></html>'
    const r = detectHtmlEncodingArtifacts(artifact, '/proj/index.html')
    expect(r.artifact).toBe(true)
    expect(r.reason).toBe(AGENT_EDIT_HTML_ENTITY_ARTIFACT_REASON)
  })

  it('validation:package_json — rejects invalid new package.json before corrupt JS heuristics', () => {
    const bad = '{name: todo}'
    const r = assessProposalWriteContent(bad, {
      resolvedPath: '/proj/package.json',
      isNewFile: true,
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/npm create|npm init|valid JSON/i)
  })

  it('validation:package_json — accepts minified valid package.json on new file', () => {
    const minified = '{"name":"app","private":true}'
    const normalized = normalizeAgentWriteFileContent(minified, '/proj/package.json')
    const r = assessProposalWriteContent(normalized, {
      resolvedPath: '/proj/package.json',
      isNewFile: true,
    })
    expect(r.ok).toBe(true)
    expect(normalized).toContain('"name": "app"')
  })
})
