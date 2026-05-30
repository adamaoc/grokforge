/** SHA-256 hex digest length for agent file content hashes. */
export const AGENT_CONTENT_HASH_HEX_LEN = 64

/** Optional model-facing sentinel for new-file write_file ops (story 154). */
export const AGENT_NEW_FILE_EXPECTED_CONTENT_HASH_SENTINEL = 'new' as const

export const AGENT_EDIT_STALE_HASH_REASON =
  'File changed since read; call read_file again.'

export const AGENT_EDIT_MISSING_CONTENT_HASH_REASON =
  'expectedContentHash is required for existing files; copy contentHash from read_file.'

export const AGENT_EDIT_MALFORMED_CONTENT_HASH_REASON =
  'expectedContentHash must be the 64-character SHA-256 hex from read_file contentHash (existing files only).'

export const AGENT_EDIT_CREATE_HASH_STRIPPED_NOTE =
  'For new files omit expectedContentHash (or use the "new" sentinel). Do not fabricate a hash — it was ignored on create.'

export function isAgentContentHash(value: string): boolean {
  return value.length === AGENT_CONTENT_HASH_HEX_LEN && /^[a-f0-9]{64}$/i.test(value)
}

export function isNewFileContentHashSentinel(value: string): boolean {
  return value === AGENT_NEW_FILE_EXPECTED_CONTENT_HASH_SENTINEL
}

export type ResolveWriteExpectedContentHashInput = {
  opHash: string | undefined
  fileExistsOnDisk: boolean
  readRegistryHash?: string
}

export type ResolveWriteExpectedContentHashResult = {
  effectiveHash?: string
  strippedCreateHash?: boolean
  error?: string
}

/**
 * Normalize expectedContentHash for write/delete ops after lenient schema parse (story 154).
 * New files: strip any provided hash. Existing files: require valid hex or read-registry fallback.
 */
export function resolveWriteExpectedContentHash(
  input: ResolveWriteExpectedContentHashInput,
): ResolveWriteExpectedContentHashResult {
  const { opHash, fileExistsOnDisk, readRegistryHash } = input

  if (!fileExistsOnDisk) {
    if (opHash === undefined) {
      return {}
    }
    return { strippedCreateHash: true }
  }

  if (opHash === undefined) {
    if (readRegistryHash && isAgentContentHash(readRegistryHash)) {
      return { effectiveHash: readRegistryHash }
    }
    return { error: AGENT_EDIT_MISSING_CONTENT_HASH_REASON }
  }

  if (isNewFileContentHashSentinel(opHash) || !isAgentContentHash(opHash)) {
    return { error: AGENT_EDIT_MALFORMED_CONTENT_HASH_REASON }
  }

  return { effectiveHash: opHash }
}
