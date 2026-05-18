import { cn } from '@/lib/utils'
import { useAgentChatActivityOptional } from '@/context/AgentChatActivityProvider'

type WelcomeRecentsAgentActivityTone = 'none' | 'running' | 'unread'

function toneForProject(
  activity: ReturnType<typeof useAgentChatActivityOptional>,
  projectId: string,
): WelcomeRecentsAgentActivityTone {
  if (!activity) return 'none'
  return activity.activityForProject(projectId)
}

/** xAI Grok “G” mark — paths from product SVG; `currentColor` for theme accent. */
function GrokMarkSvg({ className }: { className?: string }) {
  return (
    <svg
      className={cn('shrink-0 text-inherit', className)}
      width="35"
      height="33"
      viewBox="0 0 35 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M13.2371 21.0407L24.3186 12.8506C24.8619 12.4491 25.6384 12.6057 25.8973 13.2294C27.2597 16.5185 26.651 20.4712 23.9403 23.1851C21.2297 25.8989 17.4581 26.4941 14.0108 25.1386L10.2449 26.8843C15.6463 30.5806 22.2053 29.6665 26.304 25.5601C29.5551 22.3051 30.562 17.8683 29.6205 13.8673L29.629 13.8758C28.2637 7.99809 29.9647 5.64871 33.449 0.844576C33.5314 0.730667 33.6139 0.616757 33.6964 0.5L29.1113 5.09055V5.07631L13.2343 21.0436"
        fill="currentColor"
      />
      <path
        d="M10.9503 23.0313C7.07343 19.3235 7.74185 13.5853 11.0498 10.2763C13.4959 7.82722 17.5036 6.82767 21.0021 8.2971L24.7595 6.55998C24.0826 6.07017 23.215 5.54334 22.2195 5.17313C17.7198 3.31926 12.3326 4.24192 8.67479 7.90126C5.15635 11.4239 4.0499 16.8403 5.94992 21.4622C7.36924 24.9165 5.04257 27.3598 2.69884 29.826C1.86829 30.7002 1.0349 31.5745 0.36364 32.5L10.9474 23.0341"
        fill="currentColor"
      />
    </svg>
  )
}

const MARK_SIZE: Record<'default' | 'toolbar', string> = {
  /** Standalone / loose layouts */
  default: 'h-[0.7rem] w-[calc(0.7rem*35/33)] shrink-0',
  /** Match lucide `size={14}` inside `h-8 w-8` ghost icon buttons */
  toolbar: 'h-[14px] w-[calc(14px*35/33)] shrink-0',
}

export function WelcomeRecentsAgentActivity({
  projectId,
  className,
  density = 'default',
}: {
  projectId: string
  className?: string
  /** `toolbar`: same visual weight as 14px icons in recent-project action row */
  density?: 'default' | 'toolbar'
}) {
  const activity = useAgentChatActivityOptional()
  const tone = toneForProject(activity, projectId)
  const markSize = MARK_SIZE[density]

  if (tone === 'none') {
    return (
      <span aria-hidden className={cn('inline-flex shrink-0 text-zinc-600 opacity-[0.55]', className)}>
        <GrokMarkSvg className={markSize} />
      </span>
    )
  }

  if (tone === 'running') {
    return (
      <span
        className={cn('relative inline-flex shrink-0 items-center justify-center text-gf-accent', className)}
        aria-label="Assistant is responding"
        title="Assistant is responding"
      >
        <span
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center opacity-50',
            'motion-safe:animate-ping motion-reduce:animate-none',
          )}
          aria-hidden
        >
          <GrokMarkSvg className={markSize} />
        </span>
        <GrokMarkSvg className={cn(markSize, 'relative drop-shadow-[0_0_4px_var(--gf-accent)]')} />
      </span>
    )
  }

  return (
    <span
      className={cn('inline-flex shrink-0 text-gf-accent', className)}
      aria-label="New assistant reply"
      title="New assistant reply"
    >
      <GrokMarkSvg className={cn(markSize, 'drop-shadow-[0_0_5px_var(--gf-accent)]')} />
    </span>
  )
}
