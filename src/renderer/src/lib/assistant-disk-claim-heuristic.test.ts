import { describe, expect, it } from 'vitest'
import { assistantReplyClaimsDiskWrites } from './assistant-disk-claim-heuristic'
import { AGENT_TOOL_FENCE_INFO } from '../../../shared/agent-tool-contract'

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
