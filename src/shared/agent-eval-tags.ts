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

/** Approved plan with verify/install step → model should sample run_command (126). */
export const AGENT_EVAL_TAG_BEHAVIOR_RUN_COMMAND_PLAN_VERIFY =
  'behavior:run_command_plan_verify' as const

/** npm install classified network/install tier (126). */
export const AGENT_EVAL_TAG_POLICY_NPM_INSTALL = 'policy:npm_install' as const

/** Diagnostic git command classified (126). */
export const AGENT_EVAL_TAG_POLICY_GIT_STATUS_SAFE = 'policy:git_status_safe' as const

/** Greenfield Vite+React+TS scaffold — valid package.json + entry files (127). */
export const AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_VITE_SCAFFOLD =
  'behavior:greenfield_vite_scaffold' as const

/** Malformed vs valid minified package.json on new bootstrap paths (127). */
export const AGENT_EVAL_TAG_VALIDATION_PACKAGE_JSON = 'validation:package_json' as const

/** package.json rejected while markup accepted — recovery nudge + honesty (127). */
export const AGENT_EVAL_TAG_RECOVERY_SCAFFOLD_PARTIAL = 'recovery:scaffold_partial' as const

/** Populated index + incremental Work message → executor, no forced gf-plan (127). */
export const AGENT_EVAL_TAG_ROUTING_EXISTING_PROJECT_NO_REPLAN =
  'routing:existing_project_no_replan' as const

/** Populated index + incremental Work message → no scaffold strategy nudge (128). */
export const AGENT_EVAL_TAG_ROUTING_EXISTING_PROJECT_NO_SCAFFOLD_NUDGE =
  'routing:existing_project_no_scaffold_nudge' as const

/** Small non-greenfield repo (no package.json) + Work edit → executor, harness 130 (130). */
export const AGENT_EVAL_TAG_ROUTING_ITERATIVE_WORK_NO_REPLAN =
  'routing:iterative_work_no_replan' as const

/** Vite plan + greenfield execute → CLI first, no hand-written template same round (128). */
export const AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CLI_ONLY_FIRST =
  'behavior:scaffold_cli_only_first' as const

/** Static HTML plan → propose_file_edits only, no npm create (128). */
export const AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_FILE_BOOTSTRAP_STATIC =
  'behavior:scaffold_file_bootstrap_static' as const

/** Model samples CLI + edits same round → scaffold strategy nudge (128). */
export const AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_HYBRID_NUDGE =
  'behavior:scaffold_hybrid_nudge' as const

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
  | typeof AGENT_EVAL_TAG_BEHAVIOR_RUN_COMMAND_PLAN_VERIFY
  | typeof AGENT_EVAL_TAG_POLICY_NPM_INSTALL
  | typeof AGENT_EVAL_TAG_POLICY_GIT_STATUS_SAFE
  | typeof AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_VITE_SCAFFOLD
  | typeof AGENT_EVAL_TAG_VALIDATION_PACKAGE_JSON
  | typeof AGENT_EVAL_TAG_RECOVERY_SCAFFOLD_PARTIAL
  | typeof AGENT_EVAL_TAG_ROUTING_EXISTING_PROJECT_NO_REPLAN
  | typeof AGENT_EVAL_TAG_ROUTING_EXISTING_PROJECT_NO_SCAFFOLD_NUDGE
  | typeof AGENT_EVAL_TAG_ROUTING_ITERATIVE_WORK_NO_REPLAN
  | typeof AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CLI_ONLY_FIRST
  | typeof AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_FILE_BOOTSTRAP_STATIC
  | typeof AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_HYBRID_NUDGE
