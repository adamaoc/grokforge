import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { app } from 'electron'
import type { GrokProjectManifest } from '../project/manifest'
import { isPathWithinWorkspaceRoots } from '../workspace/path-guard'
import type { AgentChatAttachment } from '../../shared/agent/chat-contract'
import {
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING,
  CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN,
  isAllowedChatAttachmentExtension,
  type StageChatAttachmentPayload,
  type StageChatAttachmentResult,
} from '../../shared/chat/attachment-contract'

export function chatAttachmentStagingRoot(): string {
  return resolve(join(app.getPath('userData'), 'chat-attachments-staging'))
}

export function projectChatAttachmentStagingDir(projectId: string): string {
  return resolve(join(chatAttachmentStagingRoot(), projectId))
}

export function isPathUnderProjectChatStaging(candidateAbs: string, projectId: string): boolean {
  try {
    const baseReal = resolve(projectChatAttachmentStagingDir(projectId))
    let abs: string
    try {
      abs = resolve(realpathSync(candidateAbs))
    } catch {
      abs = resolve(candidateAbs)
    }
    const rel = relative(baseReal, abs)
    return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel)
  } catch {
    return false
  }
}

function safeDestBasename(original: string): string {
  const base = basename(original).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 200)
  return base || 'attachment'
}

function guessMediaTypeFromExt(ext: string): string {
  const e = ext.toLowerCase()
  if (e === 'png') return 'image/png'
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'gif') return 'image/gif'
  if (e === 'webp') return 'image/webp'
  if (e === 'svg') return 'image/svg+xml'
  if (e === 'pdf') return 'application/pdf'
  if (e === 'md' || e === 'markdown') return 'text/markdown'
  if (e === 'txt' || e === 'log') return 'text/plain'
  if (e === 'json') return 'application/json'
  if (e === 'html' || e === 'htm') return 'text/html'
  return 'application/octet-stream'
}

export function stageChatAttachment(
  currentProjectId: string,
  payload: StageChatAttachmentPayload,
): StageChatAttachmentResult {
  if (payload.projectId !== currentProjectId) {
    return { ok: false, error: 'Project mismatch — open the correct workspace before attaching files.' }
  }

  if (payload.kind === 'path') {
    let srcReal: string
    try {
      srcReal = realpathSync(resolve(payload.sourcePath.trim()))
    } catch {
      return { ok: false, error: 'Could not read the source file path.' }
    }
    let st
    try {
      st = statSync(srcReal)
    } catch {
      return { ok: false, error: 'Source file is not accessible.' }
    }
    if (!st.isFile()) return { ok: false, error: 'Only files can be uploaded (not folders).' }
    if (st.size > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
      return { ok: false, error: `File is too large (max ${Math.round(CHAT_ATTACHMENT_MAX_FILE_BYTES / (1024 * 1024))} MiB).` }
    }
    const ext = extname(srcReal).slice(1)
    if (!isAllowedChatAttachmentExtension(ext)) {
      return { ok: false, error: 'This file type cannot be attached.' }
    }

    const dir = projectChatAttachmentStagingDir(payload.projectId)
    mkdirSync(dir, { recursive: true })
    const destName = `${randomUUID()}-${safeDestBasename(srcReal)}`
    const destAbs = resolve(join(dir, destName))
    if (!isPathUnderProjectChatStaging(destAbs, payload.projectId)) {
      return { ok: false, error: 'Invalid staging path.' }
    }
    try {
      copyFileSync(srcReal, destAbs)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Copy failed.'
      return { ok: false, error: msg }
    }
    const displayName = basename(srcReal)
    return {
      ok: true,
      path: destAbs,
      byteSize: st.size,
      displayName,
      mediaType: guessMediaTypeFromExt(ext),
    }
  }

  let buf: Buffer
  try {
    buf = Buffer.from(payload.base64, 'base64')
  } catch {
    return { ok: false, error: 'Invalid attachment encoding.' }
  }
  if (buf.length > CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING) {
    return { ok: false, error: `Inline attachment too large (max ${Math.round(CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING / (1024 * 1024))} MiB).` }
  }
  if (buf.length === 0) return { ok: false, error: 'Empty file.' }

  const orig = safeDestBasename(payload.originalName)
  const ext = extname(orig).slice(1)
  if (!isAllowedChatAttachmentExtension(ext)) {
    return { ok: false, error: 'This file type cannot be attached.' }
  }

  const dir = projectChatAttachmentStagingDir(payload.projectId)
  mkdirSync(dir, { recursive: true })
  const destName = `${randomUUID()}-${orig}`
  const destAbs = resolve(join(dir, destName))
  if (!isPathUnderProjectChatStaging(destAbs, payload.projectId)) {
    return { ok: false, error: 'Invalid staging path.' }
  }
  try {
    writeFileSync(destAbs, buf)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Write failed.'
    return { ok: false, error: msg }
  }
  const mediaType = payload.mediaType?.trim() || guessMediaTypeFromExt(ext)
  return {
    ok: true,
    path: destAbs,
    byteSize: buf.length,
    displayName: basename(orig),
    mediaType,
  }
}

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function toolPathLabelForAgent(absPath: string, manifest: GrokProjectManifest, projectId: string): string {
  if (isPathUnderProjectChatStaging(absPath, projectId)) return basename(absPath)
  const containing = manifest.roots
    .map((r) => ({ root: r, rel: relative(resolve(r.path), absPath) }))
    .filter((x) => x.rel === '' || (!x.rel.startsWith('..') && !/^[a-zA-Z]:/.test(x.rel)))
    .sort((a, b) => resolve(b.root.path).length - resolve(a.root.path).length)[0]
  if (!containing) return absPath
  const rel = toPosixPath(containing.rel || '.')
  return `${containing.root.label}/${rel}`
}

export function sanitizeAttachmentsForTurn(
  manifest: GrokProjectManifest,
  projectId: string,
  attachments: AgentChatAttachment[] | undefined,
): AgentChatAttachment[] | undefined {
  if (!attachments?.length) return undefined
  const out: AgentChatAttachment[] = []
  let totalBytes = 0
  const maxN = 12
  for (const a of attachments) {
    if (out.length >= maxN) break
    const p = resolve(a.path.trim())
    const inWs = isPathWithinWorkspaceRoots(p, manifest.roots)
    const inStage = isPathUnderProjectChatStaging(p, projectId)
    if (!inWs && !inStage) continue
    try {
      const st = statSync(p)
      if (a.type === 'file' && !st.isFile()) continue
      if (a.type === 'folder' && !st.isDirectory()) continue
      const size = st.isFile() ? st.size : 0
      if (totalBytes + size > CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN) continue
      totalBytes += size
      out.push({ ...a, path: p })
    } catch {
      continue
    }
  }
  return out.length ? out : undefined
}
