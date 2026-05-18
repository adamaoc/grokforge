/**
 * Strip common markdown patterns for clipboard + TTS (no full parser).
 */
export function stripMinimalMarkdownForSpeech(input: string): string {
  let s = input
  s = s.replace(/\r\n/g, '\n')
  // fenced code blocks
  s = s.replace(/```[\s\S]*?```/g, ' ')
  // inline code
  s = s.replace(/`([^`]+)`/g, '$1')
  // bold / italic (simple)
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/\*([^*]+)\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/_([^_]+)_/g, '$1')
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  // headings
  s = s.replace(/^#{1,6}\s+/gm, '')
  // collapse whitespace
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}
