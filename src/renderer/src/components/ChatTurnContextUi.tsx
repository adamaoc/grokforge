import type { ReactNode } from 'react'
import { ChevronDown, Folder, Mic } from 'lucide-react'
import type { ChatTurnContextV1, GrokProjectManifest, Root } from '@/types'
import { cn } from '@/lib/utils'
import { ModelBadge } from '@/components/grokforge/ModelBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatModelIntentLabel } from '@/lib/chat-turn-context'

function compactFileLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return path
  return `${parts.at(-2)}/${parts.at(-1)}`
}

function chatVoiceChromeClass(source: ChatTurnContextV1['source'] | undefined): string {
  if (source === 'voice') {
    return 'border-violet-800/55 bg-violet-950/25'
  }
  return 'border-zinc-800/90 bg-zinc-900/50'
}

export function ChatLiveContextStrip({
  project,
  activeRoot,
  activeFilePath,
  pinnedCount = 0,
  conversationMode,
  chatModelIntent,
  displayThreadModel,
}: {
  project: GrokProjectManifest
  activeRoot: Root | null
  activeFilePath: string | null | undefined
  pinnedCount?: number
  conversationMode: 'normal' | 'plan'
  chatModelIntent: 'chat_default' | 'planning' | 'execution'
  displayThreadModel: string
}) {
  const chatMode: 'fast' | 'plan' = conversationMode === 'plan' ? 'plan' : 'fast'

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-2.5 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Next send</span>
        <ModelBadge variant="pill" className="text-zinc-400" title="GrokForge model intent (manifest slot)">
          {chatModelIntent}
        </ModelBadge>
        <span className="text-zinc-600">·</span>
        <span className="text-zinc-400">{formatModelIntentLabel(chatModelIntent)}</span>
        <span className="text-zinc-600">·</span>
        <ModelBadge variant="pill" title="Resolved xAI model id" className="max-w-[min(100%,14rem)] text-zinc-400">
          {displayThreadModel}
        </ModelBadge>
        <span className="text-zinc-600">·</span>
        <span className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
          Agent mode: {chatMode}
        </span>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-zinc-800/80 pt-2">
        <Folder size={12} className="shrink-0 text-zinc-500" aria-hidden />
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Roots</span>
        <span className="min-w-0 text-zinc-300">
          {project.roots.map((r) => r.label).join(', ')}
        </span>
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        <span className="shrink-0 text-zinc-600">Active root</span>
        <span className="min-w-0 truncate text-zinc-300">{activeRoot?.label ?? '—'}</span>
        {activeFilePath?.trim() ? (
          <>
            <span className="text-zinc-600">·</span>
            <span className="shrink-0 text-zinc-600">File</span>
            <span className="min-w-0 truncate font-mono text-[10px] text-zinc-400" title={activeFilePath}>
              {compactFileLabel(activeFilePath)}
            </span>
          </>
        ) : null}
        {pinnedCount > 0 ? (
          <>
            <span className="text-zinc-600">·</span>
            <span className="shrink-0 text-zinc-600">Pinned</span>
            <span className="text-zinc-400">
              {pinnedCount} path{pinnedCount === 1 ? '' : 's'}
            </span>
          </>
        ) : null}
      </div>
    </div>
  )
}

