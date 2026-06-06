import { describe, expect, it } from 'vitest'
import type { AgentChatActivityPayload } from '../../../shared/agent/chat-contract'
import {
  assistantReplyClaimsDiskWrites,
  assistantReplyClaimsEditOutcomeWithoutTool,
  assistantReplyClaimsEditSuccessDespiteNoProposal,
  turnHadFailedEditActivities,
} from './assistant-disk-claim-heuristic'
import { AGENT_TOOL_FENCE_INFO } from '../../../harness-support/tools/contracts/tool-contract'

describe('assistantReplyClaimsDiskWrites', () => {
  it('is true when past-tense claims meet disk-ish context', () => {
    expect(
      assistantReplyClaimsDiskWrites(
        "I've replaced the full `EditorEmptyState.tsx` with the polished version.",
      ),
    ).toBe(true)
    expect(assistantReplyClaimsDiskWrites('I have updated src/App.tsx for the new layout.')).toBe(true)
    expect(assistantReplyClaimsDiskWrites('The files have been saved to disk.')).toBe(true)
  })

  it('is false without disk-ish context', () => {
    expect(assistantReplyClaimsDiskWrites("I've changed my mind about the approach.")).toBe(false)
    expect(
      assistantReplyClaimsDiskWrites("I've updated the plan — next I will read the file."),
    ).toBe(false)
  })

  it('is true for sentence-initial Updated path.md without I have', () => {
    expect(
      assistantReplyClaimsDiskWrites(
        'Updated overview.md (Tech Stack section now reflects React + TypeScript).',
      ),
    ).toBe(true)
  })

  it('is false when a tool fence or propose_file_edits is mentioned', () => {
    expect(
      assistantReplyClaimsDiskWrites(
        `Done.\n\n\`\`\`${AGENT_TOOL_FENCE_INFO}\n{"version":1,"operations":[]}\n\`\`\``,
      ),
    ).toBe(false)
    expect(
      assistantReplyClaimsDiskWrites(
        "I've updated App.tsx; calling propose_file_edits next.",
      ),
    ).toBe(false)
  })
})

describe('assistantReplyClaimsEditOutcomeWithoutTool', () => {
  it('is true when the reply claims a proposal is ready for diff review', () => {
    expect(
      assistantReplyClaimsEditOutcomeWithoutTool(
        'The edit proposal for the title text change, footer paragraph, and dark-blue background is ready for your review in the diff panel.',
      ),
    ).toBe(true)
  })

  it('still covers past-tense disk write claims', () => {
    expect(assistantReplyClaimsEditOutcomeWithoutTool('I have updated src/App.tsx for the new layout.')).toBe(
      true,
    )
  })

  it('is false for neutral explanations', () => {
    expect(
      assistantReplyClaimsEditOutcomeWithoutTool(
        'To change the title, you would edit the <title> element in index.html.',
      ),
    ).toBe(false)
  })

  it('detects complete-file phrasing when hadEditFailures (152)', () => {
    expect(
      assistantReplyClaimsEditOutcomeWithoutTool(
        'Here is your complete single-file HTML prototype.',
        { hadEditFailures: true },
      ),
    ).toBe(true)
    expect(
      assistantReplyClaimsEditOutcomeWithoutTool(
        'Here is your complete single-file HTML prototype.',
        { hadEditFailures: false },
      ),
    ).toBe(false)
  })

  it('detects large fenced fallback when hadEditFailures (152)', () => {
    const bigFence = '```html\n' + '<div>line</div>\n'.repeat(50) + '```'
    expect(
      assistantReplyClaimsEditOutcomeWithoutTool(bigFence, { hadEditFailures: true }),
    ).toBe(true)
  })
})

describe('turnHadFailedEditActivities', () => {
  it('is true when an edit failure activity row exists', () => {
    const activities: AgentChatActivityPayload[] = [
      {
        id: 'a1',
        title: 'Edit proposal failed',
        status: 'error',
        detail: 'crushed',
      },
    ]
    expect(turnHadFailedEditActivities(activities)).toBe(true)
  })
})

describe('assistantReplyClaimsEditSuccessDespiteNoProposal', () => {
  it('combines activity failures with misleading reply text', () => {
    const activities: AgentChatActivityPayload[] = [
      { id: 'a1', title: 'Edit proposal failed', status: 'error' },
    ]
    expect(
      assistantReplyClaimsEditSuccessDespiteNoProposal(
        'Created the file index.html with your task board prototype.',
        activities,
      ),
    ).toBe(true)
  })
})
