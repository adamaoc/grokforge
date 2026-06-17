import { describe, expect, it } from 'vitest'
import {
  formatGfPlanArtifactReadPath,
  parseGfPlanArtifactReadPath,
} from '../plan-artifact-read-path'

describe('plan-artifact-read-path', () => {
  it('parses gf-plan uuid paths', () => {
    const planId = '6903bde7-102f-4ec1-808d-936fac7d78a3'
    expect(parseGfPlanArtifactReadPath(`gf-plan:${planId}`)).toEqual({
      planId,
      format: 'json',
    })
    expect(parseGfPlanArtifactReadPath(`gf-plan:${planId}/plan.md`)).toEqual({
      planId,
      format: 'md',
    })
    expect(parseGfPlanArtifactReadPath('root:architecture.md')).toBeNull()
  })

  it('formats virtual read paths', () => {
    const planId = '6903bde7-102f-4ec1-808d-936fac7d78a3'
    expect(formatGfPlanArtifactReadPath(planId)).toBe(`gf-plan:${planId}`)
    expect(formatGfPlanArtifactReadPath(planId, 'md')).toBe(`gf-plan:${planId}/plan.md`)
  })
})