/** Map harness / internal activity titles to user-facing chat copy (story 142). */

const HARNESS_PREFIX_RE = /^Harness:\s*/i

const EXACT_TITLE_MAP: Record<string, string> = {
  'Harness: scaffold strategy conflict': 'Scaffold setup needs one approach',
  'Harness: edit scope': 'Focusing edits on the right files',
  'Harness: consolidate edits': 'Combining edits into one proposal',
  'Harness: proceed to edits': 'Ready to apply changes',
  'Harness: complete HTML required': 'Page markup needs to be complete',
  'Harness: retry rejected paths': 'Retrying files that did not apply',
  'Harness: verify scaffold output': 'Checking scaffold output',
  'Harness: edit tool budget exhausted': 'Edit attempts paused',
}

const PREFIX_TITLE_MAP: Array<{ prefix: string; label: string }> = [
  { prefix: 'Scaffold routing:', label: 'Scaffold routing' },
  { prefix: 'Edit path:', label: 'Edit approach' },
  { prefix: 'Scaffold output:', label: 'Scaffold check' },
]

export type ActivityDisplayTitle = {
  displayTitle: string
  technicalTitle?: string
}

export function mapActivityTitleForDisplay(title: string): ActivityDisplayTitle {
  const trimmed = title.trim()
  if (!trimmed) return { displayTitle: title }

  const exact = EXACT_TITLE_MAP[trimmed]
  if (exact) {
    return { displayTitle: exact, technicalTitle: trimmed }
  }

  if (HARNESS_PREFIX_RE.test(trimmed)) {
    const withoutPrefix = trimmed.replace(HARNESS_PREFIX_RE, '').trim()
    const humanized =
      withoutPrefix.charAt(0).toUpperCase() + withoutPrefix.slice(1)
    return { displayTitle: humanized, technicalTitle: trimmed }
  }

  for (const { prefix, label } of PREFIX_TITLE_MAP) {
    if (trimmed.startsWith(prefix)) {
      const rest = trimmed.slice(prefix.length).trim()
      const short = rest ? `${label}: ${rest}` : label
      return { displayTitle: short, technicalTitle: trimmed }
    }
  }

  if (/^Step \d+ of \d+$/i.test(trimmed)) {
    return { displayTitle: trimmed }
  }

  if (/ tool round$/i.test(trimmed)) {
    const detailMatch = trimmed.match(/^(?:Work|Plan|Executing plan \(model\))/)
    if (detailMatch) {
      return { displayTitle: 'Working…', technicalTitle: trimmed }
    }
  }

  return { displayTitle: trimmed }
}
