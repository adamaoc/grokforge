import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GrokProjectManifest } from './manifest'
import { validateAgentEditProposal } from './agent-edit-proposals'
import { AGENT_TOOL_PROTOCOL_VERSION } from '../shared/agent-tool-contract'

function manifestForRoot(root: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Test Project',
    roots: [{ id: 'root', path: root, type: 'code', label: 'Root' }],
    ignore: ['**/ignored/**'],
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
})
