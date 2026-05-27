import { isMarkdownOrPlainTextPath } from './agent-markdown-path'
import {
  hasOverlongSourceLines,
  reflowMarkdownDocumentLineBreaks,
} from './agent-file-content-normalize'

export const CRUSHED_MARKDOWN_PROPOSAL_REASON =
  'Proposal must include the full file from read_file rawContent with normal line breaks (all sections). One-line or crushed markdown stubs are rejected — copy the entire document, then change only the requested section.'

export const TITLE_ONLY_MARKDOWN_STUB_REASON =
  'write_file.content was only the document title (or a tiny stub). Tool calls must use the complete read_file rawContent — markdown shown in your reply does not update the file until propose_file_edits succeeds.'

export const SEARCH_REPLACE_SHRINK_STUB_REASON =
  'search_replace would remove most of the file. new_string must include the full updated section or complete file body from rawContent — not a title line or shortened stub.'

function markdownHeadingsFrom(text: string): string[] {
  return [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean)
}

/** H2 section titles only (used for repair — not substring matching on section names). */
export function markdownH2TitlesFrom(text: string): string[] {
  return [...text.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1].trim())
}

/** True when section headings differ only by suffix like "(planned)" or minor renames. */
export function sectionTitlesEquivalent(a: string, b: string): boolean {
  const strip = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()
  const na = strip(a)
  const nb = strip(b)
  return na === nb || na.includes(nb) || nb.includes(na)
}

function countMissingOriginalH2Sections(originalOnDisk: string, proposal: string): number {
  const originalH2 = markdownH2TitlesFrom(originalOnDisk)
  const proposalH2 = markdownH2TitlesFrom(proposal)
  if (originalH2.length === 0) return 0
  if (proposalH2.length === 0) return originalH2.length
  return originalH2.filter((t) => !proposalH2.some((p) => sectionTitlesEquivalent(t, p))).length
}

/** True when a search_replace result clearly deleted most of the document (not section renames). */
export function isSearchReplaceResultDestructive(
  originalOnDisk: string,
  patched: string,
  resolvedPath: string,
): boolean {
  if (!isMarkdownOrPlainTextPath(resolvedPath)) {
    const originalLines = originalOnDisk.split(/\r?\n/).length
    const patchedLines = patched.split(/\r?\n/).length
    if (originalLines < 5) return false
    const lineRatio = patchedLines / Math.max(originalLines, 1)
    const charRatio = originalOnDisk.length > 0 ? patched.length / originalOnDisk.length : 1
    return lineRatio < 0.5 || charRatio < 0.5
  }
  const origN = countNonemptyLines(originalOnDisk)
  const patchedN = countNonemptyLines(patched)
  if (origN >= 4 && patchedN <= 2) return true
  if (patchedN < origN * 0.45) return true
  const missingH2 = countMissingOriginalH2Sections(originalOnDisk, patched)
  if (missingH2 >= 2) return true
  if (missingH2 === originalOnDisk.length && patchedN < origN) return true
  return false
}

export type MarkdownProposalRepairSkipReason =
  | 'not_markdown'
  | 'empty'
  | 'few_original_headings'
  | 'no_h2_in_proposal'
  | 'title_only_stub'
  | 'already_complete'
  | 'repaired_still_crushed'
  | 'h2_not_found_on_disk'

export function isTitleOnlyMarkdownStub(
  originalOnDisk: string,
  normalizedProposal: string,
): boolean {
  const propLines = normalizedProposal.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (propLines.length === 0 || propLines.length > 2) return false
  if (markdownH2TitlesFrom(normalizedProposal).length > 0) return false
  const text = normalizedProposal.trim()
  if (!/^#\s+/m.test(text) || text.length > 120) return false
  const hasBullets = /^\s*-\s+/m.test(text)
  if (hasBullets) return false
  return countNonemptyLines(originalOnDisk) > countNonemptyLines(normalizedProposal) + 2
}

export function resolveCrushedMarkdownRejectionReason(
  originalOnDisk: string,
  normalizedProposal: string,
  resolvedPath: string,
): string {
  if (isTitleOnlyMarkdownStub(originalOnDisk, normalizedProposal)) {
    return TITLE_ONLY_MARKDOWN_STUB_REASON
  }
  const diag = diagnoseMarkdownProposalRepair(originalOnDisk, normalizedProposal, resolvedPath)
  if (diag.repairSkipReason === 'no_h2_in_proposal' && /^\s*-\s+/m.test(normalizedProposal)) {
    return `${CRUSHED_MARKDOWN_PROPOSAL_REASON} Sent bullet lines without ## section headings — include the full rawContent file, or send a ## Section block plus bullets.`
  }
  return CRUSHED_MARKDOWN_PROPOSAL_REASON
}

function extractMarkdownBulletLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => /^\s*-\s+\S/.test(l))
}

