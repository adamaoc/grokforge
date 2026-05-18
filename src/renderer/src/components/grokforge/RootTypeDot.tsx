import type { Root } from '@/types'
import { rootTypeDotClass } from '@/lib/rootTypeDotClass'
import { cn } from '@/lib/utils'

const sizes = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
} as const

interface RootTypeDotProps {
  type: Root['type']
  size?: keyof typeof sizes
  className?: string
}

export function RootTypeDot({ type, size = 'md', className }: RootTypeDotProps) {
  return (
    <div
      className={cn('rounded-full flex-shrink-0', rootTypeDotClass(type), sizes[size], className)}
      aria-hidden
    />
  )
}
