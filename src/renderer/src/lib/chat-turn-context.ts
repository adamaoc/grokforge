import type { ChatTurnContextV1, GrokProjectManifest } from '@/types'

function rootsSnapshot(project: GrokProjectManifest): ChatTurnContextV1['roots'] {
  return project.roots.map((r) => ({
    id: r.id,
    label: r.label,
    path: r.path,
  }))
}

/** Snapshot for a typed agent-chat turn (renderer → persist / UI). */
export function buildTextAgentTurnContext(args: {
  project: GrokProjectManifest
  activeFilePath: string | null
  chatMode: 'fast' | 'plan'
}): ChatTurnContextV1 {
  const { project, activeFilePath, chatMode } = args
  return {
    source: 'text',
    // Persisted schema field from the original multi-model chat; agent turns use the default slot.
    modelIntent: chatMode === 'plan' ? 'planning' : 'chat_default',
    chatMode,
    activeRootId: null,
    activeRootLabel: null,
    activeFilePath: activeFilePath?.trim() ? activeFilePath : null,
    roots: rootsSnapshot(project),
  }
}

/** Snapshot for voice transcript lines appended from the voice session hook. */
export function buildVoiceTurnContext(args: {
  project: GrokProjectManifest
  activeFilePath: string | null
}): ChatTurnContextV1 {
  const { project, activeFilePath } = args
  return {
    source: 'voice',
    modelIntent: 'voice',
    activeRootId: null,
    activeRootLabel: null,
    activeFilePath: activeFilePath?.trim() ? activeFilePath : null,
    roots: rootsSnapshot(project),
  }
}
