import type { ChatTurnContextV1, GrokProjectManifest, Root } from '@/types'

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
  activeRoot: Root | null
  activeFilePath: string | null
  modelIntent: 'chat_default' | 'planning' | 'execution'
  chatMode: 'fast' | 'plan'
}): ChatTurnContextV1 {
  const { project, activeRoot, activeFilePath, modelIntent, chatMode } = args
  return {
    source: 'text',
    modelIntent,
    chatMode,
    activeRootId: activeRoot?.id ?? null,
    activeRootLabel: activeRoot?.label ?? null,
    activeFilePath: activeFilePath?.trim() ? activeFilePath : null,
    roots: rootsSnapshot(project),
  }
}

/** Snapshot for voice transcript lines appended from the voice session hook. */
export function buildVoiceTurnContext(args: {
  project: GrokProjectManifest
  activeRoot: Root | null
  activeFilePath: string | null
}): ChatTurnContextV1 {
  const { project, activeRoot, activeFilePath } = args
  return {
    source: 'voice',
    modelIntent: 'voice',
    activeRootId: activeRoot?.id ?? null,
    activeRootLabel: activeRoot?.label ?? null,
    activeFilePath: activeFilePath?.trim() ? activeFilePath : null,
    roots: rootsSnapshot(project),
  }
}

export function formatModelIntentLabel(intent: ChatTurnContextV1['modelIntent']): string {
  if (intent === 'chat_default') return 'Default'
  if (intent === 'planning') return 'Planning'
  if (intent === 'execution') return 'Execution'
  return 'Voice'
}
