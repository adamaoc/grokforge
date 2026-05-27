import { describe, expect, it } from 'vitest'
import {
  GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER,
  planNeedsVerificationCommand,
  resolveVerificationHint,
  suggestVerificationCommands,
  verificationHasCommandLikeToken,
} from './agent-plan-verification'

const staticPlan = {
  filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
  steps: [{ title: 'Create index.html, styles.css, script.js' }],
  verification: 'Open in browser and test the todo app',
}

const staticPlanWithServe = {
  ...staticPlan,
  verification: 'Run npx --yes serve . -l 3000, then open http://localhost:3000 in browser',
}

const vitePlan = {
  filesLikelyTouched: ['package.json', 'src/App.tsx'],
  steps: [{ title: 'npm install dependencies' }],
  verification: 'npm run typecheck',
}

describe('agent-plan-verification', () => {
  it('exports stable marker', () => {
    expect(GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER).toContain('132')
  })

  it('detects command-like tokens', () => {
    expect(verificationHasCommandLikeToken('npm run typecheck')).toBe(true)
    expect(verificationHasCommandLikeToken('npx --yes serve . -l 3000')).toBe(true)
    expect(verificationHasCommandLikeToken('python3 -m http.server 3000')).toBe(true)
    expect(verificationHasCommandLikeToken('Open in browser and test')).toBe(false)
  })

  it('flags static plan with browser-only verification', () => {
    expect(planNeedsVerificationCommand(staticPlan, 'file_bootstrap')).toBe(true)
  })

  it('does not flag static plan when verification includes serve command', () => {
    expect(planNeedsVerificationCommand(staticPlanWithServe, 'file_bootstrap')).toBe(false)
  })

  it('flags npm plan when verification lacks commands but steps imply install', () => {
    expect(
      planNeedsVerificationCommand(
        {
          filesLikelyTouched: ['package.json'],
          steps: [{ title: 'npm install dependencies' }],
          verification: 'App works in browser',
        },
        'cli_scaffold',
      ),
    ).toBe(true)
  })

  it('does not flag npm plan with explicit typecheck in verification', () => {
    expect(planNeedsVerificationCommand(vitePlan, 'cli_scaffold')).toBe(false)
  })

  it('suggests serve commands for static file bootstrap', () => {
    const suggestions = suggestVerificationCommands(staticPlan, 'file_bootstrap')
    expect(suggestions.some((s) => s.command.includes('npx'))).toBe(true)
    expect(suggestions.some((s) => s.command.includes('http.server'))).toBe(true)
  })

  it('suggests npm commands for vite plan', () => {
    const suggestions = suggestVerificationCommands(vitePlan, 'cli_scaffold')
    expect(suggestions.some((s) => s.command.includes('npm'))).toBe(true)
  })

  it('resolves hint from suggestions when verification is vague', () => {
    const suggestions = suggestVerificationCommands(staticPlan, 'file_bootstrap')
    expect(resolveVerificationHint(staticPlan, suggestions)).toMatch(/npx|serve/)
  })

  it('prefers explicit verification text when command-like', () => {
    expect(resolveVerificationHint(staticPlanWithServe, [])).toContain('npx')
  })
})