function pickBulletMergeTargetH2(originalOnDisk: string, proposed: string): string | null {
  const h2s = markdownH2TitlesFrom(originalOnDisk)
  if (h2s.length === 0) return null
  const stack = h2s.find((t) => /tech\s*stack|stack\s*\(/i.test(t))
  if (stack) return stack
  if (/(react|typescript|vite|node\.?js|frontend|backend)/i.test(proposed)) {
    return h2s[h2s.length - 1] ?? null
  }
  return h2s.length === 1 ? h2s[0] : null
}

/** Merge bullet-only partial proposals into the best matching on-disk ## section. */
function tryRepairBulletOnlyMarkdownProposal(
  originalOnDisk: string,
  proposed: string,
): string | null {
  const bullets = extractMarkdownBulletLines(proposed)
  if (bullets.length === 0) return null
  const target = pickBulletMergeTargetH2(originalOnDisk, proposed)
  if (!target) return null
  const out = replaceMarkdownSectionBody(originalOnDisk, target, bullets.join('\n'))
  if (out === originalOnDisk) return null
  return out
}

export type MarkdownProposalRepairDiagnostics = {
  crushed: boolean
  originalLines: number
  proposalLines: number
  reflowed: boolean
  reflowedLines: number
  originalH2: string[]
  proposalH2: string[]
  missingH2: string[]
  repairSkipReason?: MarkdownProposalRepairSkipReason
  repaired: string | null
}

function countNonemptyLines(text: string): number {
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).length
}

export function diagnoseMarkdownProposalRepair(
  originalOnDisk: string,
  normalizedProposal: string,
  resolvedPath: string,
): MarkdownProposalRepairDiagnostics {
  const crushed = isUnacceptableCrushedMarkdownProposal(
    originalOnDisk,
    normalizedProposal,
    resolvedPath,
  )
  const originalH2 = markdownH2TitlesFrom(originalOnDisk)
  let proposed = normalizedProposal
  let reflowed = false
  if (proposed.split(/\r?\n/).length <= 3 || hasOverlongSourceLines(proposed, 200)) {
    proposed = reflowMarkdownDocumentLineBreaks(proposed)
    reflowed = true
  }
  const proposalH2 = markdownH2TitlesFrom(proposed)
  const missingH2 = originalH2.filter(
    (t) => !proposalH2.some((p) => sectionTitlesEquivalent(t, p)),
  )
  const repaired = tryRepairMarkdownProposalFromDisk(
    originalOnDisk,
    normalizedProposal,
    resolvedPath,
  )
  const base: MarkdownProposalRepairDiagnostics = {
    crushed,
    originalLines: countNonemptyLines(originalOnDisk),
    proposalLines: countNonemptyLines(normalizedProposal),
    reflowed,
    reflowedLines: countNonemptyLines(proposed),
    originalH2,
    proposalH2,
    missingH2,
    repaired,
  }
  if (repaired) return base

  if (!isMarkdownOrPlainTextPath(resolvedPath)) {
    return { ...base, repairSkipReason: 'not_markdown' }
  }
  if (!originalOnDisk.trim() || !normalizedProposal.trim()) {
    return { ...base, repairSkipReason: 'empty' }
  }
  if (markdownHeadingsFrom(originalOnDisk).length < 2) {
    return { ...base, repairSkipReason: 'few_original_headings' }
  }
  if (proposalH2.length === 0) {
    if (isTitleOnlyMarkdownStub(originalOnDisk, normalizedProposal)) {
      return { ...base, repairSkipReason: 'title_only_stub' }
    }
    return { ...base, repairSkipReason: 'no_h2_in_proposal' }
  }
  if (repaired === null && !crushed) {
    return { ...base, repairSkipReason: 'already_complete' }
  }
  if (repaired === null && crushed) {
    const hasDiskMatch = proposalH2.some((t) =>
      findH2SectionRange(originalOnDisk.split(/\r?\n/), t),
    )
    if (!hasDiskMatch) {
      return { ...base, repairSkipReason: 'h2_not_found_on_disk' }
    }
    if (proposalH2.length > 0 && missingH2.length === 0) {
      return { ...base, repairSkipReason: 'repaired_still_crushed' }
    }
    return { ...base, repairSkipReason: 'repaired_still_crushed' }
  }
  return base
}

