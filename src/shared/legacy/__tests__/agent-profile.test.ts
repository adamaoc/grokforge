import { describe, expect, it } from 'vitest'
import { getAgentProfile, isToolAllowedForProfile, resolveAgentProfileId } from '../../../harness-support/profiles/agent-profile'

describe('getAgentProfile', () => {
  it('planner excludes edit and command tools', () => {
    const p = getAgentProfile('planner')
    expect(p.canProposeEdits).toBe(false)
    expect(p.canRunCommand).toBe(false)
    expect(p.allowedTools).not.toContain('propose_file_edits')
    expect(p.allowedTools).not.toContain('search_replace')
    expect(p.allowedTools).not.toContain('run_command')
    expect(p.allowedTools).toContain('read_file')
  })

  it('executor and default include full toolset', () => {
    for (const id of ['executor', 'default'] as const) {
      const p = getAgentProfile(id)
      expect(p.allowedTools).toContain('propose_file_edits')
      expect(p.allowedTools).toContain('run_command')
      expect(p.canProposeEdits).toBe(true)
      expect(p.canRunCommand).toBe(true)
    }
  })
})

describe('resolveAgentProfileId', () => {
  const baseContext = { openTabs: [] as { path: string; dirty: boolean }[] }

  it('maps plan mode to planner', () => {
    expect(
      resolveAgentProfileId({
        activeContext: { ...baseContext, chatMode: 'plan' },
        modelIntent: 'planning',
      }),
    ).toBe('planner')
    expect(
      resolveAgentProfileId({
        activeContext: { ...baseContext, chatMode: 'plan' },
        modelIntent: 'execution',
      }),
    ).toBe('planner')
  })

  it('maps approve-and-run to executor', () => {
    expect(
      resolveAgentProfileId({
        activeContext: { ...baseContext, chatMode: 'fast' },
        modelIntent: 'execution',
      }),
    ).toBe('executor')
  })

  it('maps isApprovedPlanAutoRun to executor without modelIntent', () => {
    expect(
      resolveAgentProfileId({
        activeContext: { ...baseContext, chatMode: 'fast' },
        isApprovedPlanAutoRun: true,
      }),
    ).toBe('executor')
  })

  it('maps fast default chat to default', () => {
    expect(
      resolveAgentProfileId({
        activeContext: { ...baseContext, chatMode: 'fast' },
        modelIntent: 'chat_default',
      }),
    ).toBe('default')
  })

  it('maps postPlanIncremental to executor in Work mode', () => {
    expect(
      resolveAgentProfileId({
        activeContext: { ...baseContext, chatMode: 'fast' },
        postPlanIncremental: true,
      }),
    ).toBe('executor')
  })

  it('plan mode wins over postPlanIncremental', () => {
    expect(
      resolveAgentProfileId({
        activeContext: { ...baseContext, chatMode: 'plan' },
        postPlanIncremental: true,
      }),
    ).toBe('planner')
  })
})

describe('isToolAllowedForProfile', () => {
  it('blocks edit tools on planner', () => {
    const planner = getAgentProfile('planner')
    expect(isToolAllowedForProfile('search_workspace', planner)).toBe(true)
    expect(isToolAllowedForProfile('propose_file_edits', planner)).toBe(false)
  })
})
