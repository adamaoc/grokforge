import { describe, expect, it } from 'vitest'
import {
  buildApprovedPlanExecuteSummary,
  renderPlanMarkdown,
  StoredPlanArtifactSchema,
} from '../harness/plan/contracts/plan-artifact'

const sampleArtifact = {
  schemaVersion: 1 as const,
  planId: '00000000-0000-4000-8000-000000000001',
  threadMessageId: 'msg-plan-1',
  createdAt: '2026-05-19T12:00:00.000Z',
  status: 'pending' as const,
  plan: {
    schemaVersion: 1 as const,
    summary: 'Add admin dashboard',
    filesLikelyTouched: ['src/admin/page.tsx'],
    risksUnknowns: ['Auth not wired'],
    steps: [
      { id: '1', title: 'Scaffold admin route' },
      { id: '2', title: 'Add layout component' },
    ],
    verification: 'npm run typecheck',
  },
}

describe('StoredPlanArtifactSchema', () => {
  it('round-trips valid artifact', () => {
    const parsed = StoredPlanArtifactSchema.parse(sampleArtifact)
    expect(parsed.planId).toBe(sampleArtifact.planId)
  })
})

describe('renderPlanMarkdown', () => {
  it('includes step titles', () => {
    const md = renderPlanMarkdown(StoredPlanArtifactSchema.parse(sampleArtifact))
    expect(md).toContain('Scaffold admin route')
    expect(md).toContain('Add layout component')
    expect(md).toContain('npm run typecheck')
  })
})

describe('buildApprovedPlanExecuteSummary', () => {
  it('stays within max chars', () => {
    const summary = buildApprovedPlanExecuteSummary(
      StoredPlanArtifactSchema.parse(sampleArtifact),
      400,
    )
    expect(summary.length).toBeLessThanOrEqual(400)
    expect(summary).toContain('admin')
  })
})
