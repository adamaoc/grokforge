import { describe, expect, it } from 'vitest'
import { AGENT_TOOL_FENCE_INFO } from './agent-tool-contract'
import { GF_PLAN_FENCE } from './gf-plan-contract'
import { buildFinalAnswerContract } from './agent-final-answer-contract'

describe('buildFinalAnswerContract', () => {
  it('requires gf-plan and forbids edit fence when chatMode is plan', () => {
    const content = buildFinalAnswerContract({
      userText: 'create a todo app and plan the work',
      editProposalCreated: false,
      chatMode: 'plan',
    })
    expect(content).toContain(GF_PLAN_FENCE)
    expect(content).toContain('Plan mode')
    expect(content).not.toContain('Do not stop at prose')
    expect(content).toContain('propose_file_edits')
    expect(content).toMatch(/Do \*\*not\*\* call `propose_file_edits`/)
  })

  it('uses edit fence guidance for fast mode when user has edit intent', () => {
    const content = buildFinalAnswerContract({
      userText: 'create a todo app',
      editProposalCreated: false,
      chatMode: 'fast',
    })
    expect(content).toContain(AGENT_TOOL_FENCE_INFO)
    expect(content).toContain('Do not stop at prose')
    expect(content).not.toContain('Final response contract (Plan mode)')
  })
})
