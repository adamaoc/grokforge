import { describe, expect, it } from 'vitest'
import {
  detectScaffoldConflict,
  effectiveScaffoldStrategyForConflict,
  isCliScaffoldCommand,
  resolveScaffoldStrategy,
  toolSampleHasEditTools,
} from '../harness-support/routing/scaffold-strategy'

describe('resolveScaffoldStrategy', () => {
  it('returns null for populated non-greenfield context', () => {
    expect(
      resolveScaffoldStrategy({
        greenfieldWorkspace: false,
        executeFromApprovedPlan: true,
        plan: { filesLikelyTouched: ['package.json'] },
      }),
    ).toBeNull()
  })

  it('returns null for post-plan incremental Work follow-up', () => {
    expect(
      resolveScaffoldStrategy({
        greenfieldWorkspace: true,
        postPlanIncremental: true,
        plan: { filesLikelyTouched: ['package.json'] },
      }),
    ).toBeNull()
  })

  it('selects cli_scaffold for Vite/npm create plans', () => {
    expect(
      resolveScaffoldStrategy({
        greenfieldWorkspace: true,
        executeFromApprovedPlan: true,
        plan: {
          filesLikelyTouched: ['package.json', 'vite.config.ts'],
          steps: [{ title: 'npm create vite' }],
          verification: 'npm install',
        },
      }),
    ).toBe('cli_scaffold')
  })

  it('selects file_bootstrap for static HTML plans', () => {
    expect(
      resolveScaffoldStrategy({
        greenfieldWorkspace: true,
        executeFromApprovedPlan: true,
        plan: {
          filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
          steps: [{ title: 'Create static todo page' }],
        },
      }),
    ).toBe('file_bootstrap')
  })

  it('selects cli_then_customize when plan lists CLI + src customization', () => {
    expect(
      resolveScaffoldStrategy({
        greenfieldWorkspace: true,
        executeFromApprovedPlan: true,
        plan: {
          filesLikelyTouched: ['package.json', 'src/App.tsx'],
          steps: [{ title: 'npm create vite' }, { title: 'Customize App.tsx' }],
          verification: 'npm run typecheck',
        },
      }),
    ).toBe('cli_then_customize')
  })

  it('selects file_bootstrap from user text on Work-direct greenfield (161)', () => {
    expect(
      resolveScaffoldStrategy({
        greenfieldWorkspace: true,
        executeFromApprovedPlan: false,
        userText: 'keep this as a single html file with inline script',
      }),
    ).toBe('file_bootstrap')
    expect(
      resolveScaffoldStrategy({
        greenfieldWorkspace: true,
        executeFromApprovedPlan: false,
        userText: 'Create a design prototype for a taskboard as one html file',
      }),
    ).toBe('file_bootstrap')
  })

  it('still selects cli_scaffold for npm create user text without static heuristics', () => {
    expect(
      resolveScaffoldStrategy({
        greenfieldWorkspace: true,
        executeFromApprovedPlan: false,
        userText: 'npm create vite@latest . -- --template react-ts',
      }),
    ).toBe('cli_scaffold')
  })
})

describe('effectiveScaffoldStrategyForConflict', () => {
  const staticPlan = {
    filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
    steps: [{ title: 'Create static todo page' }],
  }

  const vitePlan = {
    filesLikelyTouched: ['package.json', 'vite.config.ts'],
    steps: [{ title: 'npm create vite' }],
    verification: 'npm install',
  }

  it('collapses ambiguous to file_bootstrap for static-only plans', () => {
    expect(effectiveScaffoldStrategyForConflict('ambiguous', staticPlan)).toBe('file_bootstrap')
  })

  it('collapses ambiguous to cli_scaffold for npm-only plans', () => {
    expect(effectiveScaffoldStrategyForConflict('ambiguous', vitePlan)).toBe('cli_scaffold')
  })

  it('leaves ambiguous when plan does not clearly imply cli or static only', () => {
    expect(
      effectiveScaffoldStrategyForConflict('ambiguous', {
        filesLikelyTouched: ['README.md'],
        steps: [{ title: 'Set up project structure' }],
      }),
    ).toBe('ambiguous')
  })
})

