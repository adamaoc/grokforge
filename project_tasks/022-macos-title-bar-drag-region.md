# 022 — macOS title bar: drag and zoom behavior

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` so custom chrome matches tokens and does not fight system controls.

## Summary

The **custom top bar** should behave like native window chrome on **macOS**: user can **drag the window** from that region and use the system **traffic lights** (close/minimize/zoom) as today. Today `BrowserWindow` uses `titleBarStyle: 'hiddenInset'` — ensure the renderer exposes a proper **`drag` region** (`-webkit-app-region: drag`) on the top bar and `no-drag` on interactive controls.

## Scope

- Map current window options in `src/main/main.ts` (`titleBarStyle`, `trafficLightPosition`).
- Apply `-webkit-app-region: drag` to the designated top bar container; **`no-drag`** on buttons, inputs, menus, and voice controls.
- Verify **green button zoom** / full-screen behavior is not blocked by overlapping non-draggable layers.
- Document any platform differences (Windows/Linux) if the same header is shared.

What we don't want, is a full app title bar like old apps looked. New apps have almost an invisible top area.

## Acceptance criteria

- [ ] On macOS, dragging the top bar moves the window; interactive elements remain clickable.
- [ ] Traffic lights remain usable and unobstructed.
- [ ] Zoom / maximize to screen works as expected for `hiddenInset` windows.

## Key files

- `src/main/main.ts`, `ProjectHeader.tsx` / root layout, global CSS if needed.

## Notes

- Coordinate with **021** if header structure changes.
