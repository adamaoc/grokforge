/** Path helpers for the renderer (no `node:path`). */

export function dirnamePath(filePath: string): string {
  const i = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (i <= 0) return filePath
  return filePath.slice(0, i)
}

export function basenamePath(filePath: string): string {
  const i = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (i < 0) return filePath
  return filePath.slice(i + 1)
}

/** Relative POSIX-style path from workspace root; falls back to absolute if not under root. */
export function relativePathFromWorkspaceRoot(rootPath: string, absolutePath: string): string {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const r = norm(rootPath)
  const p = norm(absolutePath)
  if (p === r) return ''
  const prefix = r + '/'
  if (p.startsWith(prefix)) return p.slice(prefix.length)
  return absolutePath
}

/** Join a directory path and a single file/folder name (renderer-safe). */
export function joinPathDirAndName(dir: string, fileName: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  const d = dir.replace(/[/\\]+$/, '')
  return `${d}${sep}${fileName}`
}
