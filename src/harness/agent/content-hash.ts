import { createHash } from 'node:crypto'

export {
  AGENT_CONTENT_HASH_HEX_LEN,
  AGENT_EDIT_MISSING_CONTENT_HASH_REASON,
  AGENT_EDIT_STALE_HASH_REASON,
  isAgentContentHash,
} from '../../shared/agent-content-hash'

export function computeAgentContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
