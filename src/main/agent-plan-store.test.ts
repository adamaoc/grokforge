import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GF_PLAN_FENCE } from '../shared/gf-plan-contract'

const userDataRoot = mkdtempSync(join(tmpdir(), 'grokforge-plans-'))

vi.mock('electron', () => ({
  app: { getPath: () => userDataRoot },
}))

vi.mock('./app-project-store', async () => {
  const actual = await vi.importActual<typeof import('./app-project-store')>('./app-project-store')
  return {
    ...actual,
    projectDir: (projectId: string) => join(userDataRoot, 'workspace-projects', projectId),
  }
})

import {
  findLatestCompletedPlanArtifact,
  findPlanByThreadMessageId,
  loadPlanArtifact,
  planJsonPath,
  setPlanArtifactStatus,
  upsertPlanArtifactFromAssistantMessage,
} from './agent-plan-store'

const projectId = 'proj-plan-test'

const validPlanFence = `\`\`\`${GF_PLAN_FENCE}
{"schemaVersion":1,"summary":"Build feature","filesLikelyTouched":["a.ts"],"risksUnknowns":[],"steps":[{"id":"1","title":"Step one"}],"verification":"npm test"}
\`\`\``

afterEach(() => {
  rmSync(join(userDataRoot, 'workspace-projects', projectId), { recursive: true, force: true })
})

describe('agent-plan-store', () => {
  it('writes plan.json and plan.md from assistant content', () => {
    const result = upsertPlanArtifactFromAssistantMessage(projectId, 'msg-abc', validPlanFence)
    expect(result?.planId).toBeTruthy()
    const json = readFileSync(planJsonPath(projectId, result!.planId), 'utf8')
    expect(json).toContain('"status": "pending"')
    expect(json).toContain('Step one')
    const artifact = loadPlanArtifact(projectId, result!.planId)
    expect(artifact?.threadMessageId).toBe('msg-abc')
  })

  it('approve updates status', () => {
    const { planId } = upsertPlanArtifactFromAssistantMessage(projectId, 'msg-2', validPlanFence)!
    expect(setPlanArtifactStatus(projectId, planId, 'approved')).toBe(true)
    expect(loadPlanArtifact(projectId, planId)?.status).toBe('approved')
    expect(loadPlanArtifact(projectId, planId)?.approvedAt).toBeTruthy()
  })

  it('finds plan by thread message id', () => {
    upsertPlanArtifactFromAssistantMessage(projectId, 'msg-find', validPlanFence)
    const found = findPlanByThreadMessageId(projectId, 'msg-find')
    expect(found?.threadMessageId).toBe('msg-find')
  })

  it('findLatestCompletedPlanArtifact returns newest approved or superseded', () => {
    const older = upsertPlanArtifactFromAssistantMessage(projectId, 'msg-old', validPlanFence)!
    setPlanArtifactStatus(projectId, older.planId, 'approved')
    const newer = upsertPlanArtifactFromAssistantMessage(projectId, 'msg-new', validPlanFence)!
    setPlanArtifactStatus(projectId, newer.planId, 'superseded')

    const latest = findLatestCompletedPlanArtifact(projectId)
    expect(latest?.planId).toBe(newer.planId)
    expect(latest?.status).toBe('superseded')
  })

  it('findLatestCompletedPlanArtifact ignores pending plans', () => {
    upsertPlanArtifactFromAssistantMessage(projectId, 'msg-pending', validPlanFence)
    expect(findLatestCompletedPlanArtifact(projectId)).toBeNull()
  })
})