function TurnContextDetailsBody({ tc }: { tc: ChatTurnContextV1 }) {
  return (
    <div className="max-h-72 min-w-0 space-y-3 overflow-y-auto custom-scrollbar p-1 text-xs text-zinc-300">
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Source</div>
        <div className="font-mono text-[11px]">{tc.source}</div>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Model intent</div>
        <div className="font-mono text-[11px]">{tc.modelIntent}</div>
      </div>
      {tc.chatMode ? (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Agent chat mode</div>
          <div className="font-mono text-[11px]">{tc.chatMode}</div>
        </div>
      ) : null}
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Active root</div>
        <div className="break-all font-mono text-[10px] text-zinc-400">
          {tc.activeRootLabel ?? '—'}
          {tc.activeRootId ? <span className="block text-zinc-500">id: {tc.activeRootId}</span> : null}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Active file</div>
        <div className="break-all font-mono text-[10px] text-zinc-400">{tc.activeFilePath ?? '—'}</div>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Workspace roots</div>
        <ul className="space-y-2">
          {tc.roots.map((r) => (
            <li key={r.id} className="rounded-md border border-zinc-800/80 bg-zinc-950/50 px-2 py-1.5">
              <div className="text-zinc-200">{r.label}</div>
              <div className="break-all font-mono text-[10px] text-zinc-500">{r.path}</div>
              <div className="font-mono text-[10px] text-zinc-600">id: {r.id}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function UserMessageContextRow({ turnContext, model }: { turnContext: ChatTurnContextV1; model?: string }) {
  const voice = turnContext.source === 'voice'
  return (
    <div
      className={cn(
        'mt-2 flex min-w-0 flex-col gap-1.5 rounded-lg border px-2.5 py-2',
        chatVoiceChromeClass(turnContext.source),
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {voice ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-800/70 bg-violet-950/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200/95">
            <Mic size={11} aria-hidden />
            Voice
          </span>
        ) : (
          <>
            <ModelBadge variant="pill" className="text-zinc-500" title="Model intent">
              {turnContext.modelIntent}
            </ModelBadge>
            {turnContext.chatMode ? (
              <span className="rounded-md border border-zinc-800 bg-zinc-950/50 px-1.5 py-0.5 text-[10px] text-zinc-500">
                {turnContext.chatMode}
              </span>
            ) : null}
          </>
        )}
        {model ? (
          <ModelBadge variant="pill" title="Resolved xAI model id" className="max-w-[min(100%,12rem)] text-zinc-500">
            {model}
          </ModelBadge>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ms-auto h-7 shrink-0 gap-1 rounded-lg px-2 text-[10px] text-zinc-500 hover:text-zinc-200"
            >
              Details
              <ChevronDown size={12} aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 border-zinc-800 bg-zinc-950 text-zinc-200">
            <DropdownMenuLabel className="text-xs font-normal text-zinc-500">Turn context</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem className="cursor-default p-0 focus:bg-transparent" onSelect={(e) => e.preventDefault()}>
              <TurnContextDetailsBody tc={turnContext} />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">
        {turnContext.roots.map((r) => {
          const active = turnContext.activeRootId !== null && r.id === turnContext.activeRootId
          return (
            <span
              key={r.id}
              className={cn(
                'max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-medium',
                active ? 'border-gf-accent/50 bg-gf-accent/10 text-gf-accent' : 'border-zinc-700/90 bg-zinc-950/60 text-zinc-400',
              )}
              title={r.path}
            >
              {r.label}
            </span>
          )
        })}
      </div>
      {turnContext.activeFilePath ? (
        <div className="truncate font-mono text-[10px] text-zinc-500" title={turnContext.activeFilePath}>
          File: {compactFileLabel(turnContext.activeFilePath)}
        </div>
      ) : null}
    </div>
  )
}

export function AssistantMessageContextFooter({
  turnContext,
  model,
  leadingActions,
}: {
  turnContext?: ChatTurnContextV1
  model?: string
  leadingActions: ReactNode
}) {
  const voice = turnContext?.source === 'voice'
  return (
    <div
      className={cn(
        'mt-2 flex min-w-0 flex-nowrap items-center gap-2 border-t pt-1.5',
        voice ? 'border-violet-900/40' : 'border-zinc-800/80',
      )}
    >
      <div className="flex shrink-0 items-center gap-0.5">{leadingActions}</div>
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden ps-1">
        {turnContext ? (
          <>
            {voice ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-800/70 bg-violet-950/35 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200/90">
                <Mic size={11} aria-hidden />
                Voice
              </span>
            ) : (
              <ModelBadge variant="pill" title="GrokForge model intent" className="shrink-0 text-zinc-500">
                {turnContext.modelIntent}
              </ModelBadge>
            )}
            {turnContext.source === 'text' && turnContext.chatMode ? (
              <span className="shrink-0 rounded-md border border-zinc-800 bg-zinc-950/50 px-1.5 py-0.5 text-[10px] text-zinc-500">
                {turnContext.chatMode}
              </span>
            ) : null}
            {model ? (
              <ModelBadge variant="pill" title={model} className="min-w-0 text-zinc-500">
                {model}
              </ModelBadge>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-0.5 rounded-lg px-1.5 text-[10px] text-zinc-500 hover:text-zinc-200"
                >
                  Details
                  <ChevronDown size={12} aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 border-zinc-800 bg-zinc-950 text-zinc-200">
                <DropdownMenuLabel className="text-xs font-normal text-zinc-500">Turn context</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem
                  className="cursor-default p-0 focus:bg-transparent"
                  onSelect={(e) => e.preventDefault()}
                >
                  <TurnContextDetailsBody tc={turnContext} />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : model ? (
          <>
            {model.startsWith('grok-voice') ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-800/70 bg-violet-950/35 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200/90">
                <Mic size={11} aria-hidden />
                Voice
              </span>
            ) : null}
            <ModelBadge variant="pill" title={model} className="min-w-0 text-zinc-500">
              {model}
            </ModelBadge>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function AgentActivityTurnContextBanner({ turnContext }: { turnContext: ChatTurnContextV1 }) {
  return (
    <div className="mb-2 rounded-lg border border-zinc-800/90 bg-zinc-950/50 px-2 py-1.5 text-[11px] text-zinc-400">
      <span className="font-medium text-zinc-500">Turn scope · </span>
      <span className="text-zinc-300">{turnContext.roots.map((r) => r.label).join(', ')}</span>
      {turnContext.activeRootLabel ? (
        <span className="text-zinc-500">
          {' '}
          · Active: <span className="text-gf-accent">{turnContext.activeRootLabel}</span>
        </span>
      ) : null}
      {turnContext.activeFilePath ? (
        <span className="block truncate font-mono text-[10px] text-zinc-500" title={turnContext.activeFilePath}>
          {compactFileLabel(turnContext.activeFilePath)}
        </span>
      ) : null}
    </div>
  )
}
