---
name: styleguide-design
description: >-
  Applies GrokForge UI tokens, layout, motion, and component patterns for the
  Electron renderer. Use when adding or changing React UI, styling Tailwind,
  introducing or extending shadcn/ui, splitting components, or reviewing UX
  consistency in src/renderer.
---

# GrokForge — design & UI implementation

## When to use

Read this skill **before** implementing renderer work tied to a Task Manager story, or whenever you edit `src/renderer/**`.

## Visual language (established in code)

| Token | Usage |
|-------|--------|
| **Canvas** | Tailwind `bg-gf-canvas` (CSS `var(--gf-canvas)`, `#0a0a0a`); panels often `bg-zinc-950` / `bg-zinc-900`. |
| **Borders** | `border-zinc-800` dividers; subtle chrome `border-zinc-700`. |
| **Primary text** | `text-white` headings; body `text-zinc-300` / `text-zinc-400` secondary; optional `text-gf-foreground` where you need the same value as `body`. |
| **Accent** | Named themes (**Fern** default, **Frost**, **Flame** + **More**: Fuchsia, Fawn, Flint, Flax, Fog) — `bg-gf-accent` / `text-gf-accent` / `hover:bg-gf-accent-hover`; gradients `from-gf-accent to-gf-accent-hover`. Shadcn **`bg-primary`** / **`text-primary`** / **`ring-primary`** use the same accent via CSS vars. See **Accent theming** below. |
| **Root type dots** | Code `bg-gf-accent`, docs `bg-blue-400`, design `bg-purple-400`, default warm `bg-amber-400`. |
| **Radius** | Large controls `rounded-2xl` / `rounded-3xl`; chips `rounded-full`; sidebar items `rounded-xl`. |
| **Mono** | Model names, IDs: `font-mono` + `text-[10px]` or `text-xs` + `tracking-tight` / `tracking-widest`. |
| **Scroll** | Scrollable regions use class `custom-scrollbar` (see `index.css`). |

### Accent theming

- **Where to pick:** **Settings → Appearance** (`SettingsPage.tsx`) — **Fern**, **Frost**, **Flame** as the main row; **More themes** expands to Fuchsia, Fawn, Flint, Flax, Fog. Selection updates chrome immediately.
- **Persistence:** Renderer `localStorage` key **`grokforge.accent`**; values are theme ids: **`fern`** | **`frost`** | **`flame`** | **`fuchsia`** | **`fawn`** | **`flint`** | **`flax`** | **`fog`**. Legacy values `green` / `orange` / `blue` map to Fern / Flame / Frost on read.
- **Apply at startup:** `src/renderer/src/main.tsx` calls **`applyAccent(readStoredAccent())`** from **`src/renderer/src/lib/accent-theme.ts`** before `ReactDOM.createRoot`.
- **CSS contract:** Only **`src/renderer/src/index.css`** defines accent tokens — `:root` is **Fern** (`--gf-accent`, `--gf-accent-hover`, `--primary`, `--ring`); each non-Fern theme uses **`html[data-accent="<id>"]`** to override those four. **Fern** clears `data-accent` so `:root` wins. When adding accent-driven tokens, update **every** preset block; do not hardcode brand hues in JSX.
- **Single source for labels + swatches:** **`src/renderer/src/lib/accent-theme.ts`** exports **`ACCENT_META`** (titles, hints, swatch hex) — must match **`index.css`** hex/HSL for each id.

**Fonts:** `Inter` for UI (`body`, Tailwind `font-sans`); `JetBrains Mono` for code-like labels (`font-mono` / theme extend).

**Motion:** `framer-motion` for meaningful transitions (`whileHover` / `whileTap` on primary buttons, `AnimatePresence` for lists). Keep motion subtle; do not animate large layout shifts.

**Toasts:** `sonner` for errors and confirmations (match existing `toast` usage in `App.tsx`).

**Icons:** `lucide-react` only; size 14–18px inline with text scale.

## Layout patterns

- **Shell:** full viewport `h-screen w-screen overflow-hidden` flex row: fixed sidebar width (`w-72`), main column `flex-1 min-w-0`.
- **Dense chrome:** header `h-14`, voice bar `h-20`, chat column fixed `w-96` where used.
- **Empty states:** centered column, icon or emoji in `rounded-2xl` bordered box, title + short muted description.

## Component architecture (required)

1. **Small files:** One main component per file; extract subviews when a file exceeds ~120 lines or mixes unrelated concerns. Example: `EditorPane.tsx` delegates empty state and tab strip to `EditorEmptyState.tsx` and `EditorTabBar.tsx`; language detection lives in `@/lib/getLanguageFromPath.ts`.
2. **Reuse first:** Before new markup, search `src/renderer/src/components/` and **`src/renderer/src/components/grokforge/`** for GrokForge-specific primitives (`GradientLogoTile`, `RootTypeDot`, `ModelBadge`). Use shadcn `@/components/ui/*` for interactive controls; compose with `cn()` when wrapping.
3. **shadcn/ui:** Prefer shadcn primitives (Button, Input, Dialog, DropdownMenu, Tabs, ScrollArea, Tooltip) from `src/renderer/src/components/ui/`. **Config:** `components.json` at repo root; imports use `@/components/ui/...`. **Theming:** GrokForge `--gf-*` hex vars and shadcn HSL channels (`--background`, `--primary`, …) live together in `src/renderer/src/index.css` inside `@layer base` / `:root` (Fern) and `html[data-accent="…"]` for other named themes. **`--primary`** and **`--ring`** follow the **user-selected theme** so default **`Button`** matches `gf-accent`. Tailwind extends both `gf.*` and shadcn tokens in `tailwind.config.js` (`tailwindcss-animate` plugin enabled). Do not introduce a second visual system.
4. **No raw HTML inputs for complex UX** once shadcn exists: use shadcn `Input`, `Button`, etc., for focus rings and a11y parity.
5. **Electron:** Renderer never imports Node/Electron; use `window.electron` from preload only.

## Anti-patterns

- Light theme or pastel surfaces unless explicitly specced.
- Inline hex colors scattered without Tailwind theme/CSS variables—prefer `gf.*` utilities and `:root` / `html[data-accent]` vars (see `tailwind.config.js` + `index.css`) when adding new repeated tokens.
- Tailwind **`emerald-*`** for product chrome or brand-tinted states (use **`text-gf-accent`**, **`text-primary`**, **`bg-gf-accent`** instead).
- One-off 40-line JSX blocks repeated across files—extract `components/ui/` or feature-local primitives.
- Global `*` transitions on properties beyond color/border (existing `index.css` is intentional—do not broaden without cause).

## Quick checklist before PR

- [ ] Colors and radii match table (or theme extension documented); accent-sensitive UI works across **Fern**, **Frost**, **Flame**, and at least one **More** theme.
- [ ] New UI is split into composable pieces; duplicates removed or shared.
- [ ] Scroll areas use `custom-scrollbar` where content overflows.
- [ ] Loading/error states mirror existing patterns (toasts, disabled buttons).
- [ ] **File tree:** `Loader2` + muted “Loading…” for root fetch; inline `text-red-400/90` for folder errors; root failures also `toast.error` (`FileTree.tsx` + `read-directory` IPC).
