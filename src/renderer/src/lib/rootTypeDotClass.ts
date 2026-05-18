import type { Root } from '../types'

/** Matches workspace root list styling (code / docs / design / other). */
export function rootTypeDotClass(type: Root['type']): string {
  switch (type) {
    case 'code':
      return 'bg-gf-accent'
    case 'docs':
      return 'bg-blue-400'
    case 'design':
      return 'bg-purple-400'
    default:
      return 'bg-amber-400'
  }
}
