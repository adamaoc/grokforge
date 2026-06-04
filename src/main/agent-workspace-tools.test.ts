import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const userDataRoot = mkdtempSync(join(tmpdir(), 'grokforge-ws-offload-'))

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataRoot,
  },
}))

vi.mock('./app-project-store', async () => {
  const actual = await vi.importActual<typeof import('./app-project-store')>('./app-project-store')
  return {
    ...actual,
    projectDir: (projectId: string) => join(userDataRoot, 'workspace-projects', projectId),
  }
})
import { computeAgentContentHash } from './agent-content-hash'
import type { GrokProjectManifest } from './manifest'
import { getAgentProfile } from '../harness/profiles/agent-profile'
import type { AgentToolExecutionContext } from '../harness/tools/contracts/execution-context'
import {
  AGENT_TOOL_DEFINITIONS,
  AGENT_SEARCH_MAX_RESULTS,
  buildAgentToolDefinitions,
  buildToolDefinitionsForTurn,
  filterToolDefinitionsForProfile,
  isLikelySensitivePath,
  executeWorkspaceTool,
  parseReadFileToolContentHash,
  runReadFileTool,
} from '../harness/tools/workspace-tools'
import { writeAgentOffloadFile } from '../harness/compaction/offload-store'
import { planJsonPath, upsertPlanArtifactFromAssistantMessage } from '../harness/plan/store/plan-store'
import { GF_PLAN_FENCE } from '../harness/plan/contracts/gf-plan-contract'

function manifestForRoot(root: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Test Project',
    roots: [{ id: 'root', path: root, type: 'code', label: 'Root' }],
    ignore: ['**/node_modules', '**/.git', '**/ignored'],
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

function testToolContext(root: string, overrides?: Partial<AgentToolExecutionContext>): AgentToolExecutionContext {
  const manifest = manifestForRoot(root)
  return {
    projectId: 'test-project',
    streamId: 'stream-test',
    snapshotId: '00000000-0000-4000-8000-000000000001',
    toolCallId: 'tc-test',
    activityId: 'act-test',
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
    const ctx = testToolContext(root)
    const res = executeWorkspaceTool(ctx, 'read_file', { path: '' })
    expect(res.ok).toBe(false)
    expect(res.content).toContain('String must contain')
  })

  it('rejects paths outside workspace roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-tools-'))
    const outside = join(tmpdir(), 'outside.txt')
    writeFileSync(outside, 'nope')
    const res = runReadFileTool(testToolContext(root), { path: outside })
    expect(res.ok).toBe(false)
    expect(res.content).toContain('outside workspace roots')
  })

  it('returns cancelled when abortSignal is set before search', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-search-abort-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'needle.ts'), 'export const needle = 1\n', 'utf8')
    const ac = new AbortController()
    ac.abort()
    const res = executeWorkspaceTool(testToolContext(root, { abortSignal: ac.signal }), 'search_workspace', {
      query: 'needle',
    })
    expect(res.ok).toBe(false)
    expect(res.displayTitle).toMatch(/cancelled/i)
  })

  it('calls recordPathRead on successful read_file', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-read-registry-'))
    const filePath = join(root, 'src', 'app.ts')
    mkdirSync(join(root, 'src'), { recursive: true })
    const content = 'export const app = 1\n'
    writeFileSync(filePath, content, 'utf8')
    const recordPathRead = vi.fn()
    const res = runReadFileTool(testToolContext(root, { recordPathRead }), { path: filePath })
    expect(res.ok).toBe(true)
    expect(recordPathRead).toHaveBeenCalledTimes(1)
    expect(recordPathRead).toHaveBeenCalledWith(filePath, computeAgentContentHash(content))
  })

  it('rejects sensitive paths', () => {
    expect(isLikelySensitivePath('/proj/.env')).toBe(true)
    expect(isLikelySensitivePath('/proj/src/app.ts')).toBe(false)
  })

  it('filters tool definitions for planner profile', () => {
    const planner = getAgentProfile('planner')
    const defs = filterToolDefinitionsForProfile(buildAgentToolDefinitions({}), planner)
    const names = defs.map((d) => d.function.name)
    expect(names).toContain('read_file')
    expect(names).not.toContain('propose_file_edits')
    expect(names).not.toContain('run_command')
  })

  it('buildToolDefinitionsForTurn merges overrides and profile allowlist', () => {
    const defs = buildToolDefinitionsForTurn({
      agentProfileId: 'planner',
      toolDescriptionOverrides: { search_workspace: 'custom search hint' },
    })
    const search = defs.find((d) => d.function.name === 'search_workspace')
    expect(search?.function.description).toBe('custom search hint')
    expect(defs.some((d) => d.function.name === 'propose_file_edits')).toBe(false)
  })

  it('search_workspace caps results', () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-agent-search-cap-'))
    for (let i = 0; i < AGENT_SEARCH_MAX_RESULTS + 5; i += 1) {
      writeFileSync(join(root, `f${i}.txt`), `needle ${i}\n`, 'utf8')
    }
    const res = executeWorkspaceTool(testToolContext(root), 'search_workspace', { query: 'needle' })
    expect(res.ok).toBe(true)
    const parsed = JSON.parse(res.content) as { results: unknown[]; truncated: boolean }
    expect(parsed.results.length).toBeLessThanOrEqual(AGENT_SEARCH_MAX_RESULTS)
    expect(parsed.truncated).toBe(true)
  })

  it('parses contentHash from read_file tool JSON', () => {
    const hash = 'a'.repeat(64)
    const content = JSON.stringify({ contentHash: hash, content: 'x' })
    expect(parseReadFileToolContentHash(content)).toBe(hash)
  })

  it('read_file can recover offloaded tool blob via absolute offload path', () => {
    const projectId = 'test-project'
    const payload = 'needle-in-offload-blob\n'.repeat(800)
    const { absPath } = writeAgentOffloadFile({
      projectId,
      streamId: 'stream-needle',
      toolCallId: 'call-needle',
      content: payload,
    })
    const res = runReadFileTool(testToolContext(mkdtempSync(join(tmpdir(), 'gf-offload-read-'))), {
      path: absPath,
    })
    expect(res.ok).toBe(true)
    const parsed = JSON.parse(res.content) as { rawContent: string }
    expect(parsed.rawContent).toContain('needle-in-offload-blob')
  })

  it('read_file can load stored plan artifact JSON via absolute plan path', () => {
    const projectId = 'test-project'
    const fence = `\`\`\`${GF_PLAN_FENCE}
{"schemaVersion":1,"summary":"Needle plan summary","filesLikelyTouched":[],"risksUnknowns":[],"steps":[{"id":"s1","title":"Do thing"}],"verification":"npm test"}
\`\`\``
    const { planId } = upsertPlanArtifactFromAssistantMessage(projectId, 'msg-plan-read', fence)!
    const absPath = planJsonPath(projectId, planId)
    const res = runReadFileTool(testToolContext(mkdtempSync(join(tmpdir(), 'gf-plan-read-'))), {
      path: absPath,
    })
    expect(res.ok).toBe(true)
    expect(res.content).toContain('Needle plan summary')
    expect(res.content).toContain(planId)
  })
})

afterEach(() => {
  try {
    rmSync(join(userDataRoot, 'workspace-projects', 'test-project'), { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})
