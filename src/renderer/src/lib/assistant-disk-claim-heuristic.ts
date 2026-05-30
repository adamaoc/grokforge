import type { AgentChatActivityPayload } from '../../../shared/agent-chat-contract'
import { turnHadFailedEditActivities } from '../../../shared/agent-activity-display'
import { fenceExceedsFailedEditReferenceCap } from './assistant-final-answer-sanitize'

/** Matches the fenced machine-readable block info string (suppress false toasts when present). */
const FENCE_INFO = 'grokforge-agent-tools'

/** Story 152: phrasing that implies a completed/applied file when edits actually failed. */
function assistantReplyClaimsCompletedArtifact(text: string): boolean {
  if (/\bcomplete\s+(single[- ]file\s+)?file\b/i.test(text)) return true
  if (/\bcreated\s+(the\s+)?file\b/i.test(text)) return true
  if (/\bhere\s+is\s+your\b/i.test(text)) return true
  if (/\byour\s+[\w-]+\s+prototype\b/i.test(text)) return true
  if (/^below\s+is\s+the\s+full\b/im.test(text)) return true
  if (/\b(full|complete)\s+(html|prototype|implementation)\b/i.test(text)) return true
  return false
}

/** Large fenced code block — likely an unapplied file fallback (story 152 / 164). */
function assistantReplyContainsLargeCodeFallback(text: string): boolean {
  const fences = text.match(/```[\s\S]*?```/g)
  if (!fences) return false
  return fences.some((fence) => fenceExceedsFailedEditReferenceCap(fence))
}

export type AssistantEditClaimContext = {
  /** Turn had failed propose_file_edits / search_replace / edit tool rows. */
  hadEditFailures?: boolean
}

/**
 * Heuristic: assistant text reads like workspace files were already changed on disk, without an
 * accompanying tool proposal or parsed fence. Intentionally conservative (two signals: “disk-ish”
 * context + past-tense edit verbs).
 */
export function assistantReplyClaimsDiskWrites(text: string): boolean {
  const t = text.toLowerCase()
  if (t.includes(FENCE_INFO)) return false
  if (/\bpropose_file_edits\b/.test(t)) return false

  const diskish =
    /\bfiles\b/i.test(text) ||
    /\bon disk\b/i.test(text) ||
    /\bin the workspace\b/i.test(text) ||
    /\b\w+\.(tsx|ts|jsx|js|vue|svelte|css|json|md|html|mjs|cjs)\b/i.test(text) ||
    /`[^`\n]+\.(tsx|ts|jsx|js|vue|svelte|css|json|md|html|mjs|cjs)`/i.test(text)
  if (!diskish) return false

  if (
    /\b(i['']?ve|i have)\s+(already\s+)?(updated|changed|modified|replaced|written|applied|saved|patched|made|created)\b/i.test(
      text,
    )
  )
    return true
  if (/^updated\s+[`']?[\w./-]+\.(tsx|ts|jsx|js|vue|svelte|css|json|md|html|mjs|cjs)/im.test(text)) return true
  if (/\bnow reflects\b/i.test(text) && /\.\w{2,4}\b/.test(text)) return true
  if (/\b(file|files)\s+(has|have)\s+been\s+(updated|changed|modified|written|saved|created)\b/i.test(t))
    return true
  if (/\b(successfully\s+)?(wrote|saved|applied|created)\s+(the\s+)?(changes|updates|file)\b/i.test(t))
    return true
  return false
}

/**
 * True when the assistant implies an edit proposal or diff exists, but GrokForge did not receive
 * edit tool results (extends disk-write claims with “proposal ready for review” phrasing).
 */
export function assistantReplyClaimsEditOutcomeWithoutTool(
  text: string,
  context?: AssistantEditClaimContext,
): boolean {
  if (assistantReplyClaimsDiskWrites(text)) return true

  const t = text.toLowerCase()
  if (t.includes(FENCE_INFO)) return false
  if (/\bpropose_file_edits\b/.test(t)) return false

  const mentionsReviewSurface = /\breview\b/.test(t) || /\bdiff\b/.test(t) || /\bdiff panel\b/.test(t)
  const claimsProposalReady =
    (/\b(edit\s+)?proposal\b/.test(t) || /\bproposed edits?\b/.test(t)) &&
    (/\b(ready|prepared|available|waiting)\b/.test(t) || /\bready for\b/.test(t))

  if (claimsProposalReady && mentionsReviewSurface) return true
  if (/\bready for (your )?review\b/.test(t) && mentionsReviewSurface) return true

  if (context?.hadEditFailures === true) {
    if (assistantReplyClaimsCompletedArtifact(text)) return true
    if (assistantReplyContainsLargeCodeFallback(text)) return true
  }

  return false
}

/**
 * True when the turn had failed edit activities and the final reply still reads like success.
 */
export function assistantReplyClaimsEditSuccessDespiteNoProposal(
  text: string,
  activities: readonly AgentChatActivityPayload[],
): boolean {
  const hadEditFailures = turnHadFailedEditActivities(activities)
  return assistantReplyClaimsEditOutcomeWithoutTool(text, { hadEditFailures })
}

export { turnHadFailedEditActivities }
