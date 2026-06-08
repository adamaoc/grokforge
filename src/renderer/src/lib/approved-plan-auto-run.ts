import { buildApprovedPlanExecuteUserText } from './legacy-agent/plan'

/** Legacy fallback when no durable plan artifact id is available. */
export const APPROVED_PLAN_AUTO_RUN_USER_TEXT_LEGACY =
  'The plan above was **approved**. Execute it now: follow the structured `gf-plan` in your latest assistant message in this thread. Use read/search tools where needed; use `propose_file_edits` for file changes and `run_command` only when appropriate — command runs and file edits still require my approval per GrokForge settings.'

export function approvedPlanAutoRunUserText(planId: string | undefined, summaryPreview: string): string {
  if (planId) return buildApprovedPlanExecuteUserText(planId, summaryPreview)
  return APPROVED_PLAN_AUTO_RUN_USER_TEXT_LEGACY
}
