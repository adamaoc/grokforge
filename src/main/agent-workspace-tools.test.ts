import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeAgentContentHash } from './agent-content-hash'
import type { GrokProjectManifest } from './manifest'
import {
  AGENT_TOOL_DEFINITIONS,
  AGENT_SEARCH_MAX_RESULTS,
  isLikelySensitivePath,
  runAgentWorkspaceTool,
  parseReadFileToolContentHash,
  runReadFileTool,
} from './agent-workspace-tools'

function manifestForRoot(root: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Test Project',
    roots: [{ id: 'root', path: root, type: 'code', label: 'Root' }],
    ignore: ['**/node_modules', '**/.git', '**/ignored'],
    models: {
      default: 'grok-code-fast-1',
      planning: 'grok-4.3',
      execution: 'grok-code-fast-1',
      reasoning: 'grok-4.20-reasoning',
      voice: 'grok-voice-think-fast-1.0',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
}

function env(root: string) {
  return {
    projectId: 'test-project',
    manifest: manifestForRoot(root),
    activeContext: { activeRootId: 'root', openTabs: [], chatMode: 'fast' as const },
    signal: new AbortController().signal,
  }
}

describe('agent workspace read/search tools', () => {
  it('does not expose human PTY terminal sessions as agent tools', () => {
    const names = AGENT_TOOL_DEFINITIONS.map((tool) => tool.function.name)

    expect(names).toContain('run_command')
    expect(names).not.toContain('terminal_session_input')
    expect(names).not.toContain('terminal-session-input')
    expect(names).not.toContain('terminal_session_start')
  })

  it('rejects malformed tool input', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-tools-'))
    const res = runAgentWorkspaceTool('read_file', { path: '' }, env(root))
    expect(res.ok).toBe(false)
    expect(res.content).toContain('String must contain')
  })

  it('rejects paths outside workspace roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-tools-'))
    const outside = join(tmpdir(), 'outside.txt')
    writeFileSync(outside, 'nope')
    const res = runReadFileTool(env(root), { path: outside })
    expect(res.ok).toBe(false)
    expect(res.content).toContain('outside workspace roots')
  })

  it('does not read ignored or sensitive files automatically', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-tools-'))
    mkdirSync(join(root, 'ignored'))
    writeFileSync(join(root, 'ignored', 'a.ts'), 'hidden')
    writeFileSync(join(root, '.env'), 'XAI_API_KEY=secret')

    const ignored = runReadFileTool(env(root), { path: join(root, 'ignored', 'a.ts') })
    const secret = runReadFileTool(env(root), { path: join(root, '.env') })

    expect(ignored.ok).toBe(false)
    expect(ignored.content).toContain('ignore')
    expect(secret.ok).toBe(false)
    expect(secret.content).toContain('sensitive')
    expect(isLikelySensitivePath(join(root, 'private-key.pem'))).toBe(true)
  })

  it('returns line-numbered, truncated file reads', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-tools-'))
    const file = join(root, 'src.ts')
    writeFileSync(file, ['one', 'two', 'three', 'four'].join('\n'))

    const res = runReadFileTool(env(root), { path: file, startLine: 2, maxLines: 2 })

    expect(res.ok).toBe(true)
    expect(res.content).toContain('2 | two')
    expect(res.content).toContain('3 | three')
    expect(res.content).toContain('"rawContent": "two\\nthree"')
    expect(res.content).toContain('"truncated": true')
    const hash = parseReadFileToolContentHash(res.content)
    expect(hash).toBe(computeAgentContentHash(['one', 'two', 'three', 'four'].join('\n')))
    expect(res.content).toContain('"contentHashScope": "full_file"')
  })

  it('searches workspace text with ignore and result caps', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-tools-'))
    mkdirSync(join(root, 'src'))
    mkdirSync(join(root, 'node_modules'))
    for (let i = 0; i < AGENT_SEARCH_MAX_RESULTS + 5; i += 1) {
      writeFileSync(join(root, 'src', `${i}.ts`), `needle ${i}`)
    }
    writeFileSync(join(root, 'node_modules', 'hidden.ts'), 'needle hidden')

    const res = runAgentWorkspaceTool('search_workspace', { query: 'needle' }, env(root))

    expect(res.ok).toBe(true)
    const parsed = JSON.parse(res.content) as { results: Array<{ path: string }>; truncated: boolean }
    expect(parsed.results).toHaveLength(AGENT_SEARCH_MAX_RESULTS)
    expect(parsed.truncated).toBe(true)
    expect(parsed.results.some((r) => r.path.includes('node_modules'))).toBe(false)
  })
})
