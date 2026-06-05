import { describe, expect, it } from 'vitest'
import {
  PROPOSAL_REJECTIONS_BEFORE_FORCE_FINAL,
  extractPathsFromEditToolArguments,
  pathsAtProposalRejectionForceFinalThreshold,
  recordProposalRejection,
  shouldForceFinalForRepeatedProposalRejections,
} from './agent-proposal-rejection-loop'
import { AGENT_TOOL_PROTOCOL_VERSION } from '../harness-support/tools/contracts/tool-contract'

describe('agent-proposal-rejection-loop', () => {
  it('recordProposalRejection increments per normalized path', () => {
    const map = new Map<string, number>()
    recordProposalRejection(map, '/proj/script.js')
    recordProposalRejection(map, '\\proj\\script.js')
    expect(map.get('/proj/script.js')).toBe(2)
  })

  it('shouldForceFinalForRepeatedProposalRejections at threshold when no proposal', () => {
    const map = new Map<string, number>([['/proj/a.js', 3]])
    expect(
      shouldForceFinalForRepeatedProposalRejections({
        editProposalCreated: false,
        rejectionsByPath: map,
      }),
    ).toBe(true)
    expect(
      shouldForceFinalForRepeatedProposalRejections({
        editProposalCreated: true,
        rejectionsByPath: map,
      }),
    ).toBe(false)
    expect(
      shouldForceFinalForRepeatedProposalRejections({
        editProposalCreated: false,
        rejectionsByPath: new Map([['/proj/a.js', 2]]),
      }),
    ).toBe(false)
  })

  it('pathsAtProposalRejectionForceFinalThreshold lists paths at or above threshold', () => {
    const map = new Map<string, number>([
      ['/proj/a.js', PROPOSAL_REJECTIONS_BEFORE_FORCE_FINAL],
      ['/proj/b.js', 1],
    ])
    expect(pathsAtProposalRejectionForceFinalThreshold(map)).toEqual(['/proj/a.js'])
  })

  it('extractPathsFromEditToolArguments from valid batch and JSON string', () => {
    const batch = {
      version: AGENT_TOOL_PROTOCOL_VERSION,
      operations: [
        { op: 'write_file', path: 'src/a.js', content: 'x' },
        { op: 'delete_file', path: 'src/b.js' },
      ],
    }
    expect(extractPathsFromEditToolArguments(batch)).toEqual(['src/a.js', 'src/b.js'])
    expect(extractPathsFromEditToolArguments(JSON.stringify(batch))).toEqual(['src/a.js', 'src/b.js'])
  })

  it('extractPathsFromEditToolArguments returns empty for malformed payloads', () => {
    expect(extractPathsFromEditToolArguments(null)).toEqual([])
    expect(extractPathsFromEditToolArguments({ version: 1 })).toEqual([])
    expect(extractPathsFromEditToolArguments('not json')).toEqual([])
  })
})
