/**
 * Scaffold command construction + post-CLI verification (greenfield follow-up).
 */

import { isCliScaffoldCommand } from '../../routing/scaffold-strategy'
import type { GreenfieldScaffoldPlanHint } from '../../context/workspace-greenfield'

export const SCAFFOLD_COMMAND_GUIDANCE_MARKER = 'Harness: scaffold command guidance'
export const POST_SCAFFOLD_VERIFICATION_MARKER = 'Harness: post-scaffold verification'
export const POST_SCAFFOLD_VERIFICATION_HONESTY_MARKER = 'Harness: post-scaffold verification honesty'

export const VITE_KNOWN_TEMPLATES = [
  'react-ts',
  'react',
  'vue-ts',
  'vue',
  'vanilla-ts',
  'vanilla',
  'svelte-ts',
  'svelte',
] as const

export type ViteTemplateId = (typeof VITE_KNOWN_TEMPLATES)[number]

const VITE_CREATE_RE = /\b(create-vite|create\s+vite)\b/i
const TEMPLATE_FLAG_RE = /--template(?:=|\s+)([\w-]+)/i
const NPM_CREATE_VITE_RE = /\bnpm\s+create\s+vite/i
const NPX_CREATE_VITE_RE = /\bnpx\s+(?:-y\s+)?create-vite/i

const REACT_TS_RE = /\breact[\s-]*(?:\+|and\s+)?\s*typescript\b|\breact-ts\b|\breact\s+ts\b/i
const REACT_RE = /\breact\b(?!.*typescript)/i
const VANILLA_TS_RE = /\bvanilla[\s-]*ts\b|\bvanilla\s+typescript\b/i
const VUE_TS_RE = /\bvue[\s-]*(?:\+|and\s+)?\s*typescript\b|\bvue-ts\b/i

/** Infer intended Vite template from plan steps, summary, or user text. */
export function inferViteTemplateFromText(text: string): ViteTemplateId | null {
  const t = text.trim()
  if (!t) return null
  if (REACT_TS_RE.test(t) || /\btypescript\b.*\breact\b/i.test(t)) return 'react-ts'
  if (VUE_TS_RE.test(t)) return 'vue-ts'
  if (VANILLA_TS_RE.test(t)) return 'vanilla-ts'
  if (/\bsvelte-ts\b/i.test(t)) return 'svelte-ts'
  if (/\bsvelte\b/i.test(t)) return 'svelte'
  if (/\bvue\b/i.test(t)) return 'vue'
  if (REACT_RE.test(t)) return 'react'
  if (/\bvanilla\b/i.test(t)) return 'vanilla'
  return null
}

export function inferViteTemplateFromPlan(plan: GreenfieldScaffoldPlanHint | null | undefined): ViteTemplateId | null {
  if (!plan) return null
  const parts = [
    plan.verification ?? '',
    ...(plan.filesLikelyTouched ?? []),
    ...(plan.steps ?? []).map((s) => s.title ?? ''),
  ].join('\n')
  return inferViteTemplateFromText(parts)
}

/** Canonical non-interactive npm create vite command (preferred — passes args after `--`). */
export function buildNpmCreateViteCommand(cwd: string, template: ViteTemplateId): string {
  const target = cwd.trim() || '.'
  return `npm create vite@latest ${target} -- --template ${template}`
}

/** Canonical non-interactive npx create-vite command. */
export function buildNpxCreateViteCommand(cwd: string, template: ViteTemplateId): string {
  const target = cwd.trim() || '.'
  return `npx -y create-vite@latest ${target} --template ${template}`
}

export function extractViteTemplateFromCommand(command: string): ViteTemplateId | null {
  const m = command.match(TEMPLATE_FLAG_RE)
  if (!m?.[1]) return null
  const id = m[1].toLowerCase()
  return (VITE_KNOWN_TEMPLATES as readonly string[]).includes(id) ? (id as ViteTemplateId) : null
}

export function isViteScaffoldCommand(command: string): boolean {
  return VITE_CREATE_RE.test(command.trim())
}

