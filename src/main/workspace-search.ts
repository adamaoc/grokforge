import type { BrowserWindow } from 'electron'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { GrokProjectManifest } from './manifest'
import { shouldIgnoreFsEntry } from './ignore-globs'
import {
  SEARCH_MAX_FILE_BYTES,
  SEARCH_MAX_FILES_SCANNED,
  SEARCH_MAX_QUERY_LEN,
  SEARCH_MAX_RESULTS,
  type SearchWorkspaceProgressPayload,
  type SearchWorkspaceRequest,
  type SearchWorkspaceResult,
  type SearchWorkspaceRow,
} from '../shared/workspace-search-contract'

export type {
  SearchWorkspaceErrorResult,
  SearchWorkspaceOkResult,
  SearchWorkspaceProgressPayload,
  SearchWorkspaceRequest,
  SearchWorkspaceResult,
  SearchWorkspaceRow,
} from '../shared/workspace-search-contract'

export {
  SEARCH_MAX_FILE_BYTES,
  SEARCH_MAX_FILES_SCANNED,
  SEARCH_MAX_QUERY_LEN,
  SEARCH_MAX_RESULTS,
} from '../shared/workspace-search-contract'

let activeAbort: AbortController | null = null

export function cancelWorkspaceSearch(): void {
  activeAbort?.abort()
}

function yieldToMacrotask(): Promise<void> {
  return new Promise((r) => setImmediate(r))
}

export function parseSearchWorkspacePayload(payload: unknown): SearchWorkspaceRequest | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.query !== 'string') return null
  return {
    query: p.query,
    caseSensitive: p.caseSensitive === true,
    regex: p.regex === true,
  }
}

function buildMatcher(
  req: SearchWorkspaceRequest,
): { ok: true; test: (line: string) => boolean } | { ok: false; error: string } {
  const q = req.query.trim()
  if (!q.length) {
    return { ok: false, error: 'Query is empty' }
  }
  if (q.length > SEARCH_MAX_QUERY_LEN) {
    return { ok: false, error: `Query exceeds ${SEARCH_MAX_QUERY_LEN} characters` }
  }
  if (req.regex) {
    try {
      const flags = req.caseSensitive ? 'g' : 'gi'
      const re = new RegExp(q, flags)
      return {
        ok: true,
        test: (line: string) => {
          re.lastIndex = 0
          return re.test(line)
        },
      }
    } catch {
      return { ok: false, error: 'Invalid regular expression' }
    }
  }
  const needle = req.caseSensitive ? q : q.toLowerCase()
  return {
    ok: true,
    test: (line: string) => (req.caseSensitive ? line : line.toLowerCase()).includes(needle),
  }
}

async function fileHeadHasNul(absPath: string, size: number): Promise<boolean> {
  try {
    const fh = await open(absPath, 'r')
    try {
      const toRead = Math.min(8192, size)
      const buf = Buffer.alloc(toRead)
      const { bytesRead } = await fh.read(buf, 0, toRead, 0)
      return buf.subarray(0, bytesRead).includes(0)
    } finally {
      await fh.close()
    }
  } catch {
    return true
  }
}

function trimPreview(s: string, max = 220): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

async function scanFileForMatches(
  absPath: string,
  rootId: string,
  test: (line: string) => boolean,
  results: SearchWorkspaceRow[],
  signal: AbortSignal,
): Promise<'aborted' | 'cap' | false> {
  const st = await stat(absPath).catch(() => null)
  if (!st?.isFile() || st.size > SEARCH_MAX_FILE_BYTES) {
    return false
  }
  if (await fileHeadHasNul(absPath, st.size)) {
    return false
  }
  const text = await readFile(absPath, 'utf8').catch(() => null)
  if (text === null) {
    return false
  }

  let lineNum = 1
  let i = 0
  while (i < text.length) {
    if (signal.aborted) {
      return 'aborted'
    }
    const nl = text.indexOf('\n', i)
    const end = nl === -1 ? text.length : nl
    const lineText = text.slice(i, end)
    if (test(lineText)) {
      results.push({
        path: absPath,
        rootId,
        line: lineNum,
        preview: trimPreview(lineText),
      })
      if (results.length >= SEARCH_MAX_RESULTS) {
        return 'cap'
      }
    }
    if (nl === -1) break
    lineNum += 1
    i = nl + 1
  }
  return false
}

export async function runWorkspaceSearch(
  project: GrokProjectManifest,
  win: BrowserWindow | null,
  req: SearchWorkspaceRequest,
): Promise<SearchWorkspaceResult> {
  activeAbort?.abort()
  const abort = new AbortController()
  activeAbort = abort
  const signal = abort.signal

  const matcher = buildMatcher(req)
  if (!matcher.ok) {
    if (activeAbort === abort) activeAbort = null
    return { ok: false, error: matcher.error }
  }

  const ignore = project.ignore ?? []
  const roots = project.roots
  const results: SearchWorkspaceRow[] = []
  let filesScanned = 0
  let truncated = false
  let cancelled = false

  let lastProgressAt = 0
  const maybeSendProgress = (rootId?: string) => {
    const now = Date.now()
    if (now - lastProgressAt < 100 && filesScanned % 32 !== 0) return
    lastProgressAt = now
    win?.webContents.send('search-workspace-progress', {
      filesScanned,
      matchCount: results.length,
      currentRootId: rootId,
    } satisfies SearchWorkspaceProgressPayload)
  }

  const visitedDirs = new Set<string>()

  try {
    outer: for (const root of roots) {
      if (signal.aborted) {
        cancelled = true
        break
      }

      const stack: string[] = [resolve(root.path)]

      while (stack.length > 0) {
        if (signal.aborted) {
          cancelled = true
          break outer
        }
        if (filesScanned >= SEARCH_MAX_FILES_SCANNED) {
          truncated = true
          break outer
        }

        const dir = stack.pop()!
        if (visitedDirs.has(dir)) {
          continue
        }
        visitedDirs.add(dir)

        if (shouldIgnoreFsEntry(dir, roots, ignore)) {
          continue
        }

        type DirEnt = { name: string; isDirectory(): boolean; isFile(): boolean }
        let entries: DirEnt[]
        try {
          entries = (await readdir(dir, { withFileTypes: true })) as DirEnt[]
        } catch {
          continue
        }

        for (const ent of entries) {
          if (signal.aborted) {
            cancelled = true
            break outer
          }
          if (results.length >= SEARCH_MAX_RESULTS) {
            truncated = true
            break outer
          }
          if (filesScanned >= SEARCH_MAX_FILES_SCANNED) {
            truncated = true
            break outer
          }

          const full = resolve(join(dir, ent.name))
          if (shouldIgnoreFsEntry(full, roots, ignore)) {
            continue
          }

          if (ent.isDirectory()) {
            if (!visitedDirs.has(full)) {
              stack.push(full)
            }
            continue
          }

          if (!ent.isFile()) {
            continue
          }

          filesScanned += 1
          maybeSendProgress(root.id)

          const scanOutcome = await scanFileForMatches(full, root.id, matcher.test, results, signal)
          if (scanOutcome === 'aborted') {
            cancelled = true
            break outer
          }
          if (scanOutcome === 'cap' || results.length >= SEARCH_MAX_RESULTS) {
            truncated = true
            break outer
          }

          if (filesScanned % 16 === 0) {
            await yieldToMacrotask()
          }
        }
      }
    }

    return {
      ok: true,
      results,
      truncated,
      filesScanned,
      cancelled: cancelled || undefined,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Search failed'
    return { ok: false, error: msg }
  } finally {
    if (activeAbort === abort) {
      activeAbort = null
    }
  }
}
