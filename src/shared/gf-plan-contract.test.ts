import { describe, expect, it } from 'vitest'
import {
  GF_PLAN_FENCE,
  parseGfPlanFromAssistantContent,
  stripGfPlanFenceFromAssistantDisplay,
} from './gf-plan-contract'

const validJson = JSON.stringify({
  schemaVersion: 1,
  summary: 'Do the thing',
  filesLikelyTouched: ['src/a.ts'],
  risksUnknowns: ['Unknown deps'],
  steps: [{ id: 's1', title: 'Read files' }],
  verification: 'Run npm test',
})

describe('gf-plan-contract', () => {
  it('parses a valid fenced block', () => {
    const content = `Here is the plan.\n\n\`\`\`${GF_PLAN_FENCE}\n${validJson}\n\`\`\`\n`
    const plan = parseGfPlanFromAssistantContent(content)
    expect(plan?.summary).toBe('Do the thing')
    expect(plan?.steps).toHaveLength(1)
  })

  it('returns null for invalid JSON inside fence', () => {
    const content = `\`\`\`${GF_PLAN_FENCE}\n{ not json \n\`\`\``
    expect(parseGfPlanFromAssistantContent(content)).toBeNull()
  })

  it('stripGfPlanFence removes fence and incomplete tail', () => {
    const stripped = stripGfPlanFenceFromAssistantDisplay(
      `Intro\n\`\`\`${GF_PLAN_FENCE}\n${validJson}\n\`\`\`\nOutro`,
    )
    expect(stripped).toContain('Intro')
    expect(stripped).toContain('Outro')
    expect(stripped).not.toContain('gf-plan')
    const partial = stripGfPlanFenceFromAssistantDisplay(`Start\n\`\`\`${GF_PLAN_FENCE}\n{"schemaVersion":1`)
    expect(partial).toContain('Start')
    expect(partial).not.toContain('schemaVersion')
  })
})
