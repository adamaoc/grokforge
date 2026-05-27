import { describe, expect, it } from 'vitest'
import { buildAgentContextCompanionView } from './agent-context-companion'

const emptySnapshot = {
  hasPendingProposal: false,
  proposalPaths: [],
  proposalApplied: false,
  isLiveTurn: false,
  liveActiveFilePath: null,
  recentToolPaths: [],
  agentFileFocus: null,
}

describe('buildAgentContextCompanionView', () => {
  it('prioritizes pending proposal over live turn', () => {
    const view = buildAgentContextCompanionView({
      snapshot: {
        ...emptySnapshot,
        hasPendingProposal: true,
        proposalPaths: ['/proj/src/app.js'],
        isLiveTurn: true,
      },
      activeFile: null,
      diffSession: null,
    })
    expect(view?.kind).toBe('proposal')
    expect(view?.primaryPath).toContain('app.js')
  })

  it('shows live working headline from tool paths', () => {
    const view = buildAgentContextCompanionView({
      snapshot: {
        ...emptySnapshot,
        isLiveTurn: true,
        recentToolPaths: ['/proj/script.js'],
      },
      activeFile: null,
      diffSession: null,
    })
    expect(view?.kind).toBe('live')
    expect(view?.headline).toContain('script.js')
  })
})
