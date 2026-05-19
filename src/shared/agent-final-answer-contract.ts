import { AGENT_TOOL_FENCE_INFO, AGENT_TOOL_PROTOCOL_VERSION } from './agent-tool-contract'
import { GF_PLAN_FENCE } from './gf-plan-contract'

export const EDIT_INTENT_RE =
  /\b(add|apply|build|change|create|delete|edit|fix|implement|make|move|patch|refactor|remove|rename|replace|update|write)\b/i

export type AgentFinalAnswerContractInput = {
  userText: string
  editProposalCreated: boolean
  chatMode: 'fast' | 'plan'
}

/** System message appended before the final streaming answer in the agent tool loop. */
export function buildFinalAnswerContract(input: AgentFinalAnswerContractInput): string {
  if (input.chatMode === 'plan') {
    return [
      '## Final response contract (Plan mode)',
      `This turn is **Plan mode only**. Your final answer must include **exactly one** fenced JSON block with the markdown language tag \`${GF_PLAN_FENCE}\`.`,
      'The fence body must be one JSON object: `schemaVersion` 1, `summary`, `filesLikelyTouched` (array), `risksUnknowns` (array), `steps` ({ `id`, `title` }[], at least one), `verification`.',
      'You may include short readable prose before or after the fence. The JSON must parse as-is.',
      'Do **not** call `propose_file_edits`, append `grokforge-agent-tools`, or propose file writes on this turn — execution happens after the user approves the plan.',
      'In `filesLikelyTouched` and steps, be explicit about single-file vs multi-file layout. Mention code quality expectations (readable formatting, real line breaks, basic styling for greenfield UI).',
    ].join('\n')
  }

  const maybeEdit = EDIT_INTENT_RE.test(input.userText)
  return [
    '## Final response contract',
    input.editProposalCreated
      ? 'A first-class edit proposal has already been created with `propose_file_edits`. Do not append a fenced `' +
        AGENT_TOOL_FENCE_INFO +
        '` JSON block; briefly tell the user the diff review is ready.'
      : 'If the final answer proposes workspace file changes and you have not already called `propose_file_edits`, append exactly one fenced `' +
        AGENT_TOOL_FENCE_INFO +
        '` JSON block after the human-readable summary. The renderer hides that block and turns it into a pending diff review.',
    maybeEdit && !input.editProposalCreated
      ? 'The user appears to be asking for an edit. Do not stop at prose or a normal code fence if you know the full file contents needed. Emit the machine-readable block so GrokForge can review/apply it.'
      : 'If this is only an explanation or you are missing necessary file contents, omit the block.',
    maybeEdit && !input.editProposalCreated
      ? 'Do not ask the user to provide a file path unless you already tried `search_workspace` or `list_directory` in this turn and the target is still ambiguous.'
      : '',
    maybeEdit && !input.editProposalCreated
      ? 'Base each `write_file` on the latest `read_file` content for that path. Make the smallest change that satisfies the request; do not rewrite unrelated sections unless a full-file rewrite is clearly required.'
      : '',
    'Each `write_file` must include the complete file text required by the protocol (full-file ops), but only change what the request needs. Use `delete_file` for a single existing file. For moves, use `write_file` at the destination plus `delete_file` for the source.',
    'You must `read_file` each existing file before proposing `write_file` for that path in this turn.',
    'For existing files, include `expectedContentHash` from the latest `read_file` `contentHash` on each write operation.',
    'JSON version: ' + String(AGENT_TOOL_PROTOCOL_VERSION) + '. Every path must be absolute and under a workspace root.',
  ]
    .filter(Boolean)
    .join('\n')
}
