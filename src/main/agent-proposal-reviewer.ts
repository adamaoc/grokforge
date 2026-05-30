import { randomUUID } from 'node:crypto'
import type { GrokProjectManifest } from './manifest'
import type { AgentChatModelTransport } from './agent-chat-model-transport'
import type { AgentProviderRequest } from '../shared/agent-turn-snapshot'
import type { AgentEditProposalPayload } from '../shared/agent-chat-contract'
import {
  AGENT_REVIEWER_DEFAULT_MODEL,
  AGENT_REVIEWER_PROFILE,
  type AgentProposalReviewResult,
  parseProposalReview,
  resolveAgentReviewerConfig,
} from '../shared/agent-proposal-reviewer'

const REVIEWER_MAX_CONTENT_CHARS_PER_OP = 12_000
const REVIEWER_MAX_PROMPT_CHARS = 48_000

type ReviewProposalInput = {
  manifest: GrokProjectManifest
  proposal: AgentEditProposalPayload
  transport: AgentChatModelTransport
  abortSignal: AbortSignal
  userText?: string
  planSummary?: string
  modelOverride?: string
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`
}

function proposalForReviewer(proposal: AgentEditProposalPayload): string {
  const parts: string[] = []
  for (const op of proposal.batch.operations) {
    if (op.op === 'delete_file') {
      parts.push(`DELETE ${op.path}`)
      continue
    }
    parts.push(
      [
        `WRITE ${op.path}`,
        `expectedContentHash: ${op.expectedContentHash ?? 'none'}`,
        'content:',
        truncate(op.content, REVIEWER_MAX_CONTENT_CHARS_PER_OP),
      ].join('\n'),
    )
  }
  if (proposal.rejected.length > 0) {
    parts.push(`Rejected paths already caught by harness: ${JSON.stringify(proposal.rejected)}`)
  }
  return truncate(parts.join('\n\n---\n\n'), REVIEWER_MAX_PROMPT_CHARS)
}

export function buildProposalReviewUserPrompt(input: {
  proposal: AgentEditProposalPayload
  userText?: string
  planSummary?: string
}): string {
  return [
    'Review this GrokForge edit proposal before the user sees it.',
    input.userText ? `User request:\n${truncate(input.userText, 4_000)}` : '',
    input.planSummary ? `Plan / execution context:\n${truncate(input.planSummary, 8_000)}` : '',
    `Proposal:\n${proposalForReviewer(input.proposal)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function reviewAgentEditProposal(input: ReviewProposalInput): Promise<AgentProposalReviewResult> {
  const config = resolveAgentReviewerConfig(input.manifest.reviewer)
  const model = (input.modelOverride ?? config.model ?? AGENT_REVIEWER_DEFAULT_MODEL).trim()
  const request: AgentProviderRequest = {
    snapshotId: `review-${randomUUID()}`,
    model,
    messages: [
      { role: 'system', content: AGENT_REVIEWER_PROFILE.systemPrompt },
      {
        role: 'user',
        content: buildProposalReviewUserPrompt({
          proposal: input.proposal,
          userText: input.userText,
          planSummary: input.planSummary,
        }),
      },
    ],
    tools: [],
    sampleMaxTokens: 1400,
    disableTools: true,
  }
  try {
    const result = await input.transport.sampleChatCompletion(request, input.abortSignal)
    return { ok: true, review: parseProposalReview(result.content, model) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
