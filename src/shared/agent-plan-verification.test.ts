import { describe, expect, it } from 'vitest'
import {
  GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER,
  isBrowserOnlyStaticVerification,
  isUltraSimpleSingleFileStaticPlan,
  planNeedsVerificationCommand,
  resolveVerificationHint,
  shouldInjectPlanVerifyCommandNudge,
  suggestVerificationCommands,
  verificationHasCommandLikeToken,
} from './agent-plan-verification'

const staticPlan = {
  filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
  steps: [{ title: 'Create index.html, styles.css, script.js' }],
  verification: 'Open in browser and test the todo app',
}

// Ultra-simple single-file static (the common vanilla Todo case) — should NOT force a serve command.
const ultraSimpleStaticPlan = {
  filesLikelyTouched: ['index.html'],
  steps: [{ title: 'Create a single-file static todo app in index.html' }],
  verification: 'Open index.html directly in the browser and verify the UI works',
}

const staticPlanWithServe = {
  ...staticPlan,
  verification: 'Run npx --yes serve . -l 3000, then open http://localhost:3000 in browser',
}

// Larger static site still benefits from (optional) serve suggestion.
const largerStaticPlan = {
  filesLikelyTouched: ['index.html', 'styles.css', 'script.js', 'app.js', 'utils.js'],
  steps: [{ title: 'Create multi-file static site' }],
  verification: 'Open in browser and test',
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

  it('does NOT require verification command for ultra-simple single-file static (browser-only is fine)', () => {
    expect(planNeedsVerificationCommand(ultraSimpleStaticPlan, 'file_bootstrap')).toBe(false)
    expect(suggestVerificationCommands(ultraSimpleStaticPlan, 'file_bootstrap').length).toBe(0)
  })

  it('still flags larger static plans that lack a command-like verification (serve optional but suggested)', () => {
    // The old 3-file case is now treated as ultra-simple; use larger fixture for "still wants command-like"
    expect(planNeedsVerificationCommand(largerStaticPlan, 'file_bootstrap')).toBe(true)
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

  it('suggests serve commands for larger static file bootstrap (but not ultra-simple single-file)', () => {
    const suggestions = suggestVerificationCommands(largerStaticPlan, 'file_bootstrap')
    expect(suggestions.some((s) => s.command.includes('npx'))).toBe(true)
    expect(suggestions.some((s) => s.command.includes('http.server'))).toBe(true)

    // Ultra-simple should get zero suggestions (prefer direct open)
    expect(suggestVerificationCommands(ultraSimpleStaticPlan, 'file_bootstrap').length).toBe(0)
  })

  it('suggests npm commands for vite plan', () => {
    const suggestions = suggestVerificationCommands(vitePlan, 'cli_scaffold')
    expect(suggestions.some((s) => s.command.includes('npm'))).toBe(true)
  })

  it('resolves hint from suggestions for larger static; empty/unchanged for ultra-simple', () => {
    const suggestions = suggestVerificationCommands(largerStaticPlan, 'file_bootstrap')
    expect(resolveVerificationHint(largerStaticPlan, suggestions)).toMatch(/npx|serve/)

    // For ultra-simple, no forced serve hint
    const simpleSuggestions = suggestVerificationCommands(ultraSimpleStaticPlan, 'file_bootstrap')
    expect(resolveVerificationHint(ultraSimpleStaticPlan, simpleSuggestions)).toBe(ultraSimpleStaticPlan.verification)
  })

  it('prefers explicit verification text when command-like', () => {
    expect(resolveVerificationHint(staticPlanWithServe, [])).toContain('npx')
  })

  it('isUltraSimpleSingleFileStaticPlan detects single/tiny static plans', () => {
    expect(isUltraSimpleSingleFileStaticPlan(ultraSimpleStaticPlan)).toBe(true)
    expect(isUltraSimpleSingleFileStaticPlan(staticPlan)).toBe(true)
    expect(isUltraSimpleSingleFileStaticPlan(largerStaticPlan)).toBe(false)
    expect(isUltraSimpleSingleFileStaticPlan(vitePlan)).toBe(false)
  })

  it('isBrowserOnlyStaticVerification detects browser-only verification strings', () => {
    expect(isBrowserOnlyStaticVerification(staticPlan)).toBe(true)
    expect(isBrowserOnlyStaticVerification(ultraSimpleStaticPlan)).toBe(false)
    expect(isBrowserOnlyStaticVerification(staticPlanWithServe)).toBe(false)
    expect(isBrowserOnlyStaticVerification(vitePlan)).toBe(false)
  })

  describe('shouldInjectPlanVerifyCommandNudge', () => {
    it('returns false without command intent', () => {
      expect(
        shouldInjectPlanVerifyCommandNudge({
          commandIntent: false,
          singleFileHtmlIntent: true,
        }),
      ).toBe(false)
    })

    it('returns false for single-file HTML intent (165)', () => {
      expect(
        shouldInjectPlanVerifyCommandNudge({
          commandIntent: true,
          singleFileHtmlIntent: true,
        }),
      ).toBe(false)
    })

    it('returns false for ultra-simple static plan with browser-only verification', () => {
      expect(
        shouldInjectPlanVerifyCommandNudge({
          commandIntent: true,
          scaffoldStrategy: 'file_bootstrap',
          plan: ultraSimpleStaticPlan,
        }),
      ).toBe(false)
    })

    it('returns true for larger static plan with browser-only verification (132 regression)', () => {
      expect(
        shouldInjectPlanVerifyCommandNudge({
          commandIntent: true,
          scaffoldStrategy: 'file_bootstrap',
          plan: largerStaticPlan,
        }),
      ).toBe(true)
    })

    it('returns true for npm/vite plan with typecheck verification (126 regression)', () => {
      expect(
        shouldInjectPlanVerifyCommandNudge({
          commandIntent: true,
          scaffoldStrategy: 'cli_scaffold',
          plan: vitePlan,
        }),
      ).toBe(true)
    })
  })
})