export type ScaffoldCommandAssessment = {
  ok: boolean
  reason?: string
  suggestedCommand?: string
  expectedTemplate?: ViteTemplateId | null
  actualTemplate?: ViteTemplateId | null
}

/** Validate scaffold commands before approval — catches missing template flags in non-interactive mode. */
export function assessScaffoldCommand(input: {
  command: string
  expectedTemplate?: ViteTemplateId | null
}): ScaffoldCommandAssessment {
  const command = input.command.trim()
  if (!isCliScaffoldCommand(command)) return { ok: true }

  if (!isViteScaffoldCommand(command)) return { ok: true }

  const actualTemplate = extractViteTemplateFromCommand(command)
  const expectedTemplate = input.expectedTemplate ?? null

  if (!actualTemplate) {
    const template = expectedTemplate ?? 'react-ts'
    const suggested = NPM_CREATE_VITE_RE.test(command)
      ? buildNpmCreateViteCommand(extractViteScaffoldTarget(command), template)
      : buildNpxCreateViteCommand(extractViteScaffoldTarget(command), template)
    return {
      ok: false,
      reason:
        'Vite scaffold commands must include `--template <name>` in non-interactive mode (e.g. `--template react-ts`). Without it, create-vite prompts interactively and the harness command may appear to succeed with the wrong template.',
      suggestedCommand: suggested,
      expectedTemplate: template,
    }
  }

  if (expectedTemplate && actualTemplate !== expectedTemplate) {
    return {
      ok: false,
      reason: `Scaffold command uses template **${actualTemplate}** but the approved plan implies **${expectedTemplate}**.`,
      suggestedCommand: buildNpmCreateViteCommand(extractViteScaffoldTarget(command), expectedTemplate),
      expectedTemplate,
      actualTemplate,
    }
  }

  if (NPM_CREATE_VITE_RE.test(command) && !/\s--\s/.test(command)) {
    return {
      ok: false,
      reason:
        'For `npm create vite`, pass create-vite flags after a `--` separator (e.g. `npm create vite@latest . -- --template react-ts`).',
      suggestedCommand: buildNpmCreateViteCommand(extractViteScaffoldTarget(command), actualTemplate),
      expectedTemplate: actualTemplate,
      actualTemplate,
    }
  }

  if (NPX_CREATE_VITE_RE.test(command) && !/\s-y\s/.test(command) && !/\s--yes\b/.test(command)) {
    return {
      ok: false,
      reason:
        'For non-interactive `npx create-vite`, include `-y` / `--yes` and `--template <name>` (e.g. `npx -y create-vite@latest . --template react-ts`).',
      suggestedCommand: buildNpxCreateViteCommand(extractViteScaffoldTarget(command), actualTemplate),
      expectedTemplate: actualTemplate,
      actualTemplate,
    }
  }

  return { ok: true, expectedTemplate, actualTemplate }
}

/** Relative target directory for create-vite / npm create vite (`.` when scaffolding into cwd). */
export function extractViteScaffoldTarget(command: string): string {
  const npm = command.match(/\bnpm\s+create\s+vite@?(?:latest)?\s+(\S+)/i)
  if (npm?.[1] && npm[1] !== '--') return npm[1]
  const npx = command.match(/\bnpx\s+(?:-y\s+)?create-vite@?(?:latest)?\s+(\S+)/i)
  if (npx?.[1] && npx[1] !== '--template') return npx[1]
  return '.'
}

export function scaffoldCommandHasOverwrite(command: string): boolean {
  return /\b--overwrite\b/.test(command.trim())
}

/** User-facing warning when the scaffold target directory already has entries on disk. */
export function buildNonEmptyScaffoldTargetWarning(input: {
  entryNames: readonly string[]
  targetLabel: string
}): string | null {
  if (input.entryNames.length === 0) return null
  const sample = input.entryNames.slice(0, 4).join(', ')
  const extra = input.entryNames.length > 4 ? ` (+${input.entryNames.length - 4} more)` : ''
  return (
    `Target folder is not empty on disk (${sample}${extra}). ` +
    `Tools like create-vite may exit with code 0 but create no files. ` +
    `Add \`--overwrite\` to the command, scaffold into a new subfolder, or remove leftover files (e.g. .DS_Store) first.`
  )
}

