import { describe, expect, it } from 'vitest'
import {
  applySearchReplace,
  buildSearchReplaceNotFoundMessage,
  countSearchReplaceMatches,
  looksLikeReadFileNumberedContent,
  stripReadFileLineNumberPrefixes,
} from '../../../harness/diff/search-replace'

describe('applySearchReplace', () => {
  it('replaces when old_string occurs exactly once', () => {
    const result = applySearchReplace('alpha beta gamma', 'beta', 'BETA')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.content).toBe('alpha BETA gamma')
  })

  it('errors when old_string is missing', () => {
    const result = applySearchReplace('hello', 'missing', 'x')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.matchCount).toBe(0)
    expect(result.error).toContain('rawContent')
  })

  it('buildSearchReplaceNotFoundMessage includes rawContent hint and preview', () => {
    const msg = buildSearchReplaceNotFoundMessage('function broken() {')
    expect(msg).toContain('rawContent')
    expect(msg).toContain('function broken')
  })

  it('buildSearchReplaceNotFoundMessage includes match stats and closest line (139)', () => {
    const file = `function init() {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('ready');
  });
}
`
    const msg = buildSearchReplaceNotFoundMessage('function deleteTodo() {', file)
    expect(msg).toContain('0 exact matches')
    expect(msg).toMatch(/Closest line in file/i)
  })

  it('errors when old_string matches multiple times', () => {
    const result = applySearchReplace('foo foo', 'foo', 'bar')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.matchCount).toBe(2)
  })

  it('counts non-overlapping matches', () => {
    expect(countSearchReplaceMatches('aaa', 'aa')).toBe(1)
    expect(countSearchReplaceMatches('abab', 'ab')).toBe(2)
  })

  it('detects read_file numbered content and strips prefixes', () => {
    const numbered = '     1 | ## Tech Stack\n     2 | - Frontend: React'
    expect(looksLikeReadFileNumberedContent(numbered)).toBe(true)
    expect(stripReadFileLineNumberPrefixes(numbered)).toBe('## Tech Stack\n- Frontend: React')
  })

  it('hints when old_string merges separate markdown bullet lines', () => {
    const file =
      '## Tech Stack (planned) \n\n- Frontend: Likely React or similar for interactive UI \n- Backend: To be determined  \n'
    const merged =
      '- Frontend: Likely React or similar for interactive UI - Backend: To be determined'
    const msg = buildSearchReplaceNotFoundMessage(merged, file)
    expect(msg).toContain('one bullet line at a time')
  })

  it('applies search_replace when old_string uses read_file line numbers', () => {
    const file = '## Tech Stack (planned)\n- Frontend: Likely React\n'
    const numberedOld = '     1 | ## Tech Stack (planned)\n     2 | - Frontend: Likely React\n'
    const result = applySearchReplace(
      file,
      numberedOld,
      '## Tech Stack (planned)\n- Frontend: React + TypeScript\n',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.content).toContain('React + TypeScript')
  })

  it('applies search_replace when old_string uses literal \\n instead of newlines', () => {
    const file =
      '## Tech Stack (planned) \n\n- Frontend: Likely React or similar for interactive UI \n- Backend: To be determined  \n'
    const literalOld =
      '## Tech Stack (planned) \\n\\n- Frontend: Likely React or similar for interactive UI \\n- Backend: To be determined  '
    const result = applySearchReplace(
      file,
      literalOld,
      '## Tech Stack (planned) \n\n- Frontend: React + TypeScript\n- Backend: Node + TypeScript\n',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.content).toContain('React + TypeScript')
  })

  it('applies search_replace when old_string has extra trailing blank lines', () => {
    const file =
      '## Tech Stack (planned) \n\n- Frontend: Likely React or similar for interactive UI \n- Backend: To be determined  \n\nThe goal is to provide a lightweight app.  \n'
    const oldBlock =
      '## Tech Stack (planned)\n\n- Frontend: Likely React or similar for interactive UI \n- Backend: To be determined \n\n\n'
    const newBlock = '## Tech Stack\n\n- Frontend: React + TypeScript\n- Backend: Node + TypeScript\n\n'
    const result = applySearchReplace(file, oldBlock, newBlock)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.content).toContain('React + TypeScript')
    expect(result.content).toContain('The goal is to provide')
  })

  it('applies search_replace when markdown lines omit trailing spaces from rawContent', () => {
    const file =
      '## Tech Stack (planned) \n\n- Frontend: Likely React or similar for interactive UI \n- Backend: To be determined  \n\nThe goal is to provide a lightweight app.  \n'
    const oldBlock =
      '## Tech Stack (planned)\n\n- Frontend: Likely React or similar for interactive UI\n- Backend: To be determined\n\nThe goal is to provide a lightweight app.'
    const newBlock =
      '## Tech Stack (planned) \n\n- Frontend: React + TypeScript\n- Backend: Node + TypeScript\n- Served with Vite\n\nThe goal is to provide a lightweight app.  '
    const result = applySearchReplace(file, oldBlock, newBlock)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.content).toContain('Served with Vite')
    expect(result.content).toContain('The goal is to provide')
  })
})
