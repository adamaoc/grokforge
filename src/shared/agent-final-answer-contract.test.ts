import { describe, expect, it } from 'vitest'
import { AGENT_TOOL_FENCE_INFO } from './agent-tool-contract'
import { GF_PLAN_FENCE } from './gf-plan-contract'
import { buildFinalAnswerContract } from './agent-final-answer-contract'

describe('buildFinalAnswerContract', () => {
  it('requires gf-plan and forbids edit tools when chatMode is plan', () => {
    const content = buildFinalAnswerContract({
      userText: 'create a todo app and plan the work',
      editProposalCreated: false,
      chatMode: 'plan',
      agentProfileId: 'planner',
    })
    expect(content).toContain('planner')
    expect(content).toContain(GF_PLAN_FENCE)
    expect(content).toContain('Plan mode')
    expect(content).not.toContain('Do not stop at prose')
    expect(content).toContain('propose_file_edits')
    expect(content).toMatch(/Do \*\*not\*\* call `propose_file_edits`/i)
    expect(content).not.toContain(AGENT_TOOL_FENCE_INFO)
  })

  it('adds executor-from-plan appendix on approve-and-run fast turns', () => {
    const content = buildFinalAnswerContract({
      userText: 'execute the approved plan',
      editProposalCreated: false,
      chatMode: 'fast',
      profileKey: 'grok_code_fast',
      agentProfileId: 'executor',
      executeFromApprovedPlan: true,
    })
    expect(content).toMatch(/approved `gf-plan`/i)
    expect(content).toMatch(/search_replace/i)
  })

  it('requires propose_file_edits for fast mode when user has edit intent', () => {
    const content = buildFinalAnswerContract({
      userText: 'create a todo app',
      editProposalCreated: false,
      chatMode: 'fast',
    })
    expect(content).toContain('propose_file_edits')
    expect(content).not.toContain(AGENT_TOOL_FENCE_INFO)
    expect(content).not.toContain('Final response contract (Plan mode)')
    expect(content).toMatch(/Do not stop at prose/i)
  })
})
