import { z } from 'zod'

/** Per-file cap for staged / chat attachments (bytes). */
export const CHAT_ATTACHMENT_MAX_FILE_BYTES = 15 * 1024 * 1024

/** Max raw payload for base64 staging (bytes after decode). */
export const CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING = 8 * 1024 * 1024

/** Sum of file sizes (folders count as 0) per agent turn — enforced in main. */
export const CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN = 40 * 1024 * 1024

const IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'ico',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff',
])

const DOC_EXTS = new Set([
  'pdf',
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'js',
  'jsx',
  'vue',
  'svelte',
  'rs',
  'go',
  'java',
  'kt',
  'kts',
  'swift',
  'rb',
  'php',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'cs',
  'fs',
  'sql',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'toml',
  'ini',
  'cfg',
  'conf',
  'log',
  'rtf',
  'mdx',
  'tex',
  'rst',
])

export function isAllowedChatAttachmentExtension(extWithoutDot: string): boolean {
  const e = extWithoutDot.toLowerCase().replace(/^\./, '')
  if (!e) return false
  return IMAGE_EXTS.has(e) || DOC_EXTS.has(e)
}

export const StageChatAttachmentPathPayloadSchema = z.object({
  kind: z.literal('path'),
  projectId: z.string().uuid(),
  sourcePath: z.string().min(1).max(8192),
})

export const StageChatAttachmentBytesPayloadSchema = z.object({
  kind: z.literal('bytes'),
  projectId: z.string().uuid(),
  /** base64-encoded file bytes */
  base64: z.string().min(1).max(Math.ceil((CHAT_ATTACHMENT_MAX_BYTES_BASE64_STAGING * 4) / 3) + 1024),
  originalName: z.string().min(1).max(512),
  mediaType: z.string().max(256).optional(),
})

export const StageChatAttachmentPayloadSchema = z.discriminatedUnion('kind', [
  StageChatAttachmentPathPayloadSchema,
  StageChatAttachmentBytesPayloadSchema,
])

export type StageChatAttachmentPayload = z.infer<typeof StageChatAttachmentPayloadSchema>

export type StageChatAttachmentOk = {
  ok: true
  path: string
  byteSize: number
  displayName: string
  mediaType: string
}

export type StageChatAttachmentErr = { ok: false; error: string }

export type StageChatAttachmentResult = StageChatAttachmentOk | StageChatAttachmentErr
