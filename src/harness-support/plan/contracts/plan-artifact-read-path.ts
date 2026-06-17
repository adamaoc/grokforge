/** Workspace-scoped alias prefix — use `gf-plan:<planId>` in read_file on execute turns. */
export const GF_PLAN_ARTIFACT_READ_PREFIX = 'gf-plan:'

const GF_PLAN_ARTIFACT_RE = /^gf-plan:([0-9a-f-]{36})(?:\/(plan\.json|plan\.md))?$/i

export function parseGfPlanArtifactReadPath(pathArg: string): {
  planId: string
  format: 'json' | 'md'
} | null {
  const trimmed = pathArg.trim()
  const match = GF_PLAN_ARTIFACT_RE.exec(trimmed)
  if (!match) return null
  const planId = match[1]!
  const suffix = match[2]?.toLowerCase()
  return { planId, format: suffix === 'plan.md' ? 'md' : 'json' }
}

export function formatGfPlanArtifactReadPath(
  planId: string,
  format: 'json' | 'md' = 'json',
): string {
  return format === 'md'
    ? `${GF_PLAN_ARTIFACT_READ_PREFIX}${planId}/plan.md`
    : `${GF_PLAN_ARTIFACT_READ_PREFIX}${planId}`
}