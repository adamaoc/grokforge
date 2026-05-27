import { describe, expect, it } from 'vitest'
import { AGENT_TOOL_FENCE_INFO } from './agent-tool-contract'
import { GF_PLAN_FENCE } from './gf-plan-contract'
import {
  buildFinalAnswerContract,
  buildEditIntentToolNudge,
  buildIncompleteHtmlProposalNudge,
  buildCrushedJavaScriptProposalNudge,
  buildCreationIncrementalRecoveryNudge,
  buildPartialBatchProposalNudge,
  EDIT_CREATION_INCREMENTAL_RECOVERY_MARKER,
  EDIT_CRUSHED_JS_NUDGE_MARKER,
  buildPlanVerifyCommandNudge,
  buildSearchReplaceEscalationNudge,
  COMMAND_TOOLS_FAILED_HONESTY_MARKER,
  SCAFFOLD_STRATEGY_HONESTY_MARKER,
  EDIT_INCOMPLETE_HTML_NUDGE_MARKER,
  EDIT_INTENT_TOOL_NUDGE_MARKER,
  EDIT_PARTIAL_BATCH_NUDGE_MARKER,
  EDIT_SEARCH_REPLACE_ESCALATION_MARKER,
  EDIT_ITERATIVE_SEARCH_REPLACE_ESCALATION_MARKER,
  MERGED_EDIT_PROPOSAL_HONESTY_MARKER,
  PARTIAL_BATCH_PROPOSAL_HONESTY_MARKER,
  PLAN_VERIFY_COMMAND_NUDGE_MARKER,
  shouldInjectPartialBatchProposalNudge,
  isLikelyEditIntent,
} from './agent-final-answer-contract'

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

  it('adds post-plan incremental appendix without gf-plan requirement', () => {
    const content = buildFinalAnswerContract({
      userText: 'add delete button',
      editProposalCreated: false,
      chatMode: 'fast',
      agentProfileId: 'executor',
      postPlanIncremental: true,
    })
    expect(content).toMatch(/Incremental Work edit/i)
    expect(content).toMatch(/do \*\*not\*\* output a `gf-plan`/i)
    expect(content).not.toContain('Final response contract (Plan mode)')
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

  it('detects edit intent from common verbs', () => {
    expect(isLikelyEditIntent('In index.html, change the page title')).toBe(true)
    expect(isLikelyEditIntent('Explain how React hooks work')).toBe(false)
  })

  it('builds edit-intent tool nudge with stable marker', () => {
    expect(buildEditIntentToolNudge()).toContain(EDIT_INTENT_TOOL_NUDGE_MARKER)
    expect(buildEditIntentToolNudge()).toMatch(/search_replace/)
  })

  it('builds search_replace escalation nudge with stable marker and path labels', () => {
    const nudge = buildSearchReplaceEscalationNudge(['/proj/docs/overview.md'])
    expect(nudge).toContain(EDIT_SEARCH_REPLACE_ESCALATION_MARKER)
    expect(nudge).toContain('overview.md')
    expect(nudge).toMatch(/propose_file_edits/)
    expect(nudge).toMatch(/rawContent/)
  })

  it('builds iterative Work search_replace escalation nudge with 138 marker (138)', () => {
    const nudge = buildSearchReplaceEscalationNudge(['/proj/todo/script.js'], {
      iterativeWorkEdit: true,
    })
    expect(nudge).toContain(EDIT_SEARCH_REPLACE_ESCALATION_MARKER)
    expect(nudge).toContain('Harness: iterative search_replace escalation 138')
    expect(nudge).toContain('script.js')
    expect(nudge).toMatch(/Do \*\*not\*\* call \*\*`search_replace`\*\*/i)
    expect(nudge).toMatch(/propose_file_edits/)
    expect(nudge).toMatch(/rawContent/)
    expect(nudge).toMatch(/115/)
  })

  it('adds HTML script guidance when escalation paths include .html', () => {
    const nudge = buildSearchReplaceEscalationNudge(['/proj/app/index.html'])
    expect(nudge).toMatch(/index\.html/i)
    expect(nudge).toMatch(/propose_file_edits/)
    expect(nudge).toMatch(/<script src/i)
  })

  it('builds incomplete HTML nudge with stable marker and closing-tag guidance', () => {
    const nudge = buildIncompleteHtmlProposalNudge(['/proj/index.html'])
    expect(nudge).toContain(EDIT_INCOMPLETE_HTML_NUDGE_MARKER)
    expect(nudge).toContain('index.html')
    expect(nudge).toMatch(/<\/body>/i)
    expect(nudge).toMatch(/propose_file_edits/)
  })

  it('builds creation incremental recovery nudge with general incremental strategy', () => {
    const nudge = buildCreationIncrementalRecoveryNudge(['/proj/app.js'])
    expect(nudge).toContain(EDIT_CREATION_INCREMENTAL_RECOVERY_MARKER)
    expect(nudge).toMatch(/minimal viable/i)
    expect(nudge).toMatch(/search_replace/i)
    expect(nudge).not.toMatch(/Do not retry with one full multi-line script/i)
  })

  it('adds editToolsFailed appendix when edit tools did not succeed', () => {
    const content = buildFinalAnswerContract({
      userText: 'update overview.md tech stack',
      editProposalCreated: false,
      editToolsFailed: true,
      chatMode: 'fast',
    })
    expect(content).toMatch(/Edit tools did not succeed/i)
    expect(content).toMatch(/Do \*\*not\*\* claim any workspace file was updated/i)
  })

  it('adds merged-edit honesty appendix when proposals composed in-turn', () => {
    const content = buildFinalAnswerContract({
      userText: 'patch index.html',
      editProposalCreated: true,
      editProposalComposedInTurn: true,
      chatMode: 'fast',
    })
    expect(content).toContain(MERGED_EDIT_PROPOSAL_HONESTY_MARKER)
    expect(content).toMatch(/one\*\* combined diff review/i)
    expect(content).toMatch(/Do \*\*not\*\* describe multiple separate diff reviews/i)
  })

  it('builds partial batch nudge with TSX hint when App.tsx is rejected', () => {
    const nudge = buildPartialBatchProposalNudge(
      [{ path: '/proj/src/App.tsx', reason: 'orphan closing parentheses' }],
      1,
    )
    expect(nudge).toContain('App.tsx')
    expect(nudge).toMatch(/complete.*component/i)
  })

  it('builds partial batch nudge with stable marker and rejected path labels', () => {
    const nudge = buildPartialBatchProposalNudge(
      [{ path: '/proj/script.js', reason: 'JavaScript file looks crushed' }],
      2,
    )
    expect(nudge).toContain(EDIT_PARTIAL_BATCH_NUDGE_MARKER)
    expect(nudge).toContain('script.js')
    expect(nudge).toMatch(/2 file\(s\) are already in the pending diff review/i)
    expect(nudge).toMatch(/only the rejected paths/i)
    expect(nudge).toMatch(/one statement per line/i)
  })

  it('builds crushed JavaScript nudge with example layout', () => {
    const nudge = buildCrushedJavaScriptProposalNudge(['/proj/script.js'])
    expect(nudge).toContain(EDIT_CRUSHED_JS_NUDGE_MARKER)
    expect(nudge).toContain('script.js')
    expect(nudge).toMatch(/function loadItems/i)
    expect(nudge).not.toMatch(/\btodos\b/i)
  })

  it('shouldInjectPartialBatchProposalNudge when execute-from-plan has mixed batch', () => {
    expect(
      shouldInjectPartialBatchProposalNudge({
        acceptedCount: 2,
        rejected: [{ path: '/proj/script.js', reason: 'corrupt' }],
        executeFromApprovedPlan: true,
      }),
    ).toBe(true)
    expect(
      shouldInjectPartialBatchProposalNudge({
        acceptedCount: 0,
        rejected: [{ path: '/proj/script.js', reason: 'corrupt' }],
        executeFromApprovedPlan: true,
      }),
    ).toBe(false)
  })

  it('adds partial-batch honesty appendix when rejections remain at final answer', () => {
    const content = buildFinalAnswerContract({
      userText: 'execute the approved plan',
      editProposalCreated: true,
      chatMode: 'fast',
      agentProfileId: 'executor',
      executeFromApprovedPlan: true,
      partialBatchRejections: [{ path: '/proj/script.js', reason: 'orphan parens' }],
    })
    expect(content).toContain(PARTIAL_BATCH_PROPOSAL_HONESTY_MARKER)
    expect(content).toMatch(/Do \*\*not\*\* claim the approved plan is fully implemented/i)
    expect(content).toMatch(/script\.js/)
  })

  it('builds plan verify command nudge with stable marker', () => {
    const nudge = buildPlanVerifyCommandNudge({ verificationHint: 'npm run typecheck' })
    expect(nudge).toContain(PLAN_VERIFY_COMMAND_NUDGE_MARKER)
    expect(nudge).toMatch(/run_command/)
    expect(nudge).toContain('npm run typecheck')
    expect(nudge).toMatch(/npm install/)
  })

  it('builds static file-bootstrap plan verify nudge with serve examples', () => {
    const nudge = buildPlanVerifyCommandNudge({
      verificationHint: 'Open in browser and test',
      scaffoldStrategy: 'file_bootstrap',
      suggestedCommands: ['npx --yes serve . -l 3000'],
    })
    expect(nudge).toContain(PLAN_VERIFY_COMMAND_NUDGE_MARKER)
    expect(nudge).toMatch(/npx --yes serve/i)
    expect(nudge).toMatch(/python3 -m http\.server/i)
    expect(nudge).not.toMatch(/npm create/)
  })

  it('uses soft scaffold honesty when file_bootstrap recovered despite command failure', () => {
    const content = buildFinalAnswerContract({
      userText: 'execute the approved plan',
      editProposalCreated: true,
      chatMode: 'fast',
      agentProfileId: 'executor',
      executeFromApprovedPlan: true,
      scaffoldStrategyConflictIssued: true,
      scaffoldStrategyRecovered: true,
      scaffoldStrategy: 'file_bootstrap',
      commandToolsFailed: true,
    })
    expect(content).not.toMatch(/CLI scaffold is not complete/i)
  })

  it('uses soft scaffold honesty when recovered with file_bootstrap proposal', () => {
    const content = buildFinalAnswerContract({
      userText: 'execute the approved plan',
      editProposalCreated: true,
      chatMode: 'fast',
      agentProfileId: 'executor',
      executeFromApprovedPlan: true,
      scaffoldStrategyConflictIssued: true,
      scaffoldStrategyRecovered: true,
      scaffoldStrategy: 'file_bootstrap',
      commandToolsFailed: false,
    })
    expect(content).toContain(SCAFFOLD_STRATEGY_HONESTY_MARKER)
    expect(content).not.toMatch(/CLI scaffold is not complete/i)
    expect(content).not.toMatch(/scaffold strategy conflict/i)
    expect(content).toMatch(/review the proposal below/i)
  })

  it('keeps strong scaffold honesty when conflict nudge did not recover', () => {
    const content = buildFinalAnswerContract({
      userText: 'execute the approved plan',
      editProposalCreated: false,
      chatMode: 'fast',
      agentProfileId: 'executor',
      executeFromApprovedPlan: true,
      scaffoldStrategyConflictIssued: true,
      scaffoldStrategy: 'cli_scaffold',
      commandToolsFailed: false,
    })
    expect(content).toContain(SCAFFOLD_STRATEGY_HONESTY_MARKER)
    expect(content).toMatch(/scaffold strategy conflict/i)
    expect(content).toMatch(/Do \*\*not\*\* claim the project scaffold is ready/i)
  })

  it('adds edit-path honesty after search_replace escalation recovery', () => {
    const content = buildFinalAnswerContract({
      userText: 'update overview.md',
      editProposalCreated: true,
      chatMode: 'fast',
      searchReplaceEscalationRecovered: true,
    })
    expect(content).toMatch(/edit path honesty/i)
    expect(content).toMatch(/diff review is ready/i)
    expect(content).toMatch(/Do \*\*not\*\* tell the user that `search_replace` is the only path/i)
  })

  it('adds command-tools-failed honesty appendix', () => {
    const content = buildFinalAnswerContract({
      userText: 'execute plan with npm install',
      editProposalCreated: true,
      chatMode: 'fast',
      agentProfileId: 'executor',
      executeFromApprovedPlan: true,
      commandToolsFailed: true,
    })
    expect(content).toContain(COMMAND_TOOLS_FAILED_HONESTY_MARKER)
    expect(content).toMatch(/Do \*\*not\*\* claim dependencies were installed/i)
  })
})
