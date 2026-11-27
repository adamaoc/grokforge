import { z } from 'zod'

export const RootSchema = z.object({
  id: z.string(),
  path: z.string(),
  type: z.enum(['code', 'docs', 'research', 'design', 'comms', 'other']),
  label: z.string(),
  git: z.boolean().optional(),
  defaultBranch: z.string().optional(),
})

export const GrokProjectManifestSchema = z.object({
  $schema: z.string().optional(),
  version: z.string(),
  name: z.string(),
  description: z.string().optional(),
  roots: z.array(RootSchema).min(1),
  ignore: z.array(z.string()).optional(),
  /** Only `voice` is used now; older projects may carry extra model slots (kept as-is). */
  models: z.object({ voice: z.string().optional() }).passthrough().optional(),
  voice: z.object({
    enabled: z.boolean(),
    defaultVoiceMode: z.enum(['full-duplex', 'push-to-talk', 'off']),
    customVoiceId: z.string().nullable().optional(),
    autoListen: z.boolean(),
    speakResponses: z.boolean(),
  }),
  /** Legacy agent-context settings; unused by external agents, kept for older projects. */
  context: z
    .object({
      alwaysInclude: z.array(z.string().max(4096)).optional(),
      customInstructions: z.string().max(96_000).optional(),
      customInstructionsFile: z.string().max(4096).optional(),
    })
    .optional(),
  metadata: z.object({
    createdAt: z.string(),
    lastOpened: z.string(),
    tags: z.array(z.string()),
  }),
})

export type Root = z.infer<typeof RootSchema>
export type GrokProjectManifest = z.infer<typeof GrokProjectManifestSchema>

/** Returned from `open-project` when the user picks a folder (new app-side project created). */
export type OpenProjectResult = {
  manifest: GrokProjectManifest
  /** Stable id for app storage (`userData/workspace-projects/<projectId>/`). */
  projectId: string
}

/** Current session snapshot for `get-project`. */
export type ProjectSessionSnapshot = {
  manifest: GrokProjectManifest | null
  projectId: string | null
}

export type DirectoryEntry = {
  name: string
  path: string
  isDirectory: boolean
}

export type ReadDirectoryResult =
  | { ok: true; entries: DirectoryEntry[] }
  | { ok: false; error: string }

/** Result of `add-workspace-root` IPC (story 025). `null` is returned when the user cancels the dialog. */
export type AddWorkspaceRootResult =
  | { ok: true; manifest: GrokProjectManifest }
  | { ok: false; error: string }

export function validateManifest(data: unknown) {
  const result = GrokProjectManifestSchema.safeParse(data)
  return result.success 
    ? { success: true, data: result.data } 
    : { success: false, error: result.error.message }
}