/** One-line summary for dev console / optional tool errors (GROKFORGE_AGENT_EDIT_DEBUG=1). */
export function formatMarkdownProposalDiagnostics(d: MarkdownProposalRepairDiagnostics): string {
  const parts = [
    `crushed=${d.crushed}`,
    `lines=${d.proposalLines}${d.reflowed ? `→${d.reflowedLines}` : ''}`,
    `onDiskH2=[${d.originalH2.join(', ')}]`,
    `proposalH2=[${d.proposalH2.join(', ')}]`,
  ]
  if (d.missingH2.length > 0) parts.push(`missingH2=[${d.missingH2.join(', ')}]`)
  if (d.repaired) parts.push('repair=ok')
  else if (d.repairSkipReason) parts.push(`repairSkip=${d.repairSkipReason}`)
  return parts.join('; ')
}

export function isAgentEditDiagnosticsInToolErrorsEnabled(): boolean {
  return (
    process.env.GROKFORGE_AGENT_EDIT_DEBUG === '1' ||
    process.env.GROKFORGE_AGENT_EDIT_DEBUG === 'true'
  )
}

function normalizeH2Title(line: string): string | null {
  const match = line.match(/^##\s+(.+?)\s*$/)
  return match ? match[1].trim() : null
}

function findH2SectionRange(lines: string[], title: string): { start: number; bodyStart: number; end: number } | null {
  const target = title.trim()
  for (let i = 0; i < lines.length; i += 1) {
    const heading = normalizeH2Title(lines[i] ?? '')
    if (heading !== target) continue
    const bodyStart = i + 1
    let end = lines.length
    for (let j = bodyStart; j < lines.length; j += 1) {
      if (/^##\s+/.test(lines[j] ?? '')) {
        end = j
        break
      }
    }
    return { start: i, bodyStart, end }
  }
  return null
}

function extractMarkdownSectionBody(md: string, title: string): string | null {
  const lines = md.split(/\r?\n/)
  const range = findH2SectionRange(lines, title)
  if (!range) return null
  const body = lines.slice(range.bodyStart, range.end).join('\n').replace(/\s+$/, '')
  return body.length > 0 || range.end > range.bodyStart ? body : ''
}

/** Keep trailing non-bullet lines from the original section (e.g. prose after bullets). */
function mergeSectionBodyPreservingTail(originalBody: string, proposedBody: string): string {
  const originalLines = originalBody.split(/\r?\n/)
  let lastBulletIdx = -1
  for (let i = 0; i < originalLines.length; i += 1) {
    const trimmed = (originalLines[i] ?? '').trim()
    if (trimmed.startsWith('-')) lastBulletIdx = i
  }
  if (lastBulletIdx < 0) return proposedBody
  const tailLines = originalLines.slice(lastBulletIdx + 1)
  const tail = tailLines.join('\n').trim()
  if (!tail || proposedBody.includes(tail)) return proposedBody
  return `${proposedBody.replace(/\s+$/, '')}\n\n${tail}`
}

function replaceMarkdownSectionBody(doc: string, title: string, newBody: string): string {
  const lines = doc.split(/\r?\n/)
  const range = findH2SectionRange(lines, title)
  if (!range) return doc
  const originalBody = lines.slice(range.bodyStart, range.end).join('\n')
  const mergedBody = mergeSectionBodyPreservingTail(originalBody, newBody)
  const next = [
    ...lines.slice(0, range.bodyStart),
    ...mergedBody.split(/\r?\n/),
    ...lines.slice(range.end),
  ]
  return next.join('\n')
}

/**
 * When the model sends a partial markdown proposal (e.g. only Tech Stack bullets),
 * merge those sections into the on-disk file instead of rejecting the turn.
 */
export function tryRepairMarkdownProposalFromDisk(
  originalOnDisk: string,
  normalizedProposal: string,
  resolvedPath: string,
): string | null {
  if (!isMarkdownOrPlainTextPath(resolvedPath)) return null
  if (!originalOnDisk.trim() || !normalizedProposal.trim()) return null

  let proposed = normalizedProposal
  if (proposed.split(/\r?\n/).length <= 3 || hasOverlongSourceLines(proposed, 200)) {
    proposed = reflowMarkdownDocumentLineBreaks(proposed)
  }

  const originalHeadings = markdownHeadingsFrom(originalOnDisk)
  if (originalHeadings.length < 2) return null

  const proposedH2 = markdownH2TitlesFrom(proposed)
  if (proposedH2.length === 0) {
    const bulletRepaired = tryRepairBulletOnlyMarkdownProposal(originalOnDisk, proposed)
    if (
      bulletRepaired &&
      !isUnacceptableCrushedMarkdownProposal(originalOnDisk, bulletRepaired, resolvedPath)
    ) {
      return bulletRepaired
    }
    return null
  }

  let out = originalOnDisk
  let changed = false
  for (const title of proposedH2) {
    const body = extractMarkdownSectionBody(proposed, title)
    if (body === null) continue
    const next = replaceMarkdownSectionBody(out, title, body)
    if (next !== out) changed = true
    out = next
  }

  if (!changed) {
    const bulletRepaired = tryRepairBulletOnlyMarkdownProposal(originalOnDisk, proposed)
    if (
      bulletRepaired &&
      !isUnacceptableCrushedMarkdownProposal(originalOnDisk, bulletRepaired, resolvedPath)
    ) {
      return bulletRepaired
    }
    return null
  }
  if (isUnacceptableCrushedMarkdownProposal(originalOnDisk, out, resolvedPath)) return null
  return out
}

/** Reject markdown proposals that are still a crushed stub after normalize. */
export function isUnacceptableCrushedMarkdownProposal(
  originalOnDisk: string,
  normalizedProposal: string,
  resolvedPath: string,
): boolean {
  if (!isMarkdownOrPlainTextPath(resolvedPath)) return false
  const originalLines = originalOnDisk.split(/\r?\n/).filter((l) => l.trim().length > 0).length
  const proposalLines = normalizedProposal.split(/\r?\n/).filter((l) => l.trim().length > 0).length
  if (originalLines < 4) return false
  if (proposalLines <= 2) return true
  if (hasOverlongSourceLines(normalizedProposal, 200)) return true
  const lineRatio = proposalLines / Math.max(originalLines, 1)
  if (lineRatio < 0.4) return true

  const originalH2 = markdownH2TitlesFrom(originalOnDisk)
  if (originalH2.length >= 2) {
    const proposalH2 = markdownH2TitlesFrom(normalizedProposal)
    if (proposalH2.length === 0 && proposalLines < originalLines * 0.5) return true
    const missingH2 = countMissingOriginalH2Sections(originalOnDisk, normalizedProposal)
    const lineRatio = proposalLines / Math.max(originalLines, 1)
    if (missingH2 > 0 && lineRatio < 0.85) return true
    if (missingH2 >= 2) return true
    if (missingH2 === originalH2.length && proposalH2.length === 0) return true
  }
  return false
}

const JAVASCRIPT_PROPOSAL_FORMAT_RETRY_HINT =
  ' For .js files: write_file.content must be multi-line readable source — one statement per line; no minified one-liner; no glued }function or });); no code after // on the same line; no orphan ) lines by themselves.'

export function formatProposalValidationError(
  rejected: Array<{ path: string; reason: string }>,
): string {
  if (rejected.length === 0) return 'No proposal operations passed workspace validation.'
  const base = rejected.map((r) => `${r.path}: ${r.reason}`).join(' ')
  const needsJsHint = rejected.some(
    (r) =>
      /\.(m?js|cjs)$/i.test(r.path.replace(/\\/g, '/')) &&
      /crushed|corrupt|orphan|glued/i.test(r.reason),
  )
  return needsJsHint ? `${base}${JAVASCRIPT_PROPOSAL_FORMAT_RETRY_HINT}` : base
}
