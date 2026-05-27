/** Main → renderer signal that workspace files changed on disk (e.g. agent CLI scaffold). */
export type WorkspaceFsChangeReason = 'agent_command' | 'mutation' | 'agent_write'

export type WorkspaceFsChangedPayload = {
  paths: string[]
  reason: WorkspaceFsChangeReason
}
