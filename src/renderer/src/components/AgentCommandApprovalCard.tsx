import { useState } from 'react'
import { AlertTriangle, Ban, Check, CheckCheck, Copy, FileDiff, Play, ShieldQuestion, Trash2 } from 'lucide-react'
import type { AgentCommandApprovalRequest } from '@/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { InlineLineDiff } from '@/components/InlineLineDiff'
import type { AgentPermissionDiff } from '../../../shared/agent/chat-contract'
import { computeLineDiff, countLineDiff } from '../../../shared/diff/line-diff'

export type ApprovalScope = 'once' | 'turn'

type Tone = 'accent' | 'amber' | 'red'

function relativeToRoot(path: string, rootPath: string): string {
  const root = rootPath.replace(/[\\/]+$/, '')
  if (path === root) return '.'
  if (path.startsWith(`${root}/`) || path.startsWith(`${root}\\`)) return path.slice(root.length + 1)
  return path
}

function toneFor(request: AgentCommandApprovalRequest): Tone {
  if (request.risk === 'soft_risk') return 'red'
  if ((request.kind ?? 'command') === 'command') return 'amber'
  return 'accent'
}

const TONE_CLASSES: Record<Tone, { card: string; icon: string; sub: string }> = {
  accent: {
    card: 'border-primary/40 bg-zinc-900/70',
    icon: 'text-gf-accent',
    sub: 'text-zinc-400',
  },
  amber: {
    card: 'border-amber-900/50 bg-amber-950/20',
    icon: 'text-amber-300',
    sub: 'text-amber-200/90',
  },
  red: {
    card: 'border-red-900/60 bg-red-950/25',
    icon: 'text-red-300',
    sub: 'text-red-200/90',
  },
}

function DiffBlock({ diff, rootPath }: { diff: AgentPermissionDiff; rootPath: string }) {
  const stats = countLineDiff(computeLineDiff(diff.oldText, diff.newText))
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80" data-agent-permission-diff="">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-zinc-800 px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <FileDiff size={12} className="shrink-0 text-zinc-500" aria-hidden />
          <span className="truncate font-mono text-[11px] text-zinc-200" title={diff.path}>
            {relativeToRoot(diff.path, rootPath)}
          </span>
          {diff.oldText == null ? (
            <span className="shrink-0 rounded-full border border-emerald-800/60 px-1.5 text-[9px] uppercase tracking-wide text-emerald-300">
              new
            </span>
          ) : null}
        </div>
        <span className="shrink-0 font-mono text-[10px]">
          <span className="text-emerald-400">+{stats.added}</span>{' '}
          <span className="text-red-400">−{stats.removed}</span>
        </span>
      </div>
      <InlineLineDiff before={diff.oldText} after={diff.newText} lineOffset={(diff.startLine ?? 1) - 1} />
    </div>
  )
}

type Props = {
  request: AgentCommandApprovalRequest
  onApprove: (request: AgentCommandApprovalRequest, scope: ApprovalScope) => void
  onReject: (request: AgentCommandApprovalRequest) => void
  onCopy: (request: AgentCommandApprovalRequest) => void
}

/**
 * Approval card for agent requests: file edits (with diffs), commands, and other
 * permissions. Tone follows risk: accent for edits, amber for commands, red for deletes.
 */
export function AgentCommandApprovalCard({ request, onApprove, onReject, onCopy }: Props) {
  const [softRiskAck, setSoftRiskAck] = useState(false)
  const kind = request.kind ?? 'command'
  const diffs = request.diffs ?? []
  const tone = toneFor(request)
  const toneClasses = TONE_CLASSES[tone]
  const needsSoftAck = request.risk === 'soft_risk'
  const approveDisabled = needsSoftAck && !softRiskAck
  const agent = request.providerLabel ?? 'The agent'
  const isDelete = needsSoftAck && kind === 'edit'

  const heading =
    kind === 'edit'
      ? isDelete
        ? `${agent} wants to delete a file`
        : `${agent} wants to edit ${diffs.length > 1 ? `${diffs.length} files` : 'a file'}`
      : kind === 'permission'
        ? `${agent} is asking`
        : `Run this command?`
  const HeadingIcon = isDelete ? Trash2 : kind === 'edit' ? FileDiff : kind === 'permission' ? ShieldQuestion : AlertTriangle
  const showRequestBlock = kind !== 'edit' || diffs.length === 0

  return (
    <div
      className={cn('rounded-2xl border px-3 py-3 text-sm text-zinc-300', toneClasses.card)}
      data-agent-command-approval=""
    >
      <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <HeadingIcon size={16} className={cn('mt-0.5 shrink-0', toneClasses.icon)} aria-hidden />
          <div className="min-w-0">
            <div className="text-sm font-medium text-white">{heading}</div>
            <div className={cn('mt-0.5 text-xs', toneClasses.sub)}>{request.policyReason}</div>
          </div>
        </div>
        {request.timeoutMs > 0 ? (
          <span className="shrink-0 rounded-full border border-amber-800/60 px-2 py-0.5 font-mono text-[10px] text-amber-200/90">
            {Math.round(request.timeoutMs / 1000)}s timeout
          </span>
        ) : null}
      </div>

      {request.warning ? (
        <div className="mb-2 rounded-xl border border-amber-700/50 bg-amber-950/30 px-2.5 py-2 text-xs leading-relaxed text-amber-100/95">
          {request.warning}
        </div>
      ) : null}

      <div className="space-y-2">
        {diffs.map((diff) => (
          <DiffBlock key={diff.path} diff={diff} rootPath={request.rootPath} />
        ))}
        {showRequestBlock ? (
          <pre className="custom-scrollbar max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950/80 px-2 py-2 font-mono text-[11px] leading-relaxed text-zinc-200">
            {request.command}
          </pre>
        ) : null}
        {kind === 'command' ? (
          <p className="truncate text-[11px] text-zinc-500" title={request.rootPath}>
            in <span className="text-zinc-300">{request.rootLabel}</span>
            {request.purpose && request.purpose !== request.command ? <> · {request.purpose}</> : null}
          </p>
        ) : null}
      </div>

      {needsSoftAck ? (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-red-100/90">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-red-700 bg-zinc-950"
            checked={softRiskAck}
            onChange={(e) => setSoftRiskAck(e.target.checked)}
          />
          <span>
            {isDelete
              ? 'I understand this permanently removes a file from the project (you can still undo the turn).'
              : 'I understand this command may delete files or run elevated shell actions under the requested workspace root.'}
          </span>
        </label>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-xl"
          disabled={approveDisabled}
          onClick={() => onApprove(request, 'once')}
        >
          {kind === 'edit' ? (
            <>
              <Check size={13} aria-hidden /> Allow edit
            </>
          ) : (
            <>
              <Play size={13} aria-hidden /> {kind === 'permission' ? 'Allow' : 'Run'}
            </>
          )}
        </Button>
        {kind === 'edit' && !isDelete ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-xl border-zinc-700"
            onClick={() => onApprove(request, 'turn')}
            title="Allow this edit and any further edits until the agent finishes this turn"
          >
            <CheckCheck size={13} aria-hidden /> Allow all edits this turn
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-xl border-zinc-700"
          onClick={() => onReject(request)}
        >
          <Ban size={13} aria-hidden /> Reject
        </Button>
        {kind === 'command' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-xl text-zinc-400 hover:bg-zinc-900 hover:text-white"
            onClick={() => onCopy(request)}
          >
            <Copy size={13} aria-hidden /> Copy
          </Button>
        ) : null}
      </div>
    </div>
  )
}
