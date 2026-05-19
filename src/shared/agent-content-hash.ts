/** SHA-256 hex digest length for agent file content hashes. */
export const AGENT_CONTENT_HASH_HEX_LEN = 64

export const AGENT_EDIT_STALE_HASH_REASON =
  'File changed since read; call read_file again.'

export const AGENT_EDIT_MISSING_CONTENT_HASH_REASON =
  'expectedContentHash is required for existing files; copy contentHash from read_file.'

export function isAgentContentHash(value: string): boolean {
  return value.length === AGENT_CONTENT_HASH_HEX_LEN && /^[a-f0-9]{64}$/i.test(value)
}
