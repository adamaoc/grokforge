/** Default Grok Voice realtime model when the project manifest does not name one. */
export const DEFAULT_VOICE_MODEL = 'grok-voice-latest'

export function voiceModelFromManifest(manifest: { models?: { voice?: string } | null }): string {
  const raw = manifest.models?.voice
  return typeof raw === 'string' && raw.trim() ? raw.trim() : DEFAULT_VOICE_MODEL
}
