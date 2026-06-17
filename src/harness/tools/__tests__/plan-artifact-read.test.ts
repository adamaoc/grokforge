import { mkdtemp, rm } from 'node:fs/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GF_PLAN_FENCE } from '../../../harness-support/plan/contracts/gf-plan-contract'
import { upsertPlanArtifactFromAssistantMessage } from '../../../harness-support/plan/store/plan-store'
import type { GrokProjectManifest } from '../../../main/project/manifest'
import { executeTool } from '../tools'
import type { HarnessToolEnv } from '../../workspace/paths'

const userDataRoot = mkdtempSync(join(tmpdir(), 'gf-harness-plan-read-'))

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

const projectId = 'proj-plan-read-test'

function testEnv(rootPath: string): HarnessToolEnv {
  const manifest: GrokProjectManifest = {
    version: '1',
    name: 'Plan Read Test',
    roots: [{ id: 'root', path: rootPath, label: 'Root', type: 'code' }],
    ignore: [],
    context: { alwaysInclude: [] },
    models: { default: 'grok-build-0.1' },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
  return { manifest, projectId }
}

afterEach(() => {
  rmSync(join(userDataRoot, 'workspace-projects', projectId), { recursive: true, force: true })
})

describe('read_file gf-plan artifact alias', () => {
  it('reads approved plan JSON via gf-plan:<planId>', async () => {
    const fence = `\`\`\`${GF_PLAN_FENCE}
{"schemaVersion":1,"summary":"Test plan","filesLikelyTouched":["a.md"],"risksUnknowns":[],"steps":[{"id":"1","title":"Write a.md"}],"verification":"One read_file on a.md"}
\`\`\``
    const upserted = upsertPlanArtifactFromAssistantMessage(projectId, 'msg-1', fence)
    expect(upserted?.planId).toBeTruthy()

    const dir = await mkdtemp(join(tmpdir(), 'gf-harness-plan-root-'))
    try {
      const res = await executeTool(
        testEnv(dir),
        'read_file',
        JSON.stringify({ path: `gf-plan:${upserted!.planId}` }),
      )
      expect(res.ok).toBe(true)
      const parsed = JSON.parse(res.text) as { rawContent: string; planArtifact?: boolean }
      expect(parsed.planArtifact).toBe(true)
      expect(parsed.rawContent).toContain('Test plan')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})