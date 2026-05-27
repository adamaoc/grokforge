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

/** Hybrid nudge → compliant resample → soft final contract (134). */
export const AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CONFLICT_RECOVERED_FINAL_CONTRACT =
  'behavior:scaffold_conflict_recovered_final_contract' as const

/** Hybrid nudge → no recovery → strong honesty appendix (134). */
export const AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CONFLICT_UNRECOVERED_HONESTY =
  'behavior:scaffold_conflict_unrecovered_honesty' as const

/** Static HTML plan + file-only samples → no scaffold conflict activity (131). */
export const AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_FILE_BOOTSTRAP_NO_FALSE_CONFLICT =
  'behavior:scaffold_file_bootstrap_no_false_conflict' as const

/** file_bootstrap + verify/serve command + edits same round → no strategy nudge (131). */
export const AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_VERIFY_COMMAND_NOT_HYBRID =
  'behavior:scaffold_verify_command_not_hybrid' as const

/** Empty workspace + static todo intent → planner prompt includes static verify marker (132). */
export const AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_PLAN_STATIC_VERIFY_COPY =
  'behavior:greenfield_plan_static_verify_copy' as const

/** Static approved plan + execute with edits but no run_command → nudge cites serve command (132). */
export const AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_EXECUTE_STATIC_VERIFY_NUDGE =
  'behavior:greenfield_execute_static_verify_nudge' as const

/** Vite plan → verification mentions npm run / typecheck in planner contract (132). */
export const AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_PLAN_NPM_VERIFY_COPY =
  'behavior:greenfield_plan_npm_verify_copy' as const

/** Empty workspace static Todo: plan marker → approve-and-run → valid HTML/CSS/JS proposal (133). */
export const AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_STATIC_PLAN_EXECUTE_HAPPY =
  'behavior:greenfield_static_plan_execute_happy' as const

/** Glued one-line README.md normalizes to real newlines (133). */
export const AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_STATIC_NORMALIZED_MARKDOWN =
  'behavior:greenfield_static_normalized_markdown' as const

/** Crushed one-line index.html with jammed inline script rejected (133). */
export const AGENT_EVAL_TAG_VALIDATION_GREENFIELD_STATIC_HTML_CORRUPTION =
  'validation:greenfield_static_html_corruption' as const

/** Iterative Work localStorage ask → bounded tool rounds + one edit proposal (135). */
export const AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_LOCALSTORAGE_LOW_ROUNDS =
  'behavior:iterative_work_localstorage_low_rounds' as const

/** Iterative Work 2× search_replace same path → consolidation thrash nudge (135). */
export const AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_CONSOLIDATION_NUDGE =
  'behavior:iterative_work_sr_consolidation_nudge' as const

/** Iterative Work edit proposal emitted → no further tool_sample (135). */
export const AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_STOP_AFTER_PROPOSAL =
  'behavior:iterative_work_stop_after_proposal' as const

/** Iterative Work localStorage ask → scope marker + script.js hint in system prompt (136). */
export const AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_EDIT_SCOPE_SINGLE_FILE =
  'behavior:iterative_edit_scope_single_file' as const

/** Iterative Work single-file scope → prefer propose nudge after S&R (136). */
export const AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_EDIT_SCOPE_PREFER_PROPOSE_NUDGE =
  'behavior:iterative_edit_scope_prefer_propose_nudge' as const

/** Iterative Work turn trace includes harnessMetrics (137). */
export const AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_TRACE_METRICS =
  'behavior:iterative_work_trace_metrics' as const

/** Iterative Work: S&R escalation after 1 failure per path (138). */
export const AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_FAIL_FAST_ESCALATE =
  'behavior:iterative_work_sr_fail_fast_escalate' as const

/** Iterative Work: post-escalation S&R blocked; harness reason returned (138). */
export const AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_BLOCKED_AFTER_ESCALATE =
  'behavior:iterative_work_sr_blocked_after_escalate' as const

/** Iterative Work: remove-todo style turn completes without maxToolIterationsHit (138). */
export const AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_NO_MAX_ITERATIONS =
  'behavior:iterative_work_sr_no_max_iterations' as const

/** Iterative Work: harness includes S&R quality marker on iterative turn (139). */
export const AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_QUALITY_SECTIONS =
  'behavior:iterative_work_sr_quality_sections' as const

/** Iterative Work: search_replace tool description override on iterative turn (139). */
export const AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_TOOL_OVERRIDE =
  'behavior:iterative_work_sr_tool_override' as const

/** Turn trace includes searchReplace failure metrics after S&R loop (140). */
export const AGENT_EVAL_TAG_BEHAVIOR_TRACE_SEARCH_REPLACE_FAILURE_METRICS =
  'behavior:trace_search_replace_failure_metrics' as const

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
  | typeof AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CONFLICT_RECOVERED_FINAL_CONTRACT
  | typeof AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_CONFLICT_UNRECOVERED_HONESTY
  | typeof AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_FILE_BOOTSTRAP_NO_FALSE_CONFLICT
  | typeof AGENT_EVAL_TAG_BEHAVIOR_SCAFFOLD_VERIFY_COMMAND_NOT_HYBRID
  | typeof AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_PLAN_STATIC_VERIFY_COPY
  | typeof AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_EXECUTE_STATIC_VERIFY_NUDGE
  | typeof AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_PLAN_NPM_VERIFY_COPY
  | typeof AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_STATIC_PLAN_EXECUTE_HAPPY
  | typeof AGENT_EVAL_TAG_BEHAVIOR_GREENFIELD_STATIC_NORMALIZED_MARKDOWN
  | typeof AGENT_EVAL_TAG_VALIDATION_GREENFIELD_STATIC_HTML_CORRUPTION
  | typeof AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_LOCALSTORAGE_LOW_ROUNDS
  | typeof AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_CONSOLIDATION_NUDGE
  | typeof AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_STOP_AFTER_PROPOSAL
  | typeof AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_EDIT_SCOPE_SINGLE_FILE
  | typeof AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_EDIT_SCOPE_PREFER_PROPOSE_NUDGE
  | typeof AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_TRACE_METRICS
  | typeof AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_FAIL_FAST_ESCALATE
  | typeof AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_BLOCKED_AFTER_ESCALATE
  | typeof AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_NO_MAX_ITERATIONS
  | typeof AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_QUALITY_SECTIONS
  | typeof AGENT_EVAL_TAG_BEHAVIOR_ITERATIVE_WORK_SR_TOOL_OVERRIDE
  | typeof AGENT_EVAL_TAG_BEHAVIOR_TRACE_SEARCH_REPLACE_FAILURE_METRICS
