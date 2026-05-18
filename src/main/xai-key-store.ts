import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app, safeStorage } from 'electron'
import type { ClearXaiApiKeyResult, SetXaiApiKeyResult, XaiKeySource, XaiKeyStatusPayload } from '../shared/xai-key-settings-contract'
import { XAI_API_KEY_MAX_LEN } from '../shared/xai-key-settings-contract'

const STORE_FILENAME = 'xai-key-store.json'
const STORE_VERSION = 1

type StoreFileV1 = {
  version: typeof STORE_VERSION
  cipherB64: string
  /** Last four characters of the key for masked display only. */
  keySuffix?: string
}

let storedKeyCacheLoaded = false
let storedKeyCache: string | undefined

function storePath(): string {
  return join(app.getPath('userData'), STORE_FILENAME)
}

function readStoreFile(): StoreFileV1 | null {
  const p = storePath()
  if (!existsSync(p)) return null
  try {
    const raw = readFileSync(p, 'utf8')
    const data = JSON.parse(raw) as StoreFileV1
    if (data?.version !== STORE_VERSION || typeof data.cipherB64 !== 'string' || !data.cipherB64) {
      return null
    }
    return data
  } catch {
    return null
  }
}

function decryptFromStore(data: StoreFileV1): string | undefined {
  try {
    const buf = Buffer.from(data.cipherB64, 'base64')
    if (!safeStorage.isEncryptionAvailable()) {
      return undefined
    }
    return safeStorage.decryptString(buf)
  } catch {
    return undefined
  }
}

function ensureStoredKeyLoaded(): void {
  if (storedKeyCacheLoaded) return
  storedKeyCacheLoaded = true
  const data = readStoreFile()
  if (!data) {
    storedKeyCache = undefined
    return
  }
  const plain = decryptFromStore(data)
  storedKeyCache = plain?.trim() || undefined
}

/** Env-only key (no in-app store). */
export function getXaiApiKeyFromEnv(): string | undefined {
  const a = process.env.XAI_API_KEY?.trim()
  if (a) return a
  const b = process.env.GROKFORGE_XAI_API_KEY?.trim()
  if (b) return b
  return undefined
}

/** Metadata-only check. Does not decrypt saved keys, so it should not trigger OS keychain prompts. */
export function hasConfiguredXaiApiKey(): boolean {
  return Boolean(readStoreFile() || getXaiApiKeyFromEnv())
}

/** Decrypted key from disk cache, or undefined if none / unreadable. */
export function loadStoredXaiKey(): string | undefined {
  ensureStoredKeyLoaded()
  return storedKeyCache
}

/** In-app store overrides env when a stored key exists and decrypts. */
export function getResolvedXaiApiKey(): string | undefined {
  const stored = loadStoredXaiKey()
  if (stored) return stored
  return getXaiApiKeyFromEnv()
}

export function getXaiKeyStatusPayload(): XaiKeyStatusPayload {
  const canPersistKey = safeStorage.isEncryptionAvailable()
  const data = readStoreFile()
  const envKey = getXaiApiKeyFromEnv()
  const hasStoredKey = Boolean(data)
  let source: XaiKeySource = 'none'
  if (hasStoredKey) source = 'stored'
  else if (envKey) source = 'env'

  let maskedHint: string | undefined
  if (data?.keySuffix && data.keySuffix.length > 0) {
    const dots = '········'
    maskedHint = `${dots}${data.keySuffix}`
  }

  return {
    configured: hasConfiguredXaiApiKey(),
    source,
    maskedHint,
    canPersistKey,
  }
}

export function saveStoredXaiKey(apiKey: string): SetXaiApiKeyResult {
  const trimmed = apiKey.trim()
  if (!trimmed) {
    return { ok: false, error: 'API key cannot be empty' }
  }
  if (trimmed.length > XAI_API_KEY_MAX_LEN) {
    return { ok: false, error: `API key is too long (max ${XAI_API_KEY_MAX_LEN} characters)` }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false,
      error:
        'OS secure storage is not available on this machine. Use XAI_API_KEY or GROKFORGE_XAI_API_KEY in the environment, or fix OS encryption (common on some Linux setups).',
    }
  }
  try {
    const encrypted = safeStorage.encryptString(trimmed)
    const keySuffix = trimmed.length >= 4 ? trimmed.slice(-4) : trimmed
    const payload: StoreFileV1 = {
      version: STORE_VERSION,
      cipherB64: Buffer.from(encrypted).toString('base64'),
      keySuffix,
    }
    writeFileSync(storePath(), JSON.stringify(payload), { mode: 0o600 })
    storedKeyCacheLoaded = true
    storedKeyCache = trimmed
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save API key'
    return { ok: false, error: msg }
  }
}

export function clearStoredXaiKey(): ClearXaiApiKeyResult {
  try {
    const p = storePath()
    if (existsSync(p)) {
      unlinkSync(p)
    }
    storedKeyCacheLoaded = true
    storedKeyCache = undefined
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to remove saved key'
    return { ok: false, error: msg }
  }
}

/** For tests: reset in-memory cache without touching disk. */
export function __resetXaiKeyStoreCacheForTests(): void {
  storedKeyCacheLoaded = false
  storedKeyCache = undefined
}
