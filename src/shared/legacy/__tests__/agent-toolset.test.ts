import { describe, expect, it } from 'vitest'
import {
  AGENT_TOOLSET_FULL,
  AGENT_TOOLSET_READ_ONLY,
  expandToolset,
  isToolInToolset,
} from '../../../harness-support/profiles/contracts/toolset'

describe('agent-toolset', () => {
  it('read_only excludes edit and command tools', () => {
    expect(AGENT_TOOLSET_READ_ONLY).not.toContain('propose_file_edits')
    expect(AGENT_TOOLSET_READ_ONLY).not.toContain('search_replace')
    expect(AGENT_TOOLSET_READ_ONLY).not.toContain('run_command')
    expect(AGENT_TOOLSET_READ_ONLY).toContain('read_file')
  })

  it('full union includes all v1 agent tools', () => {
    expect(AGENT_TOOLSET_FULL).toContain('workspace_index')
    expect(AGENT_TOOLSET_FULL).toContain('edit')
    expect(AGENT_TOOLSET_FULL).toContain('propose_file_edits')
    expect(AGENT_TOOLSET_FULL).toContain('run_command')
    expect(AGENT_TOOLSET_FULL.length).toBe(7)
  })

  it('expandToolset composes non-full ids', () => {
    const tools = expandToolset(['read_only', 'edit'])
    expect(tools).toContain('search_workspace')
    expect(tools).toContain('propose_file_edits')
    expect(tools).not.toContain('run_command')
  })

  it('isToolInToolset checks membership', () => {
    expect(isToolInToolset('read_file', AGENT_TOOLSET_READ_ONLY)).toBe(true)
    expect(isToolInToolset('run_command', AGENT_TOOLSET_READ_ONLY)).toBe(false)
  })
})
