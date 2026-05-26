/**
 * Tags for harness eval matrix cases (story 108). Use in test names/comments for grep.
 */

/** Fast execution harness profile (`grok-build-0.1` / `grok_code_fast`). */
export const AGENT_EVAL_TAG_PROFILE_GROK_CODE_FAST = 'profile:grok_code_fast' as const

/** Capable planning harness profile (`grok-4.3`). */
export const AGENT_EVAL_TAG_PROFILE_GROK_4_3 = 'profile:grok_4_3' as const

/** Planner agent profile — read-only tool surface in plan mode. */
export const AGENT_EVAL_TAG_AGENT_PLANNER = 'agent:planner' as const

/** Executor agent profile — full edit/command tools on approve-and-run. */
export const AGENT_EVAL_TAG_AGENT_EXECUTOR = 'agent:executor' as const

/** Plan mode final answer requires `gf-plan` contract. */
export const AGENT_EVAL_TAG_CONTRACT_PLAN = 'contract:plan' as const

/** Proactive search/list when user names a feature without a path. */
export const AGENT_EVAL_TAG_BEHAVIOR_PROACTIVE = 'behavior:proactive' as const

/** Post-plan incremental Work follow-up routes to executor (120). */
export const AGENT_EVAL_TAG_ROUTING_POST_PLAN = 'routing:post_plan_incremental' as const

/** Single-file workspace edit bias in harness prompts (120). */
export const AGENT_EVAL_TAG_BEHAVIOR_SINGLE_FILE = 'behavior:single_file_edits' as const

/** Approve-and-run over empty/near-empty workspace with multi-file plan (124). */
export const AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_EXECUTE = 'behavior:greenfield_execute' as const

/** Reject or recover crushed/invalid script.js proposals (124). */
export const AGENT_EVAL_TAG_VALIDATION_JS_CORRUPTION = 'validation:js_corruption' as const

/** Partial batch accepted + rejected — harness nudge + honest final answer (124). */
export const AGENT_EVAL_TAG_RECOVERY_PARTIAL_BATCH = 'recovery:partial_batch' as const

export type AgentEvalTag =
  | typeof AGENT_EVAL_TAG_PROFILE_GROK_CODE_FAST
  | typeof AGENT_EVAL_TAG_PROFILE_GROK_4_3
  | typeof AGENT_EVAL_TAG_AGENT_PLANNER
  | typeof AGENT_EVAL_TAG_AGENT_EXECUTOR
  | typeof AGENT_EVAL_TAG_CONTRACT_PLAN
  | typeof AGENT_EVAL_TAG_BEHAVIOR_PROACTIVE
  | typeof AGENT_EVAL_TAG_ROUTING_POST_PLAN
  | typeof AGENT_EVAL_TAG_BEHAVIOR_SINGLE_FILE
  | typeof AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_EXECUTE
  | typeof AGENT_EVAL_TAG_VALIDATION_JS_CORRUPTION
  | typeof AGENT_EVAL_TAG_RECOVERY_PARTIAL_BATCH