describe('detectScaffoldConflict', () => {
  const editCall = { function: { name: 'propose_file_edits', arguments: '{}' } }

  const runCommand = (command: string) => ({
    function: {
      name: 'run_command',
      arguments: JSON.stringify({ command }),
    },
  })

  it('flags hybrid same-round CLI scaffold + edits', () => {
    const conflict = detectScaffoldConflict(
      'cli_scaffold',
      [runCommand('npm create vite@latest .'), editCall],
      { scaffoldCliSucceededThisTurn: false },
    )
    expect(conflict).toBe('hybrid_same_round')
  })

  it('flags edits before CLI when strategy is cli_scaffold', () => {
    expect(
      detectScaffoldConflict('cli_scaffold', [editCall], {
        scaffoldCliSucceededThisTurn: false,
      }),
    ).toBe('edits_before_cli')
  })

  it('allows edits after CLI success in cli_then_customize', () => {
    expect(
      detectScaffoldConflict('cli_then_customize', [editCall], {
        scaffoldCliSucceededThisTurn: true,
      }),
    ).toBeNull()
  })

  it('flags npm create on static file_bootstrap strategy', () => {
    expect(
      detectScaffoldConflict('file_bootstrap', [runCommand('npm create vite@latest .')], {
        scaffoldCliSucceededThisTurn: false,
      }),
    ).toBe('cli_on_static')
  })

  it('returns null for file_bootstrap with edits only', () => {
    expect(
      detectScaffoldConflict('file_bootstrap', [editCall], {
        scaffoldCliSucceededThisTurn: false,
      }),
    ).toBeNull()
  })

  it('returns null for file_bootstrap with verify/serve command + edits (131)', () => {
    for (const command of ['npx serve', 'python -m http.server', 'npm run typecheck']) {
      expect(
        detectScaffoldConflict('file_bootstrap', [runCommand(command), editCall], {
          scaffoldCliSucceededThisTurn: false,
        }),
        command,
      ).toBeNull()
    }
  })

  it('flags hybrid when file_bootstrap samples npm create + edits', () => {
    expect(
      detectScaffoldConflict(
        'file_bootstrap',
        [runCommand('npm create vite@latest .'), editCall],
        { scaffoldCliSucceededThisTurn: false },
      ),
    ).toBe('hybrid_same_round')
  })

  it('returns null for ambiguous + static-only plan + edits only (131)', () => {
    expect(
      detectScaffoldConflict(
        'ambiguous',
        [editCall],
        {
          scaffoldCliSucceededThisTurn: false,
          plan: {
            filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
            steps: [{ title: 'Create static todo page' }],
          },
        },
      ),
    ).toBeNull()
  })

  it('flags edits_before_cli for ambiguous + Vite plan + edits only', () => {
    expect(
      detectScaffoldConflict(
        'ambiguous',
        [editCall],
        {
          scaffoldCliSucceededThisTurn: false,
          plan: {
            filesLikelyTouched: ['package.json', 'index.html'],
            steps: [{ title: 'npm create vite' }],
            verification: 'npm install',
          },
        },
      ),
    ).toBe('edits_before_cli')
  })
})

describe('isCliScaffoldCommand', () => {
  it('detects npm create/init', () => {
    expect(isCliScaffoldCommand('npm create vite@latest .')).toBe(true)
    expect(isCliScaffoldCommand('npm run typecheck')).toBe(false)
    expect(isCliScaffoldCommand('npx serve')).toBe(false)
    expect(isCliScaffoldCommand('python -m http.server')).toBe(false)
  })
})

describe('toolSampleHasEditTools', () => {
  it('detects propose_file_edits and search_replace', () => {
    expect(
      toolSampleHasEditTools([{ function: { name: 'propose_file_edits' } }]),
    ).toBe(true)
    expect(toolSampleHasEditTools([{ function: { name: 'read_file' } }])).toBe(false)
  })
})
