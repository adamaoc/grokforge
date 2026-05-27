import { describe, expect, it } from 'vitest'
import {
  ITERATIVE_EDIT_SCOPE_MARKER,
  ITERATIVE_EDIT_SCOPE_SHAPE_NUDGE_MARKER,
  buildIterativeEditScopeSections,
  buildIterativeEditScopeShapeNudge,
  pickIterativeScopeShapeNudge,
  resolveIterativeEditScope,
} from './iterative-edit-scope'

describe('resolveIterativeEditScope', () => {
  it('localStorage persistence → single_file with full-file proposal on script.js', () => {
    const scope = resolveIterativeEditScope({
      userText: 'add localStorage persistence for todos',
    })
    expect(scope.kind).toBe('single_file')
    expect(scope.preferFullFileProposal).toBe(true)
    expect(scope.likelyPaths).toContain('script.js')
    expect(scope.rationale).toMatch(/persistence/i)
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

  it('short message + active file → single_file with full-file when small', () => {
    const scope = resolveIterativeEditScope({
      userText: 'add dark mode',
      activeFilePath: '/proj/script.js',
      activeFileLineCount: 80,
    })
    expect(scope.kind).toBe('single_file')
    expect(scope.preferFullFileProposal).toBe(true)
    expect(scope.likelyPaths).toContain('script.js')
  })

  it('short message + large active file → localized OK', () => {
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

describe('pickIterativeScopeShapeNudge', () => {
  const localStorageScope = resolveIterativeEditScope({
    userText: 'add localStorage persistence for todos',
  })

  it('prefer_propose when S&R after read on scoped path', () => {
    const kind = pickIterativeScopeShapeNudge({
      scope: localStorageScope,
      issued: false,
      pathsReadThisTurn: new Set(['/proj/script.js']),
      lastRoundSearchReplaceOnScopedPath: true,
      searchReplaceCountByPath: new Map([['/proj/script.js', 1]]),
      proposeFileEditsAttempted: false,
      editProposalCreated: false,
    })
    expect(kind).toBe('prefer_propose')
  })

  it('too_many_reads when single_file and 2+ paths read', () => {
    const kind = pickIterativeScopeShapeNudge({
      scope: localStorageScope,
      issued: false,
      pathsReadThisTurn: new Set(['/proj/script.js', '/proj/index.html']),
      lastRoundSearchReplaceOnScopedPath: false,
      searchReplaceCountByPath: new Map(),
      proposeFileEditsAttempted: false,
      editProposalCreated: false,
    })
    expect(kind).toBe('too_many_reads')
  })

  it('returns null when already issued', () => {
    expect(
      pickIterativeScopeShapeNudge({
        scope: localStorageScope,
        issued: true,
        pathsReadThisTurn: new Set(['/proj/script.js']),
        lastRoundSearchReplaceOnScopedPath: true,
        proposeFileEditsAttempted: false,
        editProposalCreated: false,
      }),
    ).toBeNull()
  })
})

describe('buildIterativeEditScopeShapeNudge', () => {
  it('includes shape nudge marker', () => {
    const scope = resolveIterativeEditScope({ userText: 'add localStorage for todos' })
    const nudge = buildIterativeEditScopeShapeNudge('prefer_propose', scope)
    expect(nudge).toContain(ITERATIVE_EDIT_SCOPE_SHAPE_NUDGE_MARKER)
    expect(nudge).toMatch(/propose_file_edits/i)
  })
})
