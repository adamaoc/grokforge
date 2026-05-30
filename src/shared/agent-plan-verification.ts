/**
 * Greenfield plan verification command suggestions (story 132).
 */

import { impliesCommandExecution } from './agent-command-intent'
import type { ScaffoldStrategy } from './agent-scaffold-strategy'
import {
  planImpliesNpmScaffold,
  planImpliesStaticFileBootstrap,
  type GreenfieldScaffoldPlanHint,
} from './workspace-greenfield'

/** Stable marker for planner appendix + eval fixtures. */
export const GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER =
  'Harness: greenfield plan verify commands 132'

const COMMAND_LIKE_TOKEN_RE =
  /\b(npm\s+(install|ci|run|create|init|test|build|typecheck|lint|check|dev)|pnpm\s+(install|run|create)|yarn\s+(install|run|create)|bun\s+(install|run|create)|npx\s+|python3?\s+-m\s+http\.server|git\s+(init|clone)|vitest|jest|pytest|cargo\s+(test|build)|go\s+(test|build))\b/i

const SERVE_COMMAND_RE =
  /\b(npx\s+.*serve|python3?\s+-m\s+http\.server|npm\s+run\s+dev)\b/i

const BROWSER_ONLY_VERIFY_RE =
  /\b(open\s+(in\s+)?(the\s+)?browser|manual(ly)?\s+(test|check|verify)|browser\s+test|ui\s+check)\b/i

export type VerificationCommandSuggestion = {
  readonly command: string
  readonly purpose: string
}

export const STATIC_SERVE_COMMANDS: readonly VerificationCommandSuggestion[] = [
  {
    command: 'npx --yes serve . -l 3000',
    purpose: 'Serve static files locally for browser verification',
  },
  {
    command: 'python3 -m http.server 3000',
    purpose: 'Serve static files locally (substitute python on Windows if needed)',
  },
]

export const NPM_VERIFY_COMMANDS: readonly VerificationCommandSuggestion[] = [
  { command: 'npm install', purpose: 'Install dependencies from package.json' },
  { command: 'npm run dev', purpose: 'Start dev server for UI smoke check' },
  { command: 'npm run typecheck', purpose: 'Verify TypeScript compiles' },
  { command: 'npm run build', purpose: 'Verify production build succeeds' },
]

/** Whether text contains a copy-pasteable shell command token. */
export function verificationHasCommandLikeToken(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return COMMAND_LIKE_TOKEN_RE.test(t) || impliesCommandExecution(t)
}

function isStaticStrategy(
  strategy: ScaffoldStrategy | null | undefined,
  plan: GreenfieldScaffoldPlanHint,
): boolean {
  if (strategy === 'file_bootstrap') return true
  if (strategy === 'cli_scaffold' || strategy === 'cli_then_customize') return false
  return planImpliesStaticFileBootstrap(plan)
}

/** Heuristic: truly simple single-file or tiny vanilla static site (e.g. one index.html + optional css/js).
 * For these, a full dev server is usually unnecessary overhead. */
export function isUltraSimpleSingleFileStaticPlan(plan: GreenfieldScaffoldPlanHint): boolean {
  const files = (plan.filesLikelyTouched ?? []).map((p) => p.replace(/\\/g, '/').toLowerCase())
  if (files.length === 0) return false
  const hasPackage = files.some((f) => f.endsWith('package.json'))
  if (hasPackage) return false
  const staticFiles = files.filter((f) => /\.(html|css|js)$/.test(f))
  // Only 1-3 static web files, at least one html, no other complexity signals
  return staticFiles.length <= 3 && staticFiles.some((f) => f.endsWith('.html')) && staticFiles.length === files.length
}

/** Plan verification is browser-only manual check with no CLI command tokens (132). */
export function isBrowserOnlyStaticVerification(plan: GreenfieldScaffoldPlanHint): boolean {
  const verification = (plan.verification ?? '').trim()
  if (!verification) return false
  return BROWSER_ONLY_VERIFY_RE.test(verification) && !verificationHasCommandLikeToken(verification)
}

export type ShouldInjectPlanVerifyCommandNudgeInput = {
  commandIntent: boolean
  singleFileHtmlIntent?: boolean
  scaffoldStrategy?: ScaffoldStrategy | null
  plan?: GreenfieldScaffoldPlanHint | null
}

