/**
 * Chat JSONL line schema version — shared by main (`chat-store`) and renderer so the renderer
 * never imports Node-only `chat-store.ts` (which would break the Vite browser bundle).
 */
export const CHAT_STORE_SCHEMA_VERSION = 1 as const
