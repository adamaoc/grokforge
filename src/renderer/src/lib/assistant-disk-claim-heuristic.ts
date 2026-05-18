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
    /\b\w+\.(tsx|ts|jsx|js|vue|svelte|css|json|md|mjs|cjs)\b/i.test(text) ||
    /`[^`\n]+\.(tsx|ts|jsx|js|vue|svelte|css|json|md|mjs|cjs)`/i.test(text)
  if (!diskish) return false

  if (
    /\b(i['']?ve|i have)\s+(already\s+)?(updated|changed|modified|replaced|written|applied|saved|patched|made)\b/i.test(
      text,
    )
  )
    return true
  if (/\b(file|files)\s+(has|have)\s+been\s+(updated|changed|modified|written|saved)\b/i.test(t)) return true
  if (/\b(successfully\s+)?(wrote|saved|applied)\s+(the\s+)?(changes|updates)\b/i.test(t)) return true
  return false
}