/** Whether mid-turn plan-verify nudge should inject (story 165). Suppresses serve pressure on static single-file HTML. */
export function shouldInjectPlanVerifyCommandNudge(
  input: ShouldInjectPlanVerifyCommandNudgeInput,
): boolean {
  if (!input.commandIntent) return false

  if (input.singleFileHtmlIntent === true) return false

  const plan = input.plan ?? null
  if (plan && isUltraSimpleSingleFileStaticPlan(plan)) return false

  return true
}

function isNpmStrategy(
  strategy: ScaffoldStrategy | null | undefined,
  plan: GreenfieldScaffoldPlanHint,
): boolean {
  if (strategy === 'cli_scaffold' || strategy === 'cli_then_customize') return true
  if (strategy === 'file_bootstrap') return false
  return planImpliesNpmScaffold(plan)
}

function planTextParts(plan: GreenfieldScaffoldPlanHint): string {
  return [
    plan.verification ?? '',
    ...(plan.steps ?? []).map((s) => s.title ?? ''),
    ...(plan.filesLikelyTouched ?? []),
  ].join('\n')
}

/**
 * Whether execute should steer toward `run_command` because verification lacks runnable commands.
 * Does not return true when verification already names serve/npm commands (126 handles those via impliesCommandExecution).
 */
export function planNeedsVerificationCommand(
  plan: GreenfieldScaffoldPlanHint,
  strategy?: ScaffoldStrategy | null,
): boolean {
  const verification = (plan.verification ?? '').trim()

  if (isStaticStrategy(strategy ?? null, plan)) {
    // For ultra-simple static (single/tiny vanilla HTML/JS), browser-only or "files correct" is sufficient — do not force a serve command.
    if (isUltraSimpleSingleFileStaticPlan(plan)) {
      return false
    }
    if (!verification) return true
    if (verificationHasCommandLikeToken(verification)) return false
    if (BROWSER_ONLY_VERIFY_RE.test(verification)) return true
    return !verificationHasCommandLikeToken(planTextParts(plan))
  }

  if (isNpmStrategy(strategy ?? null, plan)) {
    if (verification && !verificationHasCommandLikeToken(verification)) return true
    const stepsHaveCmd = (plan.steps ?? []).some((s) =>
      impliesCommandExecution(s.title ?? ''),
    )
    if (stepsHaveCmd && !verificationHasCommandLikeToken(verification)) return true
  }

  return false
}

/** Suggest verification commands from plan shape and content. */
export function suggestVerificationCommands(
  plan: GreenfieldScaffoldPlanHint,
  strategy?: ScaffoldStrategy | null,
): readonly VerificationCommandSuggestion[] {
  const text = planTextParts(plan)

  if (isStaticStrategy(strategy ?? null, plan)) {
    // Ultra-simple static sites do not need (and should not be nudged toward) a dev server by default.
    // Return empty so the nudge / executor prefers "files are complete + open locally".
    if (isUltraSimpleSingleFileStaticPlan(plan)) {
      return []
    }
    return [...STATIC_SERVE_COMMANDS]
  }

  if (isNpmStrategy(strategy ?? null, plan)) {
    const out: VerificationCommandSuggestion[] = []
    if (/\bnpm\s+install\b/i.test(text) || /package\.json/i.test(text)) {
      out.push(NPM_VERIFY_COMMANDS[0]!)
    }
    if (/\bnpm\s+run\s+dev\b/i.test(text) || /\bdev\s+server\b/i.test(text)) {
      out.push(NPM_VERIFY_COMMANDS[1]!)
    }
    if (/\btypecheck\b/i.test(text)) {
      out.push(NPM_VERIFY_COMMANDS[2]!)
    }
    if (/\bbuild\b/i.test(text)) {
      out.push(NPM_VERIFY_COMMANDS[3]!)
    }
    if (out.length === 0) {
      return NPM_VERIFY_COMMANDS.slice(0, 3)
    }
    return out
  }

  return []
}

/** Best hint string for plan-verify nudge from plan + suggestions. */
export function resolveVerificationHint(
  plan: GreenfieldScaffoldPlanHint,
  suggestions: readonly VerificationCommandSuggestion[],
): string | undefined {
  const verification = (plan.verification ?? '').trim()
  if (verification && (verificationHasCommandLikeToken(verification) || SERVE_COMMAND_RE.test(verification))) {
    return verification
  }
  // For ultra-simple static, prefer no command hint (lets executor / UI use lighter verification).
  if (isStaticStrategy(undefined, plan) && isUltraSimpleSingleFileStaticPlan(plan)) {
    return verification || undefined
  }
  if (suggestions[0]) {
    return suggestions[0].command
  }
  return verification || undefined
}
