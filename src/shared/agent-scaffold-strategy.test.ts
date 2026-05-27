import { describe, expect, it } from 'vitest'
import {
  detectScaffoldConflict,
  isCliScaffoldCommand,
  resolveScaffoldStrategy,
  toolSampleHasEditTools,
} from './agent-scaffold-strategy'

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
})

describe('detectScaffoldConflict', () => {
  it('flags hybrid same-round CLI + edits', () => {
    const conflict = detectScaffoldConflict(
      'cli_scaffold',
      [
        {
          function: {
            name: 'run_command',
            arguments: JSON.stringify({ command: 'npm create vite@latest .' }),
          },
        },
        {
          function: {
            name: 'propose_file_edits',
            arguments: '{}',
          },
        },
      ],
      { scaffoldCliSucceededThisTurn: false },
    )
    expect(conflict).toBe('hybrid_same_round')
  })

  it('flags edits before CLI when strategy is cli_scaffold', () => {
    expect(
      detectScaffoldConflict(
        'cli_scaffold',
        [{ function: { name: 'propose_file_edits', arguments: '{}' } }],
        { scaffoldCliSucceededThisTurn: false },
      ),
    ).toBe('edits_before_cli')
  })

  it('allows edits after CLI success in cli_then_customize', () => {
    expect(
      detectScaffoldConflict(
        'cli_then_customize',
        [{ function: { name: 'propose_file_edits', arguments: '{}' } }],
        { scaffoldCliSucceededThisTurn: true },
      ),
    ).toBeNull()
  })

  it('flags npm create on static file_bootstrap strategy', () => {
    expect(
      detectScaffoldConflict(
        'file_bootstrap',
        [
          {
            function: {
              name: 'run_command',
              arguments: JSON.stringify({ command: 'npm create vite@latest .' }),
            },
          },
        ],
        { scaffoldCliSucceededThisTurn: false },
      ),
    ).toBe('cli_on_static')
  })
})

describe('isCliScaffoldCommand', () => {
  it('detects npm create/init', () => {
    expect(isCliScaffoldCommand('npm create vite@latest .')).toBe(true)
    expect(isCliScaffoldCommand('npm run typecheck')).toBe(false)
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
