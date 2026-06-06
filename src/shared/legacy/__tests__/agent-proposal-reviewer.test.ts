import { describe, expect, it } from 'vitest'
import {
  AGENT_REVIEWER_DEFAULT_MODEL,
  estimateProposalChangedLines,
  parseProposalReview,
  resolveAgentReviewerConfig,
  shouldAutoReviewProposal,
} from '../../agent/proposal-reviewer'

describe('agent proposal reviewer', () => {
  it('defaults to an opt-in Grok Build reviewer config', () => {
    expect(resolveAgentReviewerConfig(undefined)).toEqual({
      autoReviewEdits: false,
      model: AGENT_REVIEWER_DEFAULT_MODEL,
      minChangedLines: 80,
    })
  })

  it('thresholds automatic review by proposed line count outside plan mode', () => {
    const proposal = {
      batch: {
        version: 1 as const,
        operations: [
          {
            op: 'write_file' as const,
            path: '/tmp/app.ts',
            content: ['a', 'b', 'c', 'd', 'e'].join('\n'),
          },
        ],
      },
      rejected: [],
    }
    const config = { autoReviewEdits: true, model: 'grok-build-0.1', minChangedLines: 6 }
    expect(estimateProposalChangedLines(proposal.batch)).toBe(5)
    expect(shouldAutoReviewProposal({ config, proposal, chatMode: 'fast' })).toBe(false)
    expect(shouldAutoReviewProposal({ config, proposal, chatMode: 'plan' })).toBe(true)
  })

  it('parses strict reviewer JSON and caps issues', () => {
    const review = parseProposalReview(
      JSON.stringify({
        overallVerdict: 'fail',
        summary: 'The proposal looks broken.',
        issues: [{ severity: 'error', path: 'src/App.tsx', message: 'Crushed JSX.' }],
      }),
      'grok-build-0.1',
    )
    expect(review.overallVerdict).toBe('fail')
    expect(review.issues).toEqual([
      { severity: 'error', path: 'src/App.tsx', message: 'Crushed JSX.' },
    ])
  })
})
