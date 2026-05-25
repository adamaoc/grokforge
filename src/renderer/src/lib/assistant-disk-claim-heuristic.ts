/** Matches the fenced machine-readable block info string (suppress false toasts when present). */
const FENCE_INFO = 'grokforge-agent-tools'

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
    /\b(i['']?ve|i have)\s+(already\s+)?(updated|changed|modified|replaced|written|applied|saved|patched|made)\b/i.test(
      text,
    )
  )
    return true
  if (/^updated\s+[`']?[\w./-]+\.(tsx|ts|jsx|js|vue|svelte|css|json|md|html|mjs|cjs)/im.test(text)) return true
  if (/\bnow reflects\b/i.test(text) && /\.\w{2,4}\b/.test(text)) return true
  if (/\b(file|files)\s+(has|have)\s+been\s+(updated|changed|modified|written|saved)\b/i.test(t)) return true
  if (/\b(successfully\s+)?(wrote|saved|applied)\s+(the\s+)?(changes|updates)\b/i.test(t)) return true
  return false
}

/**
 * True when the assistant implies an edit proposal or diff exists, but GrokForge did not receive
 * edit tool results (extends disk-write claims with “proposal ready for review” phrasing).
 */
export function assistantReplyClaimsEditOutcomeWithoutTool(text: string): boolean {
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

  return false
}
