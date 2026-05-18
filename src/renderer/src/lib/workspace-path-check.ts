/**
 * Browser-side path checks for agent write UI (mirrors main `workspace-path-guard` intent; no Node `path`).
 */

export function normalizeFsPath(input: string): string {
  const trimmed = input.trim().replace(/\\/g, '/')
  if (!trimmed) return ''

  const win = /^([A-Za-z]):\//.exec(trimmed)
  if (win) {
    const drive = win[1].toUpperCase()
    const rest = trimmed.slice(win[0].length)
    const parts = rest.split('/').filter((p) => p && p !== '.')
    const stack: string[] = []
    for (const p of parts) {
      if (p === '..') {
        if (stack.length) stack.pop()
        continue
      }
      stack.push(p)
    }
    return `${drive}:/${stack.join('/')}`
  }

  const isAbsUnix = trimmed.startsWith('/')
  const body = isAbsUnix ? trimmed.slice(1) : trimmed
  const parts = body.split('/').filter((p) => p && p !== '.')
  const stack: string[] = []
  for (const p of parts) {
    if (p === '..') {
      if (stack.length) stack.pop()
      continue
    }
    stack.push(p)
  }
  const joined = stack.join('/')
  if (isAbsUnix) return joined ? `/${joined}` : '/'
  return joined
}

/** True when `candidate` is exactly a root or a strict descendant (normalized). */
export function isPathUnderWorkspaceRoots(
  candidate: string,
  roots: readonly { path: string }[],
): boolean {
  if (!roots.length) return false
  const c = normalizeFsPath(candidate)
  if (!c || c === '/') return false
  return roots.some((root) => {
    const r = normalizeFsPath(root.path)
    if (!r || r === '/') return false
    if (c === r) return true
    const prefix = r.endsWith('/') ? r : `${r}/`
    return c.startsWith(prefix)
  })
}

export function formatRootsForPrompt(roots: readonly { path: string; label: string }[]): string {
  return roots.map((x) => `- **${x.label}**: \`${x.path}\``).join('\n')
}
