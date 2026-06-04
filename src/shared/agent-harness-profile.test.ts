import { describe, expect, it } from 'vitest'
import { buildFinalAnswerContract } from '../harness/policy/final-answer/final-answer-contract'
import {
  appendHarnessProfileToSystemPrompt,
  buildAgentToolLoopSharedSections,
  buildHarnessTurnPromptSections,
  buildVoiceHarnessAppendix,
  getHarnessProfile,
  getHarnessProfileForModelId,
} from '../harness/profiles/harness-profile'
import { POST_PLAN_INCREMENTAL_ENFORCEMENT_LINE } from '../harness/policy/incremental/work-edit-policy'
import {
  POST_PLAN_INCREMENTAL_MARKER,
  SINGLE_FILE_EDIT_BIAS_MARKER,
} from '../harness/plan/routing/post-plan-incremental'
import { POPULATED_WORK_EDIT_MARKER } from '../harness/routing/populated-workspace-edit'
import { WORK_ITERATIVE_EDIT_MARKER, WORK_SURGICAL_EDIT_MARKER } from '../harness/routing/iterative-work-edit'
import { ITERATIVE_EDIT_SCOPE_MARKER, resolveIterativeEditScope } from '../harness/routing/iterative-edit-scope'
import { GREENFIELD_HARNESS_MARKER } from '../harness/context/workspace-greenfield'
import { GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER } from '../harness/plan/verification/plan-verification'
import { GREENFIELD_SCAFFOLD_MANIFEST_MARKER } from '../harness/context/bootstrap-manifest'
import { SCAFFOLD_STRATEGY_ROUTING_MARKER } from '../harness/routing/scaffold-strategy'
import {
  GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS,
  GREENFIELD_EXECUTE_CLI_MARKER,
  GREENFIELD_WORK_BOOTSTRAP_MARKER,
} from '../harness/profiles/harness-profile'

describe('getHarnessProfile', () => {
  it('returns distinct profiles for grok_code_fast and grok_4_3', () => {
    const fast = getHarnessProfile('grok_code_fast')
    const capable = getHarnessProfile('grok_4_3')
    expect(fast.toolUseBias).toContain('fast')
    expect(capable.toolUseBias).toContain('capable')
    expect(fast.systemPromptSections.join(' ')).toMatch(/fast/i)
    expect(capable.systemPromptSections.join(' ')).toMatch(/planning/i)
    expect(fast.toolLoopSections).not.toEqual(capable.toolLoopSections)
  })

  it('resolves model id to profile', () => {
    expect(getHarnessProfileForModelId('grok-4.3').key).toBe('grok_4_3')
    expect(getHarnessProfileForModelId('unknown-model').key).toBe('generic')
  })
})

describe('appendHarnessProfileToSystemPrompt', () => {
  it('appends profile sections', () => {
    const profile = getHarnessProfile('grok_code_fast')
    const out = appendHarnessProfileToSystemPrompt('base', profile)
    expect(out).toContain('base')
    expect(out).toContain('Harness profile (fast execution)')
  })
})

describe('tool description overrides', () => {
  it('documents search_workspace override on fast profile', () => {
    const overrides = getHarnessProfile('grok_code_fast').toolDescriptionOverrides
    expect(overrides.search_workspace).toMatch(/ripgrep|rg/i)
  })

  it('documents run_command override on fast profile', () => {
    const overrides = getHarnessProfile('grok_code_fast').toolDescriptionOverrides
    expect(overrides.run_command).toMatch(/npm install|typecheck/i)
  })
})

/** Test helper mirroring workspace-tools merge (unit-tested in main via buildAgentToolDefinitions). */
export function applyToolDescriptionOverridesForTest(
  base: Record<AgentChatToolName, string>,
  overrides: Partial<Record<AgentChatToolName, string>>,
): Record<AgentChatToolName, string> {
  return { ...base, ...overrides }
}

describe('applyToolDescriptionOverridesForTest', () => {
  it('merges overrides onto base descriptions', () => {
    const base = { search_workspace: 'base', read_file: 'read' } as Record<AgentChatToolName, string>
    const merged = applyToolDescriptionOverridesForTest(base, {
      search_workspace: 'override',
    })
    expect(merged.search_workspace).toBe('override')
    expect(merged.read_file).toBe('read')
  })
})

describe('buildVoiceHarnessAppendix', () => {
  it('includes cross-surface explore rules', () => {
    const appendix = buildVoiceHarnessAppendix('generic')
    expect(appendix).toContain('search_workspace')
    expect(appendix).toContain('Continue in agent chat')
  })
})

describe('buildHarnessTurnPromptSections', () => {
  it('includes greenfield marker for grok_4_3 when greenfieldWorkspace', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_4_3'), {
      greenfieldWorkspace: true,
    })
    expect(sections.join('\n')).toContain(GREENFIELD_HARNESS_MARKER)
  })

  it('includes execute-from-plan sections for grok_code_fast when executeFromApprovedPlan', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      executeFromApprovedPlan: true,
    })
    expect(sections.join('\n')).toMatch(/Execute approved plan/i)
  })

  it('includes greenfield planner marker and scaffold manifest guidance', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_4_3'), {
      greenfieldWorkspace: true,
    })
    const joined = sections.join('\n')
    expect(joined).toContain(GREENFIELD_HARNESS_MARKER)
    expect(joined).toContain(GREENFIELD_SCAFFOLD_MANIFEST_MARKER)
    expect(joined).toContain(GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER)
    expect(joined).toMatch(/Vite \+ React \+ TS/i)
    // Relaxed for simple static: browser-only ok; serve language is now conditional/optional
    expect(joined).toMatch(/browser-only|Open index\.html directly|lightweight serve|ultra-simple|simple static/i)
  })

  it('includes greenfield execute strategy routing when scaffoldStrategy set', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      executeFromApprovedPlan: true,
      greenfieldWorkspace: true,
      scaffoldStrategy: 'cli_scaffold',
    })
    const joined = sections.join('\n')
    expect(joined).toContain(SCAFFOLD_STRATEGY_ROUTING_MARKER)
    expect(joined).toMatch(/cli_scaffold/i)
  })

  it('includes greenfield bootstrap execute sections when empty workspace', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      executeFromApprovedPlan: true,
      greenfieldWorkspace: true,
    })
    const joined = sections.join('\n')
    expect(joined).toMatch(/run_command/i)
    expect(joined).toMatch(/npm create|npm install/i)
    expect(joined).toMatch(/script\.js/i)
  })

  it('includes Work bootstrap marker for greenfield Work create intent (161)', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      greenfieldWorkBootstrap: true,
      scaffoldStrategy: 'file_bootstrap',
    })
    const joined = sections.join('\n')
    expect(joined).toContain(GREENFIELD_WORK_BOOTSTRAP_MARKER)
    expect(joined).toMatch(/one statement per line/i)
    expect(joined).toContain(SCAFFOLD_STRATEGY_ROUTING_MARKER)
    expect(joined).toMatch(/file_bootstrap/i)
    expect(joined).not.toContain(GREENFIELD_EXECUTE_CLI_MARKER)
    expect(joined).not.toMatch(/Execute approved plan/i)
  })

  it('does not inject Work bootstrap on approve-and-run execute path (161)', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      executeFromApprovedPlan: true,
      greenfieldWorkspace: true,
      greenfieldWorkBootstrap: false,
    })
    const joined = sections.join('\n')
    expect(joined).toContain(GREENFIELD_EXECUTE_CLI_MARKER)
    expect(joined).not.toContain(GREENFIELD_WORK_BOOTSTRAP_MARKER)
  })

  it('does not inject Work bootstrap for iterative Work edits (161)', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      iterativeWorkEdit: true,
      greenfieldWorkBootstrap: false,
    })
    expect(sections.join('\n')).not.toContain(GREENFIELD_WORK_BOOTSTRAP_MARKER)
    expect(sections.join('\n')).toContain(WORK_ITERATIVE_EDIT_MARKER)
  })

  it('does not inject Work bootstrap for greenfield planner profile alone (161)', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_4_3'), {
      greenfieldWorkspace: true,
    })
    const joined = sections.join('\n')
    expect(joined).toContain(GREENFIELD_HARNESS_MARKER)
    expect(joined).not.toContain(GREENFIELD_WORK_BOOTSTRAP_MARKER)
  })

  it('executor-from-plan discourages inline JS when plan lists multiple paths', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      executeFromApprovedPlan: true,
    })
    const joined = sections.join('\n')
    expect(joined).toMatch(/multiple concrete paths/i)
    expect(joined).toMatch(/script src="script\.js"/i)
  })

  it('includes execute-from-plan sections for grok_4_3 when executeFromApprovedPlan', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_4_3'), {
      executeFromApprovedPlan: true,
    })
    expect(sections.join('\n')).toMatch(/Execute approved plan/i)
  })

  it('includes post-plan incremental sections when postPlanIncremental', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      postPlanIncremental: true,
    })
    const text = sections.join('\n')
    expect(text).toContain(POST_PLAN_INCREMENTAL_MARKER)
    expect(text).toMatch(/do \*\*not\*\* emit a new `gf-plan`/i)
    expect(text).toMatch(
      /primary.*`edit`.*tool.*modifications.*existing|propose_file_edits.*new files/i,
    )
  })

  it('includes single-file bias when singleFilePrimary', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      singleFilePrimary: true,
      singleFilePrimaryBasename: 'index.html',
    })
    expect(sections.join('\n')).toContain(SINGLE_FILE_EDIT_BIAS_MARKER)
    expect(sections.join('\n')).toContain('index.html')
  })

  it('includes iterative Work edit sections when iterativeWorkEdit', () => {
    const scope = resolveIterativeEditScope({
      userText: 'add localStorage persistence for todos',
    })
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      iterativeWorkEdit: true,
      populatedWorkspace: true,
      activeFilePath: '/proj/src/App.tsx',
      iterativeEditScope: scope,
    })
    expect(sections.join('\n')).toContain(WORK_ITERATIVE_EDIT_MARKER)
    expect(sections.join('\n')).toContain(WORK_SURGICAL_EDIT_MARKER)
    expect(sections.join('\n')).toContain(POPULATED_WORK_EDIT_MARKER)
    expect(sections.join('\n')).toContain(ITERATIVE_EDIT_SCOPE_MARKER)
    expect(sections.join('\n')).toContain('script.js')
    expect(sections.join('\n')).toContain('src/App.tsx')
    expect(sections.join('\n')).toMatch(/do \*\*not\*\* emit a new `gf-plan`/i)
    expect(sections.join('\n')).toMatch(/persistence|script\.js/i)
    expect(sections.join('\n')).toMatch(/Do \*\*not\*\* re-read a path you already successfully edited/i)
  })

  it('uses bounded explore rules for iterative Work edits', () => {
    const shared = buildAgentToolLoopSharedSections({ iterativeWorkEdit: true })
    expect(shared.join('\n')).toMatch(/at most \*\*two\*\* read-only tool rounds/i)
    expect(shared.join('\n')).not.toMatch(/run discovery tools before proposing file changes/i)
  })

  it('includes merged iterative edit policy when iterativeWorkEdit (144)', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      iterativeWorkEdit: true,
    })
    const text = sections.join('\n')
    expect(text).toContain(WORK_ITERATIVE_EDIT_MARKER)
    expect(text).toMatch(/primary.*edit.*tool|Default.*preferred.*tool for modifications/i)
    expect(text).toMatch(/propose_file_edits/i)
    expect(text).not.toContain('## Work iterative search_replace quality')
  })

  it('adds post-plan enforcement line when postPlanIncremental (144)', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      postPlanIncremental: true,
    })
    expect(sections.join('\n')).toContain(POST_PLAN_INCREMENTAL_MARKER)
    expect(sections.join('\n')).toContain(POST_PLAN_INCREMENTAL_ENFORCEMENT_LINE)
    expect(sections.join('\n')).toMatch(/Conservative edits/i)
    expect(sections.join('\n')).toMatch(/read_file.*first in this turn/i)
    expect(sections.join('\n')).toMatch(/Strongly discouraged/i)
    expect(sections.join('\n')).toMatch(/Structural \/ behavior changes/i)
  })
})

describe('buildFinalAnswerContract with profileKey', () => {
  it('adds grok_4_3 plan appendix not present on fast profile', () => {
    const fastPlan = buildFinalAnswerContract({
      userText: 'plan a feature',
      editProposalCreated: false,
      chatMode: 'plan',
      profileKey: 'grok_code_fast',
    })
    const capablePlan = buildFinalAnswerContract({
      userText: 'plan a feature',
      editProposalCreated: false,
      chatMode: 'plan',
      profileKey: 'grok_4_3',
    })
    expect(capablePlan).toContain('filesLikelyTouched')
    expect(capablePlan).toMatch(/verification/i)
    expect(capablePlan.length).toBeGreaterThan(fastPlan.length)
    expect(capablePlan).toMatch(/structured steps|risks/i)
  })
})
