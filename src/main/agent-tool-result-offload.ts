import {
  buildOffloadPointer,
  buildPreviewLines,
  shouldOffloadToolResult,
} from '../shared/agent-context-offload'
import { offloadRelPathForTrace, writeAgentOffloadFile } from './agent-offload-store'

export type ApplyToolResultOffloadInput = {
  projectId: string
  streamId: string
  toolCallId: string
  toolContent: string
}

export type ApplyToolResultOffloadResult = {
  providerContent: string
  offloaded: boolean
  originalChars: number
  providerChars: number
  offloadPath?: string
  offloadRelPath?: string
}

export function applyToolResultOffload(input: ApplyToolResultOffloadInput): ApplyToolResultOffloadResult {
  const originalChars = input.toolContent.length
  if (!shouldOffloadToolResult(input.toolContent)) {
    return {
      providerContent: input.toolContent,
      offloaded: false,
      originalChars,
      providerChars: originalChars,
    }
  }

  const { absPath, sha256, lineCount } = writeAgentOffloadFile({
    projectId: input.projectId,
    streamId: input.streamId,
    toolCallId: input.toolCallId,
    content: input.toolContent,
  })
  const { preview } = buildPreviewLines(input.toolContent)
  const providerContent = buildOffloadPointer({
    offloadPath: absPath,
    lineCount,
    sha256,
    preview,
    originalChars,
  })

  return {
    providerContent,
    offloaded: true,
    originalChars,
    providerChars: providerContent.length,
    offloadPath: absPath,
    offloadRelPath: offloadRelPathForTrace(input.projectId, absPath),
  }
}
