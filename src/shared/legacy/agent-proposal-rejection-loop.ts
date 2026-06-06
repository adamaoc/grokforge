/**
 * Per-path proposal rejection loop policy (story 151).
 * Unified counter for force-final when the same path fails repeatedly with no accepted proposal.
 */

/** Rejected proposal attempts on one path before forcing final answer (nudges fire at 2). */
export const PROPOSAL_REJECTIONS_BEFORE_FORCE_FINAL = 3

function normalizeProposalRejectionPath(resolvedPath: string): string {
  return resolvedPath.replace(/\\/g, '/')
}

export function recordProposalRejection(map: Map<string, number>, resolvedPath: string): void {
  const key = normalizeProposalRejectionPath(resolvedPath)
  map.set(key, (map.get(key) ?? 0) + 1)
}

export function pathsAtProposalRejectionForceFinalThreshold(
  map: ReadonlyMap<string, number>,
  threshold = PROPOSAL_REJECTIONS_BEFORE_FORCE_FINAL,
): string[] {
  return [...map.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([path]) => path)
}

export function shouldForceFinalForRepeatedProposalRejections(input: {
  editProposalCreated: boolean
  rejectionsByPath: ReadonlyMap<string, number>
  threshold?: number
}): boolean {
  if (input.editProposalCreated) return false
  const threshold = input.threshold ?? PROPOSAL_REJECTIONS_BEFORE_FORCE_FINAL
  for (const count of input.rejectionsByPath.values()) {
    if (count >= threshold) return true
  }
  return false
}

/** Best-effort path extraction from propose_file_edits / write batch tool args (incl. malformed). */
export function extractPathsFromEditToolArguments(raw: unknown): string[] {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      return []
    }
  }
  if (!parsed || typeof parsed !== 'object') return []
  const obj = parsed as Record<string, unknown>
  const ops = obj.operations
  if (!Array.isArray(ops)) return []
  const paths: string[] = []
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue
    const path = (op as { path?: unknown }).path
    if (typeof path === 'string' && path.trim()) {
      paths.push(path.trim())
    }
  }
  return paths
}

export function basenameForProposalRejectionPath(resolvedPath: string): string {
  const parts = resolvedPath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? resolvedPath
}
