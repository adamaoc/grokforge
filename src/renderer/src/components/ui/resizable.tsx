import { GripVertical } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'

import { cn } from '@/lib/utils'

const ResizablePanelGroup = ({ className, ...props }: React.ComponentProps<typeof Group>) => (
  <Group className={cn('flex h-full w-full min-h-0 min-w-0', className)} {...props} />
)

const ResizablePanel = Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
}) => (
  <Separator
    className={cn(
      'relative flex w-px shrink-0 items-center justify-center bg-zinc-800',
      'after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2',
      'outline-none focus-visible:ring-1 focus-visible:ring-gf-accent/80 focus-visible:ring-offset-0',
      'data-[separator=active]:bg-gf-accent/50 data-[separator=focus]:bg-zinc-700',
      'data-[separator=inactive]:hover:bg-zinc-700',
      className,
    )}
    {...props}
  >
    {withHandle ? (
      <div className="z-10 flex h-7 w-3.5 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 shadow-sm">
        <GripVertical className="h-3 w-3 text-zinc-500" aria-hidden />
      </div>
    ) : null}
  </Separator>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
