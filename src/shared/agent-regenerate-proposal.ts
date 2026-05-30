export type RegenerateProposalPath = {
  path: string
  action: 'write' | 'delete'
}

export type RegenerateProposalRejectedPath = {
  path: string
  reason: string
}

export type BuildRegenerateProposalMessageInput = {
  originalUserRequest?: string
  paths: RegenerateProposalPath[]
  safetySummaries?: string[]
  rejectedPaths?: RegenerateProposalRejectedPath[]
}

const MAX_USER_REQUEST_CHARS = 4_000
const MAX_PATHS_LISTED = 24

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function buildRegenerateProposalMessage(input: BuildRegenerateProposalMessageInput): string {
  const lines: string[] = [
    'I rejected the previous edit proposal. Please produce a new proposal that fixes the issues below.',
    '',
  ]

  if (input.originalUserRequest?.trim()) {
    lines.push('Original request (still what I want):')
    lines.push(truncate(input.originalUserRequest.trim(), MAX_USER_REQUEST_CHARS))
    lines.push('')
  }

  const listedPaths = input.paths.slice(0, MAX_PATHS_LISTED)
  if (listedPaths.length > 0) {
    lines.push('Paths from the rejected proposal:')
    for (const item of listedPaths) {
      lines.push(`- ${item.path} (${item.action})`)
    }
    if (input.paths.length > MAX_PATHS_LISTED) {
      lines.push(`- …and ${input.paths.length - MAX_PATHS_LISTED} more`)
    }
    lines.push('')
  }

  if (input.safetySummaries?.length) {
    lines.push('Why I am asking for a revision:')
    for (const summary of input.safetySummaries.slice(0, 8)) {
      lines.push(`- ${summary}`)
    }
    lines.push('')
  }

  if (input.rejectedPaths?.length) {
    lines.push('Paths GrokForge rejected in the last proposal:')
    for (const item of input.rejectedPaths.slice(0, 8)) {
      lines.push(`- ${item.path}: ${item.reason}`)
    }
    lines.push('')
  }

  lines.push(
    'Before proposing again:',
    '1. Call read_file on each existing file you will modify in this same turn (use contentHash from the result).',
    '2. Make the smallest faithful change that satisfies the original request; do not rewrite unrelated sections.',
    '3. Prefer the primary `edit` tool for modifications to existing files; use propose_file_edits write_file for new files or explicit full rewrites. Always include expectedContentHash on existing paths.',
    '4. Do not repeat the same full-file rewrite unless a deliberate whole-file change is required.',
  )

  return lines.join('\n')
}
