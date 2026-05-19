/**
 * Tags for harness eval matrix cases (story 108). Use in test names/comments for grep.
 */

/** Fast execution harness profile (`grok-code-fast-1`). */
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

export type AgentEvalTag =
  | typeof AGENT_EVAL_TAG_PROFILE_GROK_CODE_FAST
  | typeof AGENT_EVAL_TAG_PROFILE_GROK_4_3
  | typeof AGENT_EVAL_TAG_AGENT_PLANNER
  | typeof AGENT_EVAL_TAG_AGENT_EXECUTOR
  | typeof AGENT_EVAL_TAG_CONTRACT_PLAN
  | typeof AGENT_EVAL_TAG_BEHAVIOR_PROACTIVE
