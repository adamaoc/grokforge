import { describe, expect, it } from 'vitest'
import { computeAgentContentHash } from '../../main/agent/content-hash'
import {
  AGENT_CONTENT_HASH_HEX_LEN,
  AGENT_EDIT_CREATE_HASH_STRIPPED_NOTE,
  AGENT_EDIT_MALFORMED_CONTENT_HASH_REASON,
  AGENT_EDIT_MISSING_CONTENT_HASH_REASON,
  AGENT_NEW_FILE_EXPECTED_CONTENT_HASH_SENTINEL,
  isAgentContentHash,
  isNewFileContentHashSentinel,
  resolveWriteExpectedContentHash,
} from './content-hash'

describe('computeAgentContentHash', () => {
  it('returns a stable SHA-256 hex digest for UTF-8 text', () => {
    const hash = computeAgentContentHash('hello\nworld')
    expect(hash).toHaveLength(AGENT_CONTENT_HASH_HEX_LEN)
    expect(isAgentContentHash(hash)).toBe(true)
    expect(computeAgentContentHash('hello\nworld')).toBe(hash)
    expect(computeAgentContentHash('other')).not.toBe(hash)
  })
})

describe('resolveWriteExpectedContentHash', () => {
  const validHash = computeAgentContentHash('file\n')

  it('returns empty for new file with omitted hash', () => {
    expect(resolveWriteExpectedContentHash({ opHash: undefined, fileExistsOnDisk: false })).toEqual({})
  })

  it('strips sentinel, malformed, and valid hashes on new files', () => {
    expect(
      resolveWriteExpectedContentHash({
        opHash: AGENT_NEW_FILE_EXPECTED_CONTENT_HASH_SENTINEL,
        fileExistsOnDisk: false,
      }),
    ).toEqual({ strippedCreateHash: true })
    expect(
      resolveWriteExpectedContentHash({ opHash: 'abc', fileExistsOnDisk: false }),
    ).toEqual({ strippedCreateHash: true })
    expect(
      resolveWriteExpectedContentHash({ opHash: validHash, fileExistsOnDisk: false }),
    ).toEqual({ strippedCreateHash: true })
  })

  it('requires hash or read registry for existing files', () => {
    expect(
      resolveWriteExpectedContentHash({ opHash: undefined, fileExistsOnDisk: true }),
    ).toEqual({ error: AGENT_EDIT_MISSING_CONTENT_HASH_REASON })
    expect(
      resolveWriteExpectedContentHash({
        opHash: undefined,
        fileExistsOnDisk: true,
        readRegistryHash: validHash,
      }),
    ).toEqual({ effectiveHash: validHash })
  })

  it('rejects malformed and sentinel hashes on existing files', () => {
    expect(
      resolveWriteExpectedContentHash({
        opHash: AGENT_NEW_FILE_EXPECTED_CONTENT_HASH_SENTINEL,
        fileExistsOnDisk: true,
      }),
    ).toEqual({ error: AGENT_EDIT_MALFORMED_CONTENT_HASH_REASON })
    expect(
      resolveWriteExpectedContentHash({ opHash: 'not-a-hash', fileExistsOnDisk: true }),
    ).toEqual({ error: AGENT_EDIT_MALFORMED_CONTENT_HASH_REASON })
  })

  it('accepts valid hash on existing files', () => {
    expect(
      resolveWriteExpectedContentHash({ opHash: validHash, fileExistsOnDisk: true }),
    ).toEqual({ effectiveHash: validHash })
  })
})

describe('sentinel and note constants', () => {
  it('exports stable sentinel and repair note', () => {
    expect(isNewFileContentHashSentinel(AGENT_NEW_FILE_EXPECTED_CONTENT_HASH_SENTINEL)).toBe(true)
    expect(AGENT_EDIT_CREATE_HASH_STRIPPED_NOTE).toContain('omit expectedContentHash')
  })
})
