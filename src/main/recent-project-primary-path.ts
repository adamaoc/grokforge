import { resolve } from 'node:path'
import type { GrokProjectManifest } from './manifest'
import { RECENT_PROJECT_PRIMARY_ROOT_PATH_MAX_LEN } from '../shared/recent-projects-contract'

/** First root path, resolved absolute, capped for MRU JSON size. */
export function primaryRootPathFromManifest(manifest: GrokProjectManifest): string | undefined {
  const first = manifest.roots[0]
  if (!first?.path?.trim()) return undefined
  const abs = resolve(first.path.trim())
  return abs.length > RECENT_PROJECT_PRIMARY_ROOT_PATH_MAX_LEN
    ? abs.slice(0, RECENT_PROJECT_PRIMARY_ROOT_PATH_MAX_LEN)
    : abs
}
