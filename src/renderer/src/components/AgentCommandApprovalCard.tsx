import { useMemo, useState } from 'react'
import { AlertTriangle, Ban, Check, Copy, FileDiff, Play, ShieldQuestion } from 'lucide-react'
import type { AgentCommandApprovalRequest } from '@/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AgentPermissionDiff } from '../../../shared/agent/chat-contract'
import { computeLineDiff, countLineDiff } from '../../../shared/diff/line-diff'

function relativeToRoot(path: string, rootPath: string): string {
  const root = rootPath.replace(/[\\/]+$/, '')
  if (path === root) return '.'
  if (path.startsWith(`${root}/`) || path.startsWith(`${root}\\`)) return path.slice(root.length + 1)
  return path
}

function PermissionDiffView({ diff, rootPath }: { diff: AgentPermissionDiff; rootPath: string }) {
  const rows = useMemo(() => computeLineDiff(diff.oldText, diff.newText), [diff.oldText, diff.newText])
  const stats = countLineDiff(rows)
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
      <div className="custom-scrollbar max-h-72 overflow-auto py-1 font-mono text-[11px] leading-[1.45]">
        {rows.map((row, idx) =>
          row.type === 'gap' ? (
            <div key={idx} className="px-2.5 py-0.5 text-[10px] text-zinc-600">
              ⋯ {row.hidden} unchanged line{row.hidden === 1 ? '' : 's'}
            </div>
          ) : (
            <div
              key={idx}
              className={cn(
                'flex whitespace-pre',
                row.type === 'add' && 'bg-emerald-950/50 text-emerald-100',
                row.type === 'del' && 'bg-red-950/40 text-red-200/90',
                row.type === 'context' && 'text-zinc-400',
              )}
            >
              <span className="w-9 shrink-0 select-none pr-2 text-right text-zinc-600">
                {row.type === 'del' ? row.oldLine : row.newLine}
              </span>
              <span className="w-3 shrink-0 select-none text-zinc-500">
                {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}
              </span>
              <span className="pr-3">{row.text || ' '}</span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function riskLabel(request: AgentCommandApprovalRequest): string {
  if (request.providerLabel) return request.providerLabel
  if (request.risk === 'network_or_install') return 'Network / install'
  if (request.risk === 'soft_risk') return 'Elevated risk'
  return 'Approval required'
}

function riskBannerClass(request: AgentCommandApprovalRequest): string {
  if (request.risk === 'network_or_install') {
    return 'border-amber-700/60 bg-amber-950/40 text-amber-100'
  }
  if (request.risk === 'soft_risk') {
    return 'border-red-900/50 bg-red-950/30 text-red-200/90'
  }
  return 'border-zinc-800/80 bg-zinc-950/40 text-zinc-300'
}

type Props = {
  request: AgentCommandApprovalRequest
  onApprove: (request: AgentCommandApprovalRequest) => void
  onReject: (request: AgentCommandApprovalRequest) => void
  onCopy: (request: AgentCommandApprovalRequest) => void
}

export function AgentCommandApprovalCard({
  request,
  onApprove,
  onReject,
  onCopy,
}: Props) {
  const [softRiskAck, setSoftRiskAck] = useState(false)
  const needsSoftAck = request.risk === 'soft_risk'
  const approveDisabled = needsSoftAck && !softRiskAck
  const kind = request.kind ?? 'command'
  const diffs = request.diffs ?? []
  const heading =
    kind === 'edit'
      ? `Review ${request.providerLabel ?? 'agent'} edit`
      : kind === 'permission'
        ? `${request.providerLabel ?? 'Agent'} is asking`
        : 'Approve agent command?'
  const HeadingIcon = kind === 'edit' ? FileDiff : kind === 'permission' ? ShieldQuestion : AlertTriangle
  const showCommandBlock = kind !== 'edit' || diffs.length === 0

  return (
    <div
      className="rounded-2xl border border-amber-900/50 bg-amber-950/20 px-3 py-3 text-sm text-zinc-300"
      data-agent-command-approval=""
    >
      <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <HeadingIcon size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
          <div className="min-w-0">
            <div className="text-sm font-medium text-white">{heading}</div>
            <div className="mt-0.5 text-xs text-amber-200/90">{riskLabel(request)}</div>
          </div>
        </div>
        {request.timeoutMs > 0 ? (
          <span className="shrink-0 rounded-full border border-amber-800/60 px-2 py-0.5 font-mono text-[10px] text-amber-200/90">
            {Math.round(request.timeoutMs / 1000)}s timeout
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          'mb-2 rounded-xl border px-2.5 py-2 text-xs leading-relaxed',
          riskBannerClass(request),
        )}
      >
        {request.policyReason}
      </div>

      {request.warning ? (
        <div className="mb-2 rounded-xl border border-amber-700/50 bg-amber-950/30 px-2.5 py-2 text-xs leading-relaxed text-amber-100/95">
          {request.warning}
        </div>
      ) : null}

      <div className="space-y-2">
        {diffs.map((diff) => (
          <PermissionDiffView key={diff.path} diff={diff} rootPath={request.rootPath} />
        ))}
        {showCommandBlock ? (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {kind === 'command' ? 'Command' : 'Request'}
            </div>
            <pre className="custom-scrollbar max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950/80 px-2 py-2 font-mono text-[11px] leading-relaxed text-zinc-200">
              {request.command}
            </pre>
          </div>
        ) : null}
        <div className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Root</div>
            <div className="truncate text-zinc-300">{request.rootLabel}</div>
            <div className="truncate font-mono text-[10px] text-zinc-500" title={request.rootPath}>
              {request.rootPath}
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">Purpose</div>
            <div className="line-clamp-2 text-zinc-300">{request.purpose}</div>
          </div>
        </div>
      </div>

      {needsSoftAck ? (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-amber-100/90">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-amber-700 bg-zinc-950"
            checked={softRiskAck}
            onChange={(e) => setSoftRiskAck(e.target.checked)}
          />
          <span>I understand this command may delete files or run elevated shell actions under the requested workspace root.</span>
        </label>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-xl"
          disabled={approveDisabled}
          onClick={() => onApprove(request)}
        >
          {kind === 'edit' ? (
            <>
              <Check size={13} aria-hidden /> Allow edit
            </>
          ) : (
            <>
              <Play size={13} aria-hidden /> {kind === 'permission' ? 'Allow' : 'Approve'}
            </>
          )}
        </Button>
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
