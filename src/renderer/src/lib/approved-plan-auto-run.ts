import { buildApprovedPlanExecuteUserText } from './legacy-agent/plan'

/** Legacy fallback when no durable plan artifact id is available. */
export const APPROVED_PLAN_AUTO_RUN_USER_TEXT_LEGACY =
  'The plan above was **approved**. Execute it now: follow the structured `gf-plan` in your latest assistant message in this thread. Use `read_file` / `list_files` where needed; use `write_file` and `edit` for file changes and `run_command` for scaffold/install/verify — `run_command` still requires my approval per GrokForge settings.'

export function approvedPlanAutoRunUserText(planId: string | undefined, summaryPreview: string): string {
  if (planId) return buildApprovedPlanExecuteUserText(planId, summaryPreview)
  return APPROVED_PLAN_AUTO_RUN_USER_TEXT_LEGACY
}
