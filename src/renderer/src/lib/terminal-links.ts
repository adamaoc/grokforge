import { isPathUnderWorkspaceRoots, normalizeFsPath } from './workspace-path-check'

export type TerminalFileLink = {
  text: string
  path: string
  line: number
  startIndex: number
  endIndex: number
}

const FILE_LINE_RE =
  /((?:\.{1,2}[\\/]|\/|[A-Za-z]:[\\/]|[A-Za-z0-9_.-]+[\\/])(?:[^\s:'"`<>|])+):(\d{1,7})(?::\d{1,7})?/g

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[),.;\]]+$/g, '')
}

function resolveTerminalPath(rawPath: string, cwd: string): string {
  const normalized = normalizeFsPath(rawPath)
  if (!normalized) return ''
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return normalized
  const base = normalizeFsPath(cwd)
  if (!base) return normalized
  return normalizeFsPath(`${base}/${normalized}`)
}

export function findTerminalFileLinks(
  lineText: string,
  options: {
    cwd: string
    roots: readonly { path: string }[]
  },
): TerminalFileLink[] {
  const links: TerminalFileLink[] = []
  FILE_LINE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FILE_LINE_RE.exec(lineText))) {
    const fullText = stripTrailingPunctuation(match[0])
    const rawPath = stripTrailingPunctuation(match[1])
    const line = Number.parseInt(match[2], 10)
    if (!Number.isSafeInteger(line) || line < 1) continue
    if (/^https?:\/\//i.test(rawPath)) continue
    const path = resolveTerminalPath(rawPath, options.cwd)
    if (!isPathUnderWorkspaceRoots(path, options.roots)) continue
    links.push({
      text: fullText,
      path,
      line,
      startIndex: match.index,
      endIndex: match.index + fullText.length,
    })
  }
  return links
}
