import type { AgentProfileId } from './agent-profile'
import type { HarnessProfileKey } from './agent-harness-profile-contract'
import { GF_PLAN_FENCE } from './gf-plan-contract'
import { GREENFIELD_HARNESS_MARKER } from './workspace-greenfield'

export const EDIT_INTENT_RE =
  /\b(add|apply|build|change|create|delete|edit|fix|implement|make|move|patch|refactor|remove|rename|replace|update|write)\b/i

export type AgentFinalAnswerContractInput = {
  userText: string
  editProposalCreated: boolean
  chatMode: 'fast' | 'plan'
  profileKey?: HarnessProfileKey
  agentProfileId?: AgentProfileId
  executeFromApprovedPlan?: boolean
  greenfieldWorkspace?: boolean
}

function planModeProfileAppendix(profileKey?: HarnessProfileKey, greenfieldWorkspace?: boolean): string {
  if (profileKey !== 'grok_4_3') return ''
  const greenfieldNote = greenfieldWorkspace
    ? `If the greenfield harness appendix (${GREENFIELD_HARNESS_MARKER}) applied above, keep concrete file paths, dependencies, and verification commands in the plan JSON.`
    : ''
  return [
    '',
    '### Plan quality (Grok 4.3 harness)',
    'Make `filesLikelyTouched` concrete paths or clear relative paths under workspace roots.',
    'In `risksUnknowns`, list assumptions, missing context, and blockers — not generic filler.',
    'Each `steps` entry should be an actionable engineering step with a clear outcome; include at least one verification-oriented step.',
    '`verification` should name commands or manual checks (e.g. `npm run typecheck`, open UI route, run tests) the executor can run after approval.',
    'Do not propose file edits in this turn; structured plan only.',
    greenfieldNote,
  ]
    .filter(Boolean)
    .join('\n')
}

function executorFromPlanAppendix(
  _profileKey?: HarnessProfileKey,
  executeFromApprovedPlan?: boolean,
  agentProfileId?: AgentProfileId,
): string {
  if (!executeFromApprovedPlan && agentProfileId !== 'executor') return ''
  return [
    '',
    '### Execute approved plan (final answer)',
    'Follow the approved `gf-plan` step order from thread context. `read_file` or `search_workspace` before editing existing paths.',
    'Prefer `search_replace` for localized edits; use `propose_file_edits` for new files or multi-file bootstrap. Do not replan from scratch.',
  ].join('\n')
}

function fastModeProfileAppendix(profileKey?: HarnessProfileKey): string {
  if (profileKey !== 'grok_code_fast') return ''
  return 'Keep the human-readable summary **brief** unless the user asked for a long explanation.'
}

/** System message appended before the final streaming answer in the agent tool loop. */
export function buildFinalAnswerContract(input: AgentFinalAnswerContractInput): string {
  if (input.chatMode === 'plan') {
    return [
      '## Final response contract (Plan mode)',
      `This turn is **Plan mode only**. Your final answer must include **exactly one** fenced JSON block with the markdown language tag \`${GF_PLAN_FENCE}\`.`,
      'The fence body must be one JSON object: `schemaVersion` 1, `summary`, `filesLikelyTouched` (array), `risksUnknowns` (array), `steps` ({ `id`, `title` }[], at least one), `verification`.',
      'You may include short readable prose before or after the fence. The JSON must parse as-is.',
      'Do **not** call `propose_file_edits` or propose file writes on this turn — execution happens after the user approves the plan.',
      'In `filesLikelyTouched` and steps, be explicit about single-file vs multi-file layout. Mention code quality expectations (readable formatting, real line breaks, basic styling for greenfield UI).',
      planModeProfileAppendix(input.profileKey, input.greenfieldWorkspace),
      input.agentProfileId === 'planner'
        ? 'Agent profile **planner**: edit tools and command tools are disabled for this turn — output the plan only.'
        : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  const maybeEdit = EDIT_INTENT_RE.test(input.userText)
  return [
    '## Final response contract',
    input.editProposalCreated
      ? 'A first-class edit proposal has already been created with `propose_file_edits`. Briefly tell the user the diff review is ready; do not claim files were written to disk until they apply.'
      : maybeEdit
        ? 'The user appears to be asking for workspace file changes. Call `propose_file_edits` (or `search_replace` for a small localized edit) before your final answer. Do not stop at prose or a normal markdown code fence — GrokForge does not apply those to disk.'
        : 'If you intend workspace file changes, call `propose_file_edits` in this turn before finishing. If this is only an explanation, omit edit tools.',
    maybeEdit && !input.editProposalCreated
      ? 'Do not ask the user to provide a file path unless you already tried `search_workspace` or `list_directory` in this turn and the target is still ambiguous.'
      : '',
    maybeEdit && !input.editProposalCreated
      ? 'Base each `write_file` on the latest `read_file` content for that path. Make the smallest change that satisfies the request; do not rewrite unrelated sections unless a full-file rewrite is clearly required.'
      : '',
    'Each `write_file` in `propose_file_edits` must include the complete file text (full-file ops), but only change what the request needs. Use `delete_file` for a single existing file. For moves, use `write_file` at the destination plus `delete_file` for the source.',
    'You must `read_file` each existing file before proposing `write_file` for that path in this turn.',
    'For existing files, include `expectedContentHash` from the latest `read_file` `contentHash` on each write operation.',
    'Every path must be absolute and under a workspace root.',
    'Do not tell the user that files were already written, saved, or applied on disk unless `propose_file_edits` succeeded in this turn.',
    fastModeProfileAppendix(input.profileKey),
    executorFromPlanAppendix(input.profileKey, input.executeFromApprovedPlan, input.agentProfileId),
  ]
    .filter(Boolean)
    .join('\n')
}
