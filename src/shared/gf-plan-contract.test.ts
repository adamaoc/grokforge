import { describe, expect, it } from 'vitest'
import { AGENT_TOOL_FENCE_INFO } from './agent-tool-contract'
import {
  buildGfPlanFinalAnswerContract,
  buildGfPlanToolLoopBlock,
  GF_PLAN_FENCE,
  GF_PLAN_OUTPUT_CONTRACT,
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

  it('GF_PLAN_OUTPUT_CONTRACT is shared by tool loop and final answer builders', () => {
    const toolLoop = buildGfPlanToolLoopBlock({ forbiddenLegacyFenceTag: AGENT_TOOL_FENCE_INFO })
    const finalAnswer = buildGfPlanFinalAnswerContract({ agentProfileId: 'planner' })
    expect(toolLoop).toMatch(/your final answer must include.*`gf-plan`.*`grokforge-agent-tools`/is)
    for (const line of GF_PLAN_OUTPUT_CONTRACT.slice(1)) {
      expect(toolLoop).toContain(line)
      expect(finalAnswer).toContain(line)
    }
    expect(finalAnswer).toContain(GF_PLAN_OUTPUT_CONTRACT[0]!)
    expect(finalAnswer).not.toContain(AGENT_TOOL_FENCE_INFO)
    expect(finalAnswer).toContain('planner')
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
