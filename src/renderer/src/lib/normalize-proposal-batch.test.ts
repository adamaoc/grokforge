import { describe, expect, it } from 'vitest'
import { normalizeProposalBatch } from './normalize-proposal-batch'

describe('normalizeProposalBatch', () => {
  it('reflows crushed HTML write_file content', () => {
    const crushed =
      '<!DOCTYPE html><html><head><title>T</title></head><body><p>ok</p></body></html>'
    const batch = normalizeProposalBatch({
      version: 1,
      operations: [{ op: 'write_file', path: '/p/index.html', content: crushed }],
    })
    const op = batch.operations[0]
    expect(op?.op).toBe('write_file')
    if (op?.op !== 'write_file') throw new Error('expected write')
    expect(op.content.split('\n').length).toBeGreaterThan(3)
    expect(op.content).toContain('<body>')
  })
})
