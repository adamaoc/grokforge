/**
 * Greenfield workspace detection (story 101).
 *
 * Heuristic v1:
 * 1. No stored index → greenfield only when retrievalMatchCount === 0.
 * 2. index.stats.fileCountScanned === 0 → greenfield.
 * 3. Else greenfield when fileCountScanned <= GREENFIELD_MAX_SCANNED_FILES,
 *    no package.json in intelligence.packages, and non-trivial file count <= GREENFIELD_MAX_NONTRIVIAL_FILES.
 */

/** Stable marker for tests and eval fixtures (must appear in greenfield planner appendix). */
export const GREENFIELD_HARNESS_MARKER = '## Greenfield workspace (harness 101)'

export const GREENFIELD_MAX_SCANNED_FILES = 12
export const GREENFIELD_MAX_NONTRIVIAL_FILES = 5

export type GreenfieldIndexPackage = {
  path: string
  name?: string
}

export type GreenfieldIndexFile = {
  relativePath: string
  basename: string
}

export type GreenfieldIndexIntelligence = {
  files: GreenfieldIndexFile[]
  packages: GreenfieldIndexPackage[]
  stats: { fileCountScanned: number }
}

export type GreenfieldIndexSnapshot = {
  intelligence: GreenfieldIndexIntelligence
}

export type GreenfieldDetectionInput = {
  index: GreenfieldIndexSnapshot | null
  retrievalMatchCount: number
}

const TRIVIAL_BASENAMES = new Set([
  '.ds_store',
  '.gitkeep',
  'thumbs.db',
  'desktop.ini',
])

function isReadmeOnlyName(basename: string): boolean {
  return /^readme(\.[a-z0-9]+)?$/i.test(basename)
}

function isTrivialGreenfieldFile(file: GreenfieldIndexFile): boolean {
  const base = file.basename.toLowerCase()
  if (TRIVIAL_BASENAMES.has(base)) return true
  if (isReadmeOnlyName(base)) return true
  return false
}

function countNonTrivialFiles(files: GreenfieldIndexFile[]): number {
  return files.filter((f) => !isTrivialGreenfieldFile(f)).length
}

function hasPackageJson(packages: GreenfieldIndexPackage[]): boolean {
  return packages.some((p) => {
    const path = p.path.replace(/\\/g, '/').toLowerCase()
    const name = (p.name ?? '').toLowerCase()
    return path.endsWith('package.json') || name === 'package.json'
  })
}

export function isGreenfieldWorkspace(input: GreenfieldDetectionInput): boolean {
  const { index, retrievalMatchCount } = input
  if (!index) {
    return retrievalMatchCount === 0
  }

  const { stats, files, packages } = index.intelligence
  if (stats.fileCountScanned === 0) {
    return true
  }

  if (stats.fileCountScanned > GREENFIELD_MAX_SCANNED_FILES) {
    return false
  }

  if (hasPackageJson(packages)) {
    return false
  }

  return countNonTrivialFiles(files) <= GREENFIELD_MAX_NONTRIVIAL_FILES
}
