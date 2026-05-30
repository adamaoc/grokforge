import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { GrokProjectManifest } from './manifest'
import { buildEditProposalValidationSummary, validateAgentEditProposal } from './agent-edit-proposals'
import type { AgentToolExecutionContext } from '../shared/agent-tool-execution-context'
import { AGENT_TOOL_PROTOCOL_VERSION } from '../shared/agent-tool-contract'
import {
  AGENT_EDIT_READ_BEFORE_WRITE_REASON,
  agentEditPathKey,
} from '../shared/agent-edit-read-guard'
import {
  AGENT_EDIT_CREATE_HASH_STRIPPED_NOTE,
  AGENT_EDIT_MALFORMED_CONTENT_HASH_REASON,
  AGENT_EDIT_MISSING_CONTENT_HASH_REASON,
  AGENT_EDIT_STALE_HASH_REASON,
  AGENT_NEW_FILE_EXPECTED_CONTENT_HASH_SENTINEL,
} from '../shared/agent-content-hash'
import { computeAgentContentHash } from './agent-content-hash'
import {
  AGENT_EDIT_CASCADE_GUARD_REASON,
  recordSearchReplaceFailure,
} from '../shared/agent-edit-cascade-guard'
import {
  AGENT_EDIT_CORRUPT_CONTENT_REASON,
  AGENT_EDIT_INCOMPLETE_HTML_REASON,
  AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON,
  assessProposalWriteContent,
  detectObviousCrushedRawContent,
} from '../shared/agent-edit-corrupt-content'
import { normalizeAgentWriteFileContent } from '../shared/agent-file-content-normalize'
import { taskBoardCrushedOneLineIndexHtml } from './agent-eval-fixtures'
import {
  AGENT_EDIT_MINIMAL_SCAFFOLD_REQUIRED_REASON,
  AGENT_EDIT_SINGLE_FILE_HTML_SHELL_FIRST_REASON,
  recordCreationRecoveryEnforced,
} from '../shared/agent-creation-recovery-enforcement'

