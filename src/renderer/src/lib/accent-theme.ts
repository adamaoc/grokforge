/**
 * Renderer-only: accent presets for `--gf-accent` / `--primary` / `--ring` (see `index.css`).
 * Swatch hex here must match `html[data-accent=…]` (non-Fern) and `:root` (Fern).
 */

export const ACCENT_STORAGE_KEY = 'grokforge.accent'

export const ACCENT_PRIMARY_ORDER = ['fern', 'frost', 'flame'] as const
export const ACCENT_MORE_ORDER = ['fuchsia', 'fawn', 'flint', 'flax', 'fog'] as const

export type AccentId =
  | (typeof ACCENT_PRIMARY_ORDER)[number]
  | (typeof ACCENT_MORE_ORDER)[number]

const ACCENT_SET = new Set<string>([...ACCENT_PRIMARY_ORDER, ...ACCENT_MORE_ORDER])

/** Legacy v1 ids → current theme ids (one-time migration in `readStoredAccent`). */
const LEGACY_ACCENT: Record<string, AccentId> = {
  green: 'fern',
  orange: 'flame',
  blue: 'frost',
}

export const ACCENT_META: Record<
  AccentId,
  { title: string; hint: string; swatchFrom: string; swatchTo: string }
> = {
  fern: { title: 'Fern', hint: 'Fresh, natural', swatchFrom: '#00ff9f', swatchTo: '#00cc7a' },
  frost: { title: 'Frost', hint: 'Clean, calm', swatchFrom: '#5edbff', swatchTo: '#22b8e8' },
  flame: { title: 'Flame', hint: 'Energetic, bold', swatchFrom: '#ffb020', swatchTo: '#e68600' },
  fuchsia: { title: 'Fuchsia', hint: 'Bold, playful', swatchFrom: '#ff5ee6', swatchTo: '#db24c9' },
  fawn: { title: 'Fawn', hint: 'Earthy, warm', swatchFrom: '#deb887', swatchTo: '#b08d5e' },
  flint: { title: 'Flint', hint: 'Sharp, minimal', swatchFrom: '#8fa3b8', swatchTo: '#5c6f84' },
  flax: { title: 'Flax', hint: 'Light, optimistic', swatchFrom: '#f2d756', swatchTo: '#c9a82e' },
  fog: { title: 'Fog', hint: 'Subtle, calm', swatchFrom: '#b4c0d4', swatchTo: '#8d9db5' },
}

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === 'string' && ACCENT_SET.has(value)
}

export function parseAccent(raw: string | null): AccentId {
  if (!raw) return 'fern'
  const legacy = LEGACY_ACCENT[raw]
  if (legacy) return legacy
  if (isAccentId(raw)) return raw
  return 'fern'
}

export function readStoredAccent(): AccentId {
  if (typeof window === 'undefined' || !window.localStorage) return 'fern'
  try {
    const raw = window.localStorage.getItem(ACCENT_STORAGE_KEY)
    const parsed = parseAccent(raw)
    if (raw && raw !== parsed) {
      try {
        window.localStorage.setItem(ACCENT_STORAGE_KEY, parsed)
      } catch {
        /* ignore */
      }
    }
    return parsed
  } catch {
    return 'fern'
  }
}

/** Fern = default `:root` tokens — clear `data-accent`. Other themes set `html[data-accent]`. */
export function applyAccent(id: AccentId): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (id === 'fern') {
    root.removeAttribute('data-accent')
  } else {
    root.dataset.accent = id
  }
}

export function persistAccent(id: AccentId): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, id)
  } catch {
    /* quota / private mode */
  }
}

export function persistAndApplyAccent(id: AccentId): void {
  persistAccent(id)
  applyAccent(id)
}

export function isAccentInMoreSection(id: AccentId): boolean {
  return (ACCENT_MORE_ORDER as readonly string[]).includes(id)
}
