import { describe, expect, it } from 'vitest'
import {
  ITERATIVE_EDIT_SCOPE_MARKER,
  buildIterativeEditScopeSections,
  resolveIterativeEditScope,
} from '../../../harness-support/routing/iterative-edit-scope'

describe('resolveIterativeEditScope', () => {
  it('localStorage persistence → single_file with edit default on script.js', () => {
    const scope = resolveIterativeEditScope({
      userText: 'add localStorage persistence for todos',
    })
    expect(scope.kind).toBe('single_file')
    expect(scope.preferFullFileProposal).toBe(false)
    expect(scope.likelyPaths).toContain('script.js')
    expect(scope.rationale).toMatch(/persistence|edit/i)
  })

  it('remove button / behavior change → single_file with edit default', () => {
    const scope = resolveIterativeEditScope({
      userText: 'add a remove button for each todo',
      activeFilePath: '/proj/script.js',
      activeFileLineCount: 55,
    })
    expect(scope.kind).toBe('single_file')
    expect(scope.preferFullFileProposal).toBe(false)
    expect(scope.likelyPaths).toContain('script.js')
    expect(scope.rationale).toMatch(/behavior|logic|edit/i)
  })

  it('fix typo → single_file without full-file preference', () => {
    const scope = resolveIterativeEditScope({
      userText: 'fix typo in the header text',
    })
    expect(scope.kind).toBe('single_file')
    expect(scope.preferFullFileProposal).toBe(false)
    expect(scope.rationale).toMatch(/localized|typo/i)
  })

  it('refactor across app → broad', () => {
    const scope = resolveIterativeEditScope({
      userText: 'refactor error handling across the app in src/App.tsx and utils.ts',
    })
    expect(scope.kind).toBe('broad')
    expect(scope.preferFullFileProposal).toBe(false)
  })

  it('many path hints → broad', () => {
    const scope = resolveIterativeEditScope({
      userText: 'update index.html, styles.css, script.js, and app.js',
    })
    expect(scope.kind).toBe('broad')
  })

  it('short message + active file → single_file with edit default', () => {
    const scope = resolveIterativeEditScope({
      userText: 'add dark mode',
      activeFilePath: '/proj/script.js',
      activeFileLineCount: 80,
    })
    expect(scope.kind).toBe('single_file')
    expect(scope.preferFullFileProposal).toBe(false)
    expect(scope.likelyPaths).toContain('script.js')
  })

  it('short message + large active file → edit default', () => {
    const scope = resolveIterativeEditScope({
      userText: 'add dark mode',
      activeFilePath: '/proj/script.js',
      activeFileLineCount: 250,
    })
    expect(scope.kind).toBe('single_file')
    expect(scope.preferFullFileProposal).toBe(false)
  })

  it('default incremental edit → few_files', () => {
    const scope = resolveIterativeEditScope({
      userText: 'update the todo list component to show due dates',
    })
    expect(scope.kind).toBe('few_files')
    expect(scope.preferFullFileProposal).toBe(false)
  })
})

describe('buildIterativeEditScopeSections', () => {
  it('includes marker and script.js hint for localStorage scope', () => {
    const scope = resolveIterativeEditScope({
      userText: 'add localStorage for todos',
    })
    const sections = buildIterativeEditScopeSections(scope)
    expect(sections.join('\n')).toContain(ITERATIVE_EDIT_SCOPE_MARKER)
    expect(sections.join('\n')).toContain('script.js')
    expect(sections.join('\n')).toMatch(/Resolved scope.*single-file/i)
  })
})