function manifestForRoot(root: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Test Project',
    roots: [{ id: 'root', path: root, type: 'code', label: 'Root' }],
    ignore: ['**/ignored/**'],
    models: {
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20-0309-reasoning',
      voice: 'grok-voice-latest',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
}

function env(root: string, overrides?: Partial<AgentToolExecutionContext>): AgentToolExecutionContext {
  const manifest = manifestForRoot(root)
  return {
    projectId: 'test-project',
    streamId: 'stream-test',
    snapshotId: '00000000-0000-4000-8000-000000000002',
    toolCallId: 'tc-proposal',
    activityId: 'act-proposal',
    agentProfileId: 'default',
    harnessProfileKey: 'grok_code_fast',
    sessionDepth: 'parent',
    abortSignal: new AbortController().signal,
    manifest,
    roots: manifest.roots,
    activeContext: { activeRootId: 'root', openTabs: [], chatMode: 'fast' },
    readPathsThisTurn: new Set(),
    readHashesThisTurn: new Map(),
    emitProgress: vi.fn(),
    recordPathRead: vi.fn(),
    askCommandApproval: vi.fn(async () => false),
    ...overrides,
  }
}

describe('validateAgentEditProposal', () => {
  it('normalizes relative write and delete paths into a first-class proposal', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          { op: 'write_file', path: 'src/app.ts', content: 'export const x = 1\n' },
          { op: 'delete_file', path: 'src/old.ts' },
        ],
      },
      env(root),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.proposal.batch.operations).toEqual([
      { op: 'write_file', path: join(root, 'src/app.ts'), content: 'export const x = 1\n' },
      { op: 'delete_file', path: join(root, 'src/old.ts') },
    ])
    expect(result.proposal.rejected).toEqual([])
  })

  it('rejects outside, ignored, and sensitive paths without dropping valid operations', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    mkdirSync(join(root, 'ignored'))

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          { op: 'write_file', path: join(root, 'src/ok.ts'), content: 'ok\n' },
          { op: 'write_file', path: join(tmpdir(), 'outside.ts'), content: 'outside\n' },
          { op: 'write_file', path: 'ignored/a.ts', content: 'ignored\n' },
          { op: 'write_file', path: '.env', content: 'XAI_API_KEY=secret\n' },
        ],
      },
      env(root),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.proposal.batch.operations).toHaveLength(1)
    expect(result.proposal.rejected.map((item) => item.reason)).toEqual([
      'Path outside workspace roots',
      'Path matches manifest ignore rules',
      'Path looks sensitive and is excluded from agent edit proposals',
    ])
  })

  it('rejects write_file on existing files without read_file in the same turn', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const existing = join(root, 'src', 'existing.ts')
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(existing, 'export const before = 1\n')

    const blocked = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: 'src/existing.ts', content: 'export const after = 2\n' }],
      },
      { ...env(root), readPathsThisTurn: new Set() },
    )

    expect(blocked.ok).toBe(false)
    if (blocked.ok) throw new Error('expected rejection')
    expect(blocked.proposal?.rejected).toEqual([
      { path: 'src/existing.ts', reason: AGENT_EDIT_READ_BEFORE_WRITE_REASON },
    ])

    const beforeContent = 'export const before = 1\n'
    const allowed = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          {
            op: 'write_file',
            path: 'src/existing.ts',
            content: 'export const after = 2\n',
            expectedContentHash: computeAgentContentHash(beforeContent),
          },
        ],
      },
      {
        ...env(root),
        readPathsThisTurn: new Set([agentEditPathKey(existing)]),
        readHashesThisTurn: new Map([[agentEditPathKey(existing), computeAgentContentHash(beforeContent)]]),
      },
    )

    expect(allowed.ok).toBe(true)
    if (!allowed.ok) throw new Error(allowed.error)
    expect(allowed.proposal.batch.operations).toHaveLength(1)
    expect(allowed.proposal.rejected).toEqual([])
  })

  it('allows write_file to new paths without a prior read_file', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const target = join(root, 'src', 'new.ts')

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: 'src/new.ts', content: 'export const x = 1\n' }],
      },
      { ...env(root), readPathsThisTurn: new Set() },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.proposal.batch.operations[0]?.path).toBe(resolve(target))
    expect(result.proposal.batch.operations[0]).not.toHaveProperty('expectedContentHash')
    expect(result.proposal.rejected).toEqual([])
    expect(result.createHashStrippedPaths).toBeUndefined()
  })

  it('accepts new-file write_file with sentinel or malformed hash and reports stripped paths (story 154)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))

    const sentinel = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          {
            op: 'write_file',
            path: 'src/sentinel.ts',
            content: 'export const x = 1\n',
            expectedContentHash: AGENT_NEW_FILE_EXPECTED_CONTENT_HASH_SENTINEL,
          },
        ],
      },
      env(root),
    )
    expect(sentinel.ok).toBe(true)
    if (!sentinel.ok) throw new Error(sentinel.error)
    expect(sentinel.proposal.batch.operations[0]).not.toHaveProperty('expectedContentHash')
    expect(sentinel.createHashStrippedPaths).toEqual(['src/sentinel.ts'])

    const malformed = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          {
            op: 'write_file',
            path: 'src/malformed.ts',
            content: 'export const y = 2\n',
            expectedContentHash: 'not-a-valid-hash',
          },
        ],
      },
      env(root),
    )
    expect(malformed.ok).toBe(true)
    if (!malformed.ok) throw new Error(malformed.error)
    expect(malformed.proposal.batch.operations[0]).not.toHaveProperty('expectedContentHash')
    expect(malformed.createHashStrippedPaths).toEqual(['src/malformed.ts'])
    expect(AGENT_EDIT_CREATE_HASH_STRIPPED_NOTE).toContain('omit expectedContentHash')
  })

  it('rejects write_file on existing files with malformed expectedContentHash (story 154)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const existing = join(root, 'src', 'bad-hash.ts')
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(existing, 'const x = 1\n')
    const hash = computeAgentContentHash('const x = 1\n')

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          {
            op: 'write_file',
            path: 'src/bad-hash.ts',
            content: 'const x = 2\n',
            expectedContentHash: 'bogus-hash',
          },
        ],
      },
      {
        ...env(root),
        readPathsThisTurn: new Set([agentEditPathKey(existing)]),
        readHashesThisTurn: new Map([[agentEditPathKey(existing), hash]]),
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.proposal?.rejected).toEqual([
      { path: 'src/bad-hash.ts', reason: AGENT_EDIT_MALFORMED_CONTENT_HASH_REASON },
    ])
  })

  it('rejects write_file on existing files without expectedContentHash when not in read registry', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const existing = join(root, 'src', 'needs-hash.ts')
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(existing, 'const x = 1\n')

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: 'src/needs-hash.ts', content: 'const x = 2\n' }],
      },
      { ...env(root), readPathsThisTurn: new Set([agentEditPathKey(existing)]) },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.proposal?.rejected).toEqual([
      { path: 'src/needs-hash.ts', reason: AGENT_EDIT_MISSING_CONTENT_HASH_REASON },
    ])
  })

  it('rejects write_file when disk content no longer matches expectedContentHash', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const existing = join(root, 'src', 'stale.ts')
    mkdirSync(join(root, 'src'), { recursive: true })
    const original = 'version one\n'
    writeFileSync(existing, original)
    const staleHash = computeAgentContentHash(original)
    writeFileSync(existing, 'version two\n')

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          {
            op: 'write_file',
            path: 'src/stale.ts',
            content: 'version three\n',
            expectedContentHash: staleHash,
          },
        ],
      },
      { ...env(root), readPathsThisTurn: new Set([agentEditPathKey(existing)]) },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.proposal?.rejected).toEqual([{ path: 'src/stale.ts', reason: AGENT_EDIT_STALE_HASH_REASON }])
  })

  it('rejects destructive full-file write after repeated search_replace failures on same path', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const existing = join(root, 'index.html')
    const original = `<!DOCTYPE html>
<html><body>
<script>
let todos = [];
function renderTodos() {
  document.getElementById('list').innerHTML = todos.map(t => '<li>' + t + '</li>').join('');
}
renderTodos();
</script>
</body></html>
`
    writeFileSync(existing, original, 'utf8')
    const hash = computeAgentContentHash(original)
    const failures = new Map<string, number>()
    recordSearchReplaceFailure(failures, existing)
    recordSearchReplaceFailure(failures, existing)

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          {
            op: 'write_file',
            path: existing,
            content: '<html><body><script>let todos = [];</script></body></html>',
            expectedContentHash: hash,
          },
        ],
      },
      {
        ...env(root),
        readPathsThisTurn: new Set([agentEditPathKey(existing)]),
        readHashesThisTurn: new Map([[agentEditPathKey(existing), hash]]),
      },
      {
        searchReplaceFailuresByPath: failures,
        userMessageHint: 'fix syntax error at line 107',
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected cascade guard rejection')
    expect(result.proposal?.rejected[0]?.reason).toContain(AGENT_EDIT_CASCADE_GUARD_REASON)
  })

  it('accepts search_replace patch that renames Tech Stack (planned) without crushed rejection', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const existing = join(root, 'docs', 'overview.md')
    mkdirSync(join(root, 'docs'), { recursive: true })
    const original = `# TaskBoard Overview  

## Key Features 

- Create, edit, and delete tasks 

## Tech Stack (planned) 

- Frontend: Likely React or similar for interactive UI 
- Backend: To be determined  

The goal is to provide a lightweight app.  
`
    const patched = original
      .replace('## Tech Stack (planned)', '## Tech Stack')
      .replace('- Frontend: Likely React or similar for interactive UI', '- Frontend: React + TypeScript')
      .replace('- Backend: To be determined', '- Backend: Node.js + TypeScript\n- Build & Serve: Vite')
    writeFileSync(existing, original, 'utf8')
    const hash = computeAgentContentHash(original)

    const fromSr = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: existing, content: patched, expectedContentHash: hash }],
      },
      {
        ...env(root),
        readPathsThisTurn: new Set([agentEditPathKey(existing)]),
        readHashesThisTurn: new Map([[agentEditPathKey(existing), hash]]),
      },
      { contentSource: 'search_replace' },
    )
    expect(fromSr.ok).toBe(true)
    if (!fromSr.ok) throw new Error('expected search_replace validation to pass')
    const op = fromSr.proposal.batch.operations[0]
    if (op.op !== 'write_file') throw new Error('expected write_file')
    expect(op.content).toContain('React + TypeScript')
    expect(op.content).toContain('The goal is to provide')
  })

  it('repairs partial markdown section proposal into full file', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const existing = join(root, 'docs', 'overview.md')
    mkdirSync(join(root, 'docs'), { recursive: true })
    const original = `# TaskBoard Overview  

## Key Features 

- one

## Tech Stack (planned) 

- Frontend: Likely React 
- Backend: To be determined  
`
    writeFileSync(existing, original, 'utf8')
    const hash = computeAgentContentHash(original)
    const partial = `## Tech Stack (planned)

- Frontend: React + TypeScript
- Backend: Node.js + TypeScript
- Served with Vite`

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          {
            op: 'write_file',
            path: existing,
            content: partial,
            expectedContentHash: hash,
          },
        ],
      },
      {
        ...env(root),
        readPathsThisTurn: new Set([agentEditPathKey(existing)]),
        readHashesThisTurn: new Map([[agentEditPathKey(existing), hash]]),
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected repair to pass validation')
    const op = result.proposal.batch.operations[0]
    if (op.op !== 'write_file') throw new Error('expected write_file')
    expect(op.content).toContain('## Key Features')
    expect(op.content).toContain('React + TypeScript')
  })

  it('repairs crushed one-line markdown stub into full file on disk', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const existing = join(root, 'docs', 'overview.md')
    mkdirSync(join(root, 'docs'), { recursive: true })
    const original = `# TaskBoard Overview

## Key Features
- one

## Tech Stack (planned)
- Frontend: Likely React
`
    writeFileSync(existing, original, 'utf8')
    const hash = computeAgentContentHash(original)
    const crushed = '# TaskBoard Overview ## Tech Stack (planned) - Frontend: React + TypeScript'

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          {
            op: 'write_file',
            path: existing,
            content: crushed,
            expectedContentHash: hash,
          },
        ],
      },
      {
        ...env(root),
        readPathsThisTurn: new Set([agentEditPathKey(existing)]),
        readHashesThisTurn: new Map([[agentEditPathKey(existing), hash]]),
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected crushed markdown repair')
    const op = result.proposal.batch.operations[0]
    if (op.op !== 'write_file') throw new Error('expected write_file')
    expect(op.content).toContain('## Key Features')
    expect(op.content).toContain('React + TypeScript')
  })

  it('rejects raw jammed standalone script.js before normalization', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const jammed =
      "const todos=[];function save(){localStorage.setItem('t',JSON.stringify(todos));}function init(){render();}updateCount();})// listenersfunction setup(){form.addEventListener('submit',onSubmit);}"
    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: join(root, 'script.js'), content: jammed }],
      },
      env(root),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected raw jammed script rejection')
    expect(result.proposal?.rejected[0]?.reason).toMatch(/crushed|minified|rawContent/i)
  })

  it('rejects corrupt script.js with actionable orphan-paren reason', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const corruptJs = `function init() {
)
)
)
);
)
)
`
    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: join(root, 'script.js'), content: corruptJs }],
      },
      env(root),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected reject')
    // Story 146: Early raw pre-validation may now fire first with a general crushed reason.
    const reason = result.proposal?.rejected[0]?.reason ?? ''
    expect(reason).toMatch(/crushed|corrupt|script|rawContent/i)
  })

  it('pre-validates raw crushed content early for propose_file_edits (story 146)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    // Extremely long single-line glued blob — reliably triggers the early raw pre-validation
    const rawCrushed = 'const todos=[];function save(){localStorage.setItem("t",JSON.stringify(todos));}function init(){render();}updateCount();})// listenersfunction setup(){form.addEventListener("submit",onSubmit);}const x=1;function a(){}function b(){return x+1}document.getElementById("root").innerHTML="hi";'.repeat(3)

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: join(root, 'app.js'), content: rawCrushed }],
      },
      env(root),
      // Explicitly not search_replace path → triggers early pre-validation
      { contentSource: 'propose' },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected early pre-validation rejection')
    const reason = result.proposal?.rejected[0]?.reason ?? ''
    expect(reason).toMatch(/crushed or minified|glued|pre-validation|rawContent/i)
  })

  it('accepts repairable one-line HTML after early normalize before pre-validation (story 160)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const htmlPath = join(root, 'index.html')
    const raw = taskBoardCrushedOneLineIndexHtml()
    expect(detectObviousCrushedRawContent(raw, htmlPath).crushed).toBe(true)
    const normalized = normalizeAgentWriteFileContent(raw, htmlPath)
    expect(
      assessProposalWriteContent(normalized, { resolvedPath: htmlPath, isNewFile: true }).ok,
    ).toBe(true)

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: htmlPath, content: raw }],
      },
      env(root),
      { contentSource: 'propose' },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    const op = result.proposal.batch.operations[0]
    expect(op?.op).toBe('write_file')
    if (op?.op === 'write_file') {
      expect(op.content.split('\n').length).toBeGreaterThan(3)
      expect(
        assessProposalWriteContent(op.content, { resolvedPath: htmlPath, isNewFile: true }).ok,
      ).toBe(true)
    }
  })

  it('rejects unrecoverable crushed HTML after early normalize (story 160)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const rawCrushedJs =
      'const todos=[];function save(){localStorage.setItem("t",JSON.stringify(todos));}function init(){render();}updateCount();})// listenersfunction setup(){form.addEventListener("submit",onSubmit);}const x=1;function a(){}function b(){return x+1}document.getElementById("root").innerHTML="hi";'.repeat(
        3,
      )
    const rawHtml = `<!DOCTYPE html><html><body><script>${rawCrushedJs}</script></body></html>`

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: join(root, 'index.html'), content: rawHtml }],
      },
      env(root),
      { contentSource: 'propose' },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected post-normalize rejection')
    const reason = result.proposal?.rejected[0]?.reason ?? ''
    expect(reason).not.toBe(AGENT_EDIT_RAW_CRUSHED_PREVALIDATION_REASON)
    expect(reason).toMatch(/incomplete|jammed|script|corrupt/i)
  })

  it('accepts valid paths and rejects corrupt script.js in same batch', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const html = `<!DOCTYPE html>
<html lang="en"><head><title>Todo</title><link rel="stylesheet" href="styles.css"></head>
<body><h1>Todo</h1><script src="script.js"></script></body></html>`
    const css = 'body { font-family: sans-serif; margin: 0; }'
    const corruptJs = `function init() {
)
)
)
);
)
)
`
    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          { op: 'write_file', path: join(root, 'index.html'), content: html },
          { op: 'write_file', path: join(root, 'styles.css'), content: css },
          { op: 'write_file', path: join(root, 'script.js'), content: corruptJs },
        ],
      },
      env(root),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.proposal.batch.operations.length).toBe(2)
    expect(result.proposal.rejected.length).toBe(1)
    expect(result.proposal.rejected[0]?.path).toContain('script.js')
  })

  it('rejects write_file with orphan close-paren corruption', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const corrupt = `<!DOCTYPE html>
<html><body>
)
)
)
)
);
)
)
</body></html>`

    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: 'index.html', content: corrupt }],
      },
      env(root),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected corrupt rejection')
    // Story 146: Early pre-validation may now catch this first with a more general "crushed" reason.
    // We only care that it was rejected for corruption-related reasons.
    const reason = result.proposal?.rejected[0]?.reason ?? ''
    expect(reason).toMatch(/corrupt|crushed|orphan/i)
  })

  it('rejects truncated HTML document proposals', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [
          {
            op: 'write_file',
            path: 'index.html',
            content: '<!DOCTYPE html> html lang="en"',
          },
        ],
      },
      env(root),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected incomplete HTML rejection')
    expect(result.proposal?.rejected[0]?.reason).toBe(AGENT_EDIT_INCOMPLETE_HTML_REASON)
  })

  it('normalizes literal backslash-n sequences in write_file content', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: 'docs/a.md', content: '# A\\n\\n## B\\nok' }],
      },
      env(root),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    const op = result.proposal.batch.operations[0]
    expect(op?.op).toBe('write_file')
    if (op?.op === 'write_file') {
      expect(op.content).toBe('# A\n\n## B\nok')
    }
  })

  it('rejects oversized bootstrap on enforced new path with minimal scaffold reason (153)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const htmlPath = join(root, 'index.html')
    const enforced = new Set<string>()
    recordCreationRecoveryEnforced(enforced, [htmlPath])
    const largeHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>TaskBoard</title></head>
<body>
${'<div class="task">item</div>\n'.repeat(50)}
</body>
</html>`
    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: htmlPath, content: largeHtml }],
      },
      env(root),
      {
        creationRecoveryEnforcedPaths: enforced,
        creationScaffoldAcceptedPaths: new Set(),
      },
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected minimal scaffold rejection')
    expect(result.proposal?.rejected[0]?.reason).toBe(AGENT_EDIT_MINIMAL_SCAFFOLD_REQUIRED_REASON)
  })

  it('allows small valid HTML scaffold on enforced new path (153)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const htmlPath = join(root, 'index.html')
    const enforced = new Set<string>()
    recordCreationRecoveryEnforced(enforced, [htmlPath])
    const scaffold = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TaskBoard</title>
</head>
<body>
<div id="app"></div>
<script src="script.js"></script>
</body>
</html>`
    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: htmlPath, content: scaffold }],
      },
      env(root),
      {
        creationRecoveryEnforcedPaths: enforced,
        creationScaffoldAcceptedPaths: new Set(),
      },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.proposal.batch.operations).toHaveLength(1)
  })

  it('rejects inline script before scaffold on enforced html with single-file intent (162)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const htmlPath = join(root, 'index.html')
    const enforced = new Set<string>()
    recordCreationRecoveryEnforced(enforced, [htmlPath])
    const withScript = `<!DOCTYPE html>
<html><head><title>T</title></head>
<body><div id="board"></div><script>const x=1</script></body></html>`
    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: htmlPath, content: withScript }],
      },
      env(root),
      {
        creationRecoveryEnforcedPaths: enforced,
        creationScaffoldAcceptedPaths: new Set(),
        singleFileHtmlIntent: true,
      },
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected shell-first rejection')
    expect(result.proposal?.rejected[0]?.reason).toBe(AGENT_EDIT_SINGLE_FILE_HTML_SHELL_FIRST_REASON)
  })

  it('rejects oversized div-only html with single-file intent using minimal scaffold reason (162)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-proposal-'))
    const htmlPath = join(root, 'index.html')
    const enforced = new Set<string>()
    recordCreationRecoveryEnforced(enforced, [htmlPath])
    const largeHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>TaskBoard</title></head>
<body>
${'<div class="task">item</div>\n'.repeat(50)}
</body>
</html>`
    const result = validateAgentEditProposal(
      {
        version: AGENT_TOOL_PROTOCOL_VERSION,
        operations: [{ op: 'write_file', path: htmlPath, content: largeHtml }],
      },
      env(root),
      {
        creationRecoveryEnforcedPaths: enforced,
        creationScaffoldAcceptedPaths: new Set(),
        singleFileHtmlIntent: true,
      },
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected minimal scaffold rejection')
    expect(result.proposal?.rejected[0]?.reason).toBe(AGENT_EDIT_MINIMAL_SCAFFOLD_REQUIRED_REASON)
  })
})

describe('buildEditProposalValidationSummary', () => {
  it('summarizes rejected paths for traces', () => {
    const summary = buildEditProposalValidationSummary(
      [{ path: '/proj/index.html', reason: 'Incomplete HTML' }],
      0,
    )
    expect(summary).toMatch(/1 rejected/)
    expect(summary).toMatch(/index\.html/)
  })
})
