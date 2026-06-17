import { z } from 'zod'
import { formatGfPlanArtifactReadPath } from './plan-artifact-read-path'
import { GfPlanV1Schema } from './gf-plan-contract'

export const PLAN_ARTIFACT_SCHEMA_VERSION = 1 as const

export const PlanArtifactStatusSchema = z.enum(['pending', 'approved', 'superseded'])
export type PlanArtifactStatus = z.infer<typeof PlanArtifactStatusSchema>

export const StoredPlanArtifactSchema = z.object({
  schemaVersion: z.literal(PLAN_ARTIFACT_SCHEMA_VERSION),
  planId: z.string().uuid(),
  threadMessageId: z.string().min(1).max(256),
  createdAt: z.string().datetime(),
  status: PlanArtifactStatusSchema,
  approvedAt: z.string().datetime().optional(),
  supersededBy: z.string().uuid().optional(),
  plan: GfPlanV1Schema,
})

export type StoredPlanArtifact = z.infer<typeof StoredPlanArtifactSchema>

export function renderPlanMarkdown(artifact: StoredPlanArtifact): string {
  const { plan } = artifact
  const lines: string[] = [
    '# GrokForge plan',
    '',
    `**Plan id:** \`${artifact.planId}\``,
    `**Status:** ${artifact.status}`,
    `**Created:** ${artifact.createdAt}`,
    artifact.threadMessageId ? `**Chat message:** \`${artifact.threadMessageId}\`` : '',
    '',
    '## Summary',
    '',
    plan.summary,
    '',
    '## Steps',
    '',
    ...plan.steps.map((s, i) => `${i + 1}. **${s.id}** — ${s.title}`),
    '',
    '## Files likely touched',
    '',
    ...(plan.filesLikelyTouched.length > 0
      ? plan.filesLikelyTouched.map((f) => `- ${f}`)
      : ['- _(none listed)_']),
    '',
    '## Risks and unknowns',
    '',
    ...(plan.risksUnknowns.length > 0
      ? plan.risksUnknowns.map((r) => `- ${r}`)
      : ['- _(none listed)_']),
    '',
    '## Verification',
    '',
    plan.verification,
    '',
  ]
  return lines.filter((l) => l !== undefined).join('\n')
}

export function buildApprovedPlanExecuteSummary(artifact: StoredPlanArtifact, maxChars = 600): string {
  const stepPreview = artifact.plan.steps
    .slice(0, 6)
    .map((s) => `${s.id}: ${s.title}`)
    .join('; ')
  const more = artifact.plan.steps.length > 6 ? ` (+${artifact.plan.steps.length - 6} more steps)` : ''
  let text = `${artifact.plan.summary} Steps: ${stepPreview}${more}. Verification: ${artifact.plan.verification}`
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars - 1)}…`
  }
  return text
}

export function buildApprovedPlanExecuteUserText(planId: string, summaryPreview: string): string {
  const preview =
    summaryPreview.length > 280 ? `${summaryPreview.slice(0, 277)}…` : summaryPreview
  return [
    'Execute the **approved plan** now.',
    `Plan id: \`${planId}\`.`,
    `Summary: ${preview}`,
    `Full step detail is in the system prompt; for structured JSON use \`read_file\` on \`${formatGfPlanArtifactReadPath(planId)}\` (app-storage alias — not an absolute disk path). Implement with \`write_file\`, \`edit\`, and \`run_command\` (commands require approval).`,
  ].join(' ')
}

export function buildApprovedPlanStepsSection(artifact: StoredPlanArtifact): string {
  const lines = [
    '**Plan steps (authoritative):**',
    ...artifact.plan.steps.map((s, i) => `${i + 1}. **${s.id}** — ${s.title}`),
    '',
    '**Files likely touched:**',
    ...(artifact.plan.filesLikelyTouched.length > 0
      ? artifact.plan.filesLikelyTouched.map((f) => `- ${f}`)
      : ['- _(none listed)_']),
    '',
    `**Verification:** ${artifact.plan.verification}`,
    'For doc/file checks: **one** `read_file` on the target path after `write_file`, then reply with a summary — do not loop re-reads.',
  ]
  return lines.join('\n')
}

export function buildApprovedPlanSystemInjection(
  artifact: StoredPlanArtifact,
  planJsonAbsPath: string,
): string {
  const summary = buildApprovedPlanExecuteSummary(artifact, 1200)
  const planReadPath = formatGfPlanArtifactReadPath(artifact.planId)
  return [
    '',
    '## Approved plan artifact',
    `Plan id: \`${artifact.planId}\`. Thread message id: \`${artifact.threadMessageId}\`.`,
    `Step count: ${artifact.plan.steps.length}.`,
    `Summary: ${summary}`,
    '',
    buildApprovedPlanStepsSection(artifact),
    '',
    `Structured JSON (optional): \`read_file\` on \`${planReadPath}\` — GrokForge app-storage alias (works from any workspace root).`,
    `Do **not** \`read_file\` absolute paths such as \`${planJsonAbsPath}\` — they are outside workspace roots and will fail.`,
  ].join('\n')
}

export type SetStoredPlanStatusArgs = {
  projectId: string
  planId: string
  status: PlanArtifactStatus
}

export type SetStoredPlanStatusResult = { ok: true } | { ok: false; error: string }

export type GetStoredPlanForMessageArgs = {
  projectId: string
  threadMessageId: string
}

export type GetStoredPlanForMessageResult =
  | { ok: true; planId: string; status: PlanArtifactStatus; summaryPreview: string }
  | { ok: true; planId?: undefined; status?: undefined; summaryPreview?: undefined }
  | { ok: false; error: string }

export type MarkStoredPlansSupersededArgs = {
  projectId: string
  threadMessageIds: string[]
  supersededByPlanId?: string
}

export type MarkStoredPlansSupersededResult =
  | { ok: true; updated: number }
  | { ok: false; error: string }
