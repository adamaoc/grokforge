/**
 * Iterative Work round cap (story 135, consolidated in 144).
 * Mid-turn nudges live in incremental-work-edit-policy.ts.
 */

export {
  INCREMENTAL_EDIT_MAX_TOOL_ROUNDS as ITERATIVE_WORK_MAX_TOOL_ROUNDS,
  resolveIncrementalMaxToolIterations as resolveIterativeMaxToolIterations,
} from './work-edit-policy'
