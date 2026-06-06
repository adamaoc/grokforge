import { describe, expect, it } from 'vitest'
import { buildRegenerateProposalMessage } from '../../../harness-support/diff/regenerate-proposal'

describe('buildRegenerateProposalMessage', () => {
  it('includes original request, paths, safety, and rework instructions', () => {
    const message = buildRegenerateProposalMessage({
      originalUserRequest: 'Add a widget to the admin dashboard',
      paths: [
        { path: '/proj/src/app/admin/page.tsx', action: 'write' },
        { path: '/proj/src/old.ts', action: 'delete' },
      ],
      safetySummaries: ['65 lines → 1 line (−98%)'],
      rejectedPaths: [{ path: '.env', reason: 'Path looks sensitive' }],
    })

    expect(message).toContain('rejected the previous edit proposal')
    expect(message).toContain('Add a widget to the admin dashboard')
    expect(message).toContain('/proj/src/app/admin/page.tsx (write)')
    expect(message).toContain('65 lines → 1 line')
    expect(message).toContain('.env: Path looks sensitive')
    expect(message).toContain('read_file')
    expect(message).toContain('expectedContentHash')
    expect(message).toContain('primary `edit` tool')
  })

  it('works with minimal input', () => {
    const message = buildRegenerateProposalMessage({
      paths: [{ path: '/a/b.ts', action: 'write' }],
    })
    expect(message).toContain('/a/b.ts (write)')
    expect(message).not.toContain('Original request')
  })
})
