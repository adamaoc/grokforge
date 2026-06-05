import type { DiffSession } from '@/types'
import { basenamePath } from './workspace-paths'
import { formatDiffSessionSummary, summarizeDiffSessionStats } from '../../../harness/diff/line-stats'
import type { AgentFileFocus } from '@/lib/agent-file-focus'

export type AgentContextCompanionSnapshot = {
  hasPendingProposal: boolean
  proposalPaths: string[]
  proposalApplied: boolean
  isLiveTurn: boolean
  liveActiveFilePath: string | null
  recentToolPaths: string[]
  agentFileFocus: AgentFileFocus | null
  canApplyProposal: boolean
  proposalBusy: boolean
}

export type AgentContextCompanionActions = {
  onReviewDiff?: () => void
  onApplyAll?: () => void
  onDiscard?: () => void
  onOpenFile?: (path: string) => void
}

export const EMPTY_AGENT_CONTEXT_COMPANION_SNAPSHOT: AgentContextCompanionSnapshot = {
  hasPendingProposal: false,
  proposalPaths: [],
  proposalApplied: false,
  isLiveTurn: false,
  liveActiveFilePath: null,
  recentToolPaths: [],
  agentFileFocus: null,
  canApplyProposal: false,
  proposalBusy: false,
}

export type AgentContextCompanionView = {
  kind: 'diff' | 'proposal' | 'live' | 'idle_file' | 'idle_empty'
  headline: string
  detail?: string
  primaryPath: string | null
  extraPaths: string[]
  showProposalAccent: boolean
  diffSummary?: string
}

function compactLabel(path: string): string {
  const base = basenamePath(path)
  if (base.length <= 36) return base
  return `…${base.slice(-34)}`
}

function uniquePaths(paths: string[], max: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of paths) {
    const key = p.replace(/\\/g, '/')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length >= max) break
  }
  return out
}

export function buildAgentContextCompanionView(input: {
  snapshot: AgentContextCompanionSnapshot
  activeFile: string | null
  diffSession: DiffSession | null
  activeFileDirty?: boolean
}): AgentContextCompanionView | null {
  const { snapshot, activeFile, diffSession, activeFileDirty } = input

  if (diffSession) {
    const stats = summarizeDiffSessionStats(diffSession.files)
    const primary = diffSession.files[0]?.path ?? null
    return {
      kind: 'diff',
      headline: primary ? compactLabel(primary) : 'Diff review',
      detail:
        diffSession.files.length > 1
          ? `${diffSession.files.length} files · ${formatDiffSessionSummary(diffSession.files.length, stats)}`
          : formatDiffSessionSummary(1, stats),
      primaryPath: primary,
      extraPaths: diffSession.files.slice(1, 4).map((f) => f.path),
      showProposalAccent: diffSession.source === 'agent-proposal',
      diffSummary: formatDiffSessionSummary(diffSession.files.length, stats),
    }
  }

  if (snapshot.hasPendingProposal && snapshot.proposalPaths.length > 0) {
    const paths = uniquePaths(snapshot.proposalPaths, 6)
    const primary = paths[0] ?? null
    const extra = paths.slice(1)
    return {
      kind: 'proposal',
      headline: snapshot.proposalApplied ? 'Applied edits' : 'Review proposed changes',
      detail:
        paths.length === 1
          ? compactLabel(paths[0]!)
          : `${paths.length} files${primary ? ` · ${compactLabel(primary)}` : ''}`,
      primaryPath: primary,
      extraPaths: extra,
      showProposalAccent: !snapshot.proposalApplied,
    }
  }

  if (snapshot.isLiveTurn) {
    const toolPaths = uniquePaths(snapshot.recentToolPaths, 3)
    const focusPath =
      snapshot.liveActiveFilePath ?? toolPaths[0] ?? snapshot.agentFileFocus?.path ?? null
    const headline = focusPath ? `Working on ${compactLabel(focusPath)}` : 'Agent working…'
    const detailParts: string[] = []
    if (toolPaths.length > 1) {
      detailParts.push(toolPaths.map(compactLabel).join(', '))
    } else if (snapshot.agentFileFocus?.reason === 'read' && focusPath) {
      detailParts.push('Recently read')
    }
    return {
      kind: 'live',
      headline,
      detail: detailParts.length ? detailParts.join(' · ') : undefined,
      primaryPath: focusPath,
      extraPaths: toolPaths.filter((p) => p !== focusPath),
      showProposalAccent: false,
    }
  }

  const lastTouch = snapshot.agentFileFocus?.path ?? null

  if (activeFile) {
    const dirty = activeFileDirty ? ' · unsaved' : ''
    return {
      kind: 'idle_file',
      headline: compactLabel(activeFile),
      detail: `Open in editor${dirty}`,
      primaryPath: activeFile,
      extraPaths: [],
      showProposalAccent: false,
    }
  }

  if (lastTouch) {
    return {
      kind: 'idle_empty',
      headline: 'No file selected',
      detail: `Last agent touch: ${compactLabel(lastTouch)}`,
      primaryPath: lastTouch,
      extraPaths: [],
      showProposalAccent: false,
    }
  }

  return {
    kind: 'idle_empty',
    headline: 'No file selected',
    detail: 'Open a file from the sidebar or ask the agent to edit one.',
    primaryPath: null,
    extraPaths: [],
    showProposalAccent: false,
  }
}
