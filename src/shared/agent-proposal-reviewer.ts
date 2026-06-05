import { z } from 'zod'
import type { AgentEditProposalPayload } from './agent-chat-contract'
import type { AgentToolBatchPayload } from '../harness-support/tools/contracts/tool-contract'

export const AGENT_REVIEWER_DEFAULT_MODEL = 'grok-build-0.1'
export const AGENT_REVIEWER_DEFAULT_MIN_CHANGED_LINES = 80
export const AGENT_REVIEWER_MAX_MODEL_LEN = 128
export const AGENT_CHAT_REVIEW_CONTEXT_MAX_CHARS = 20_000

export const AGENT_PROPOSAL_REVIEWER_PROMPT = [
  'You are the GrokForge proposal reviewer. Review proposed workspace edits only; do not implement changes.',
  'Be critical, concise, and constructive. Look for crushed/glued code, bad formatting, syntax or runtime bugs, security issues, plan deviation, and overly broad or unnecessary changes.',
  'If a plan or user goal is supplied, judge whether the proposal follows it. If context is limited, say so rather than inventing facts.',
  'Return strict JSON only with: {"overallVerdict":"pass"|"needs_attention"|"fail","summary":"...","issues":[{"severity":"info"|"warning"|"error","path":"optional","message":"...","suggestion":"optional"}]}.',
  'Use "pass" only when there are no material concerns. Use "fail" for likely broken, unsafe, or plan-divergent proposals.',
].join('\n')

export type AgentReviewerProfile = {
  id: 'reviewer'
  displayName: string
  systemPrompt: string
  canProposeEdits: false
  canRunCommand: false
}

export const AGENT_REVIEWER_PROFILE: AgentReviewerProfile = {
  id: 'reviewer',
  displayName: 'Reviewer',
  systemPrompt: AGENT_PROPOSAL_REVIEWER_PROMPT,
  canProposeEdits: false,
  canRunCommand: false,
}

export const AgentReviewerConfigSchema = z.object({
  autoReviewEdits: z.boolean().default(false),
  model: z.string().min(1).max(AGENT_REVIEWER_MAX_MODEL_LEN).default(AGENT_REVIEWER_DEFAULT_MODEL),
  minChangedLines: z
    .number()
    .int()
    .nonnegative()
    .max(20_000)
    .default(AGENT_REVIEWER_DEFAULT_MIN_CHANGED_LINES),
})

export type AgentReviewerConfig = z.infer<typeof AgentReviewerConfigSchema>

export type AgentProposalReviewIssueSeverity = 'info' | 'warning' | 'error'
export type AgentProposalReviewVerdict = 'pass' | 'needs_attention' | 'fail'

export type AgentProposalReviewIssue = {
  severity: AgentProposalReviewIssueSeverity
  path?: string
  message: string
  suggestion?: string
}

export type AgentProposalReview = {
  reviewerModel: string
  overallVerdict: AgentProposalReviewVerdict
  summary: string
  issues: AgentProposalReviewIssue[]
  createdAt: string
}

export type AgentProposalReviewRequest = {
  proposal: AgentEditProposalPayload
  userText?: string
  planSummary?: string
}

export type AgentProposalReviewResult =
  | { ok: true; review: AgentProposalReview }
  | { ok: false; error: string }

export const AgentProposalReviewRequestSchema: z.ZodType<AgentProposalReviewRequest> = z.object({
  proposal: z.custom<AgentEditProposalPayload>(
    (value) => value != null && typeof value === 'object' && 'batch' in value && 'rejected' in value,
    'Invalid proposal',
  ),
  userText: z.string().max(AGENT_CHAT_REVIEW_CONTEXT_MAX_CHARS).optional(),
  planSummary: z.string().max(AGENT_CHAT_REVIEW_CONTEXT_MAX_CHARS).optional(),
})

export function resolveAgentReviewerConfig(input: unknown): AgentReviewerConfig {
  return AgentReviewerConfigSchema.parse(input ?? {})
}

function lineCount(text: string): number {
  if (text.length === 0) return 0
  return text.split(/\r\n|\r|\n/).length
}

export function estimateProposalChangedLines(batch: AgentToolBatchPayload): number {
  return batch.operations.reduce((total, op) => {
    if (op.op === 'delete_file') return total + 1
    return total + lineCount(op.content)
  }, 0)
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return fenced?.[1]?.trim() ?? trimmed
}

function parseSeverity(value: unknown): AgentProposalReviewIssueSeverity {
  return value === 'error' || value === 'warning' || value === 'info' ? value : 'warning'
}

export function parseProposalReview(raw: string, model: string): AgentProposalReview {
  const parsed = JSON.parse(stripJsonFence(raw)) as {
    overallVerdict?: unknown
    summary?: unknown
    issues?: unknown
  }
  const verdict =
    parsed.overallVerdict === 'pass' ||
    parsed.overallVerdict === 'needs_attention' ||
    parsed.overallVerdict === 'fail'
      ? parsed.overallVerdict
      : 'needs_attention'
  const issues: AgentProposalReviewIssue[] = Array.isArray(parsed.issues)
    ? parsed.issues
        .slice(0, 12)
        .map((item) => {
          const issue = item as Record<string, unknown>
          const message = typeof issue.message === 'string' ? issue.message.trim() : ''
          if (!message) return null
          return {
            severity: parseSeverity(issue.severity),
            ...(typeof issue.path === 'string' && issue.path.trim() ? { path: issue.path.trim() } : {}),
            message: truncate(message, 600),
            ...(typeof issue.suggestion === 'string' && issue.suggestion.trim()
              ? { suggestion: truncate(issue.suggestion.trim(), 600) }
              : {}),
          }
        })
        .filter((item): item is AgentProposalReviewIssue => item != null)
    : []
  return {
    reviewerModel: model,
    overallVerdict: verdict,
    summary: truncate(
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : issues.length > 0
          ? 'Reviewer found issues.'
          : 'Reviewer did not find material issues.',
      800,
    ),
    issues,
    createdAt: new Date().toISOString(),
  }
}

export function shouldAutoReviewProposal(input: {
  config: AgentReviewerConfig
  proposal: AgentEditProposalPayload
  chatMode: 'fast' | 'plan'
}): boolean {
  if (!input.config.autoReviewEdits) return false
  if (input.chatMode === 'plan') return true
  return estimateProposalChangedLines(input.proposal.batch) >= input.config.minChangedLines
}
