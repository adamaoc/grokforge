import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GF_PLAN_FENCE } from '../../../harness-support/plan/contracts/gf-plan-contract'
import type { GrokProjectManifest } from '../../../main/project/manifest'
import type { AgentChatStartPayload } from '../../../shared/agent/chat-contract'

const userDataRoot = mkdtempSync(join(tmpdir(), 'grokforge-harness-prompt-'))

vi.mock('electron', () => ({
  app: { getPath: () => userDataRoot },
}))

vi.mock('../../../main/project/store', async () => {
  const actual = await vi.importActual<typeof import('../../../main/project/store')>(
    '../../../main/project/store',
  )
  return {
    ...actual,
    projectDir: (projectId: string) => join(userDataRoot, 'workspace-projects', projectId),
  }
})

import { upsertPlanArtifactFromAssistantMessage } from '../../../harness-support/plan/store/plan-store'
import { buildHarnessTurnSystemPrompt } from '../build-turn-system-prompt'

const projectId = 'proj-harness-prompt'

const validPlanFence = `\`\`\`${GF_PLAN_FENCE}
{"schemaVersion":1,"summary":"Scaffold Next app","filesLikelyTouched":["package.json"],"risksUnknowns":[],"steps":[{"id":"1","title":"npm create"},{"id":"2","title":"install deps"}],"verification":"npm run build"}
\`\`\``

function testManifest(): GrokProjectManifest {
  return {
    version: 1,
    name: 'Scaffold Test',
    roots: [{ id: 'root', path: '/tmp/proj', label: 'Proj' }],
    ignore: [],
    context: {},
    models: {
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20-0309-reasoning',
      voice: 'grok-voice-latest',
    },
    voice: { defaultVoiceMode: 'off' },
  }
}

function executePayload(planId: string): AgentChatStartPayload {
  return {
    streamId: 's-exec',
    model: 'grok-build-0.1',
    userText: 'Execute the approved plan.',
    threadSnapshot: [],
    activeContext: { openTabs: [], chatMode: 'fast' },
    isApprovedPlanAutoRun: true,
    modelIntent: 'execution',
    approvedPlanId: planId,
    approvedPlanMessageId: 'msg-plan',
  }
}

afterEach(() => {
  rmSync(join(userDataRoot, 'workspace-projects', projectId), { recursive: true, force: true })
})

describe('buildHarnessTurnSystemPrompt', () => {
  it('appends approved plan injection and execute appendix on approve-and-run', () => {
    const { planId } = upsertPlanArtifactFromAssistantMessage(
      projectId,
      'msg-plan',
      validPlanFence,
    )!

    const { systemPrompt, approvedPlanArtifact } = buildHarnessTurnSystemPrompt({
      turnMode: 'work',
      manifest: testManifest(),
      snapshot: null,
      profileKey: 'grok_build',
      payload: executePayload(planId),
      projectId,
    })

    expect(approvedPlanArtifact?.planId).toBe(planId)
    expect(approvedPlanArtifact?.plan.steps).toHaveLength(2)
    expect(systemPrompt).toContain('## Approved plan artifact')
    expect(systemPrompt).toContain(planId)
    expect(systemPrompt).toContain('Scaffold Next app')
    expect(systemPrompt).toContain('## Approved plan execution')
    expect(systemPrompt).toContain('run_command')
    expect(systemPrompt).toContain('Plan steps (authoritative)')
    expect(systemPrompt).toContain(`gf-plan:${planId}`)
    expect(systemPrompt).toContain('outside workspace roots')
  })

  it('uses plan profile prompt for plan mode turns', () => {
    const { systemPrompt, approvedPlanArtifact } = buildHarnessTurnSystemPrompt({
      turnMode: 'plan',
      manifest: testManifest(),
      snapshot: {
        greenfieldWorkspace: true,
        indexUpdatedAt: null,
        fileCountScanned: null,
        frameworkHints: [],
        packageNames: [],
        existingDocPaths: [],
        docsDirectoryEntries: [],
        otherRoots: [],
      },
      profileKey: 'grok_4_3',
      payload: {
        streamId: 's-plan',
        model: 'grok-4.3',
        userText: 'Plan a todo app',
        threadSnapshot: [],
        activeContext: { openTabs: [], chatMode: 'plan' },
      },
      projectId,
    })

    expect(approvedPlanArtifact).toBeNull()
    expect(systemPrompt).toContain('gf-plan')
    expect(systemPrompt).not.toContain('## Approved plan execution')
  })
})