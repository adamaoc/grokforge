import { describe, expect, it } from 'vitest'
import { buildFinalAnswerContract } from './agent-final-answer-contract'
import type { AgentChatToolName } from './agent-chat-contract'
import {
  appendHarnessProfileToSystemPrompt,
  buildHarnessTurnPromptSections,
  buildVoiceHarnessAppendix,
  getHarnessProfile,
  getHarnessProfileForModelId,
} from './agent-harness-profile'
import {
  POST_PLAN_INCREMENTAL_MARKER,
  SINGLE_FILE_EDIT_BIAS_MARKER,
} from './post-plan-incremental'
import { GREENFIELD_HARNESS_MARKER } from './workspace-greenfield'

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

  it('includes greenfield bootstrap execute sections when empty workspace', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      executeFromApprovedPlan: true,
      greenfieldWorkspace: true,
    })
    const joined = sections.join('\n')
    expect(joined).toMatch(/one `propose_file_edits`/i)
    expect(joined).not.toMatch(/one file per/i)
    expect(joined).toMatch(/script\.js/i)
    expect(joined).toMatch(/external.*script src/i)
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
    expect(sections.join('\n')).toContain(POST_PLAN_INCREMENTAL_MARKER)
    expect(sections.join('\n')).toMatch(/do \*\*not\*\* emit a new `gf-plan`/i)
  })

  it('includes single-file bias when singleFilePrimary', () => {
    const sections = buildHarnessTurnPromptSections(getHarnessProfile('grok_code_fast'), {
      singleFilePrimary: true,
      singleFilePrimaryBasename: 'index.html',
    })
    expect(sections.join('\n')).toContain(SINGLE_FILE_EDIT_BIAS_MARKER)
    expect(sections.join('\n')).toContain('index.html')
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
