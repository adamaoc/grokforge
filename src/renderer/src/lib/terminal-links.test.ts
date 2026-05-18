import { describe, expect, it } from 'vitest'
import { findTerminalFileLinks } from './terminal-links'

const root = '/Users/adamm/project'
const roots = [{ path: root }]

describe('findTerminalFileLinks', () => {
  it('finds root-scoped absolute path line links', () => {
    const links = findTerminalFileLinks('/Users/adamm/project/src/App.tsx:42:7 failed', {
      cwd: root,
      roots,
    })

    expect(links).toEqual([
      {
        text: '/Users/adamm/project/src/App.tsx:42:7',
        path: '/Users/adamm/project/src/App.tsx',
        line: 42,
        startIndex: 0,
        endIndex: 37,
      },
    ])
  })

  it('resolves relative path line links against cwd', () => {
    const links = findTerminalFileLinks('see src/components/Card.tsx:12)', {
      cwd: root,
      roots,
    })

    expect(links[0]?.path).toBe('/Users/adamm/project/src/components/Card.tsx')
    expect(links[0]?.line).toBe(12)
    expect(links[0]?.text).toBe('src/components/Card.tsx:12')
  })

  it('ignores outside-root paths and URLs', () => {
    const links = findTerminalFileLinks('http://example.com/a.ts:12 /tmp/outside.ts:3', {
      cwd: root,
      roots,
    })

    expect(links).toEqual([])
  })
})