/** Detect scaffold CLIs that exited 0 without writing files (non-interactive cancel). */
export function detectScaffoldOutputFailure(output: string): string | null {
  const text = output.trim()
  if (!text) return null
  if (/Operation cancelled/i.test(text)) {
    return (
      'Scaffold CLI reported "Operation cancelled" — usually the target folder is not empty ' +
      '(hidden files like .DS_Store count). No project files were created.'
    )
  }
  if (/target directory is not empty/i.test(text)) {
    return 'Scaffold CLI refused to run because the target directory is not empty.'
  }
  return null
}

/** Relative paths the agent should read after a successful Vite scaffold. */
export function expectedPostScaffoldReadPaths(template: ViteTemplateId | null): readonly string[] {
  const common = ['package.json', 'index.html'] as const
  switch (template) {
    case 'react-ts':
    case 'react':
      return [...common, 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'src/main.tsx', 'src/App.tsx']
    case 'vue-ts':
    case 'vue':
      return [...common, 'vite.config.ts', 'tsconfig.json', 'src/main.ts', 'src/App.vue']
    case 'vanilla-ts':
      return [...common, 'vite.config.ts', 'tsconfig.json', 'src/main.ts']
    case 'vanilla':
      return [...common, 'vite.config.js', 'src/main.js']
    case 'svelte-ts':
    case 'svelte':
      return [...common, 'vite.config.ts', 'tsconfig.json', 'src/main.ts', 'src/App.svelte']
    default:
      return [...common, 'vite.config.ts', 'vite.config.js', 'tsconfig.json', 'src/main.tsx', 'src/main.ts']
  }
}

export type PostScaffoldVerificationReport = {
  complete: boolean
  expectedTemplate: ViteTemplateId | null
  expectedPaths: readonly string[]
  readPaths: readonly string[]
  missingPaths: readonly string[]
  /** Key framework signals still unchecked. */
  uncheckedSignals: readonly string[]
}

function basenamePath(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? p.toLowerCase()
}

function pathMatchesExpected(readPath: string, expectedRelative: string): boolean {
  const norm = readPath.replace(/\\/g, '/').toLowerCase()
  const exp = expectedRelative.replace(/\\/g, '/').toLowerCase()
  return norm.endsWith(`/${exp}`) || norm === exp
}

/** Check whether read_file paths this turn cover post-scaffold verification. */
export function assessPostScaffoldVerification(input: {
  readPaths: readonly string[]
  template: ViteTemplateId | null
}): PostScaffoldVerificationReport {
  const expectedPaths = expectedPostScaffoldReadPaths(input.template)
  const readPaths = input.readPaths
  const missingPaths = expectedPaths.filter(
    (exp) => !readPaths.some((r) => pathMatchesExpected(r, exp)),
  )

  const uncheckedSignals: string[] = []
  const readBasenames = new Set(readPaths.map(basenamePath))
  if (input.template?.includes('react') && !readBasenames.has('app.tsx') && !readBasenames.has('main.tsx')) {
    uncheckedSignals.push('React entry file (src/main.tsx or src/App.tsx)')
  }
  if (input.template?.includes('ts') && !readBasenames.has('package.json')) {
    uncheckedSignals.push('package.json (confirm TypeScript deps)')
  }

  const coreMissing = missingPaths.filter((p) =>
    ['package.json', 'vite.config.ts', 'vite.config.js', 'src/main.tsx', 'src/main.ts'].includes(p),
  )

  return {
    complete: coreMissing.length === 0 && uncheckedSignals.length === 0,
    expectedTemplate: input.template,
    expectedPaths,
    readPaths,
    missingPaths,
    uncheckedSignals,
  }
}

export const SCAFFOLD_COMMAND_EXAMPLES: readonly string[] = [
  '**Vite + React + TS:** `npm create vite@latest . -- --template react-ts`',
  '**Alternative (npx):** `npx -y create-vite@latest . --template react-ts`',
  'Always pass `--template` — bare `npx create-vite@latest .` prompts interactively and may ignore the intended stack.',
  'For `npm create`, put create-vite flags **after** `--` (npm passes them to the underlying tool).',
]
