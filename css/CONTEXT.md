# CSS folder context

## Purpose
Owns the game's visual system and responsive presentation. The live stylesheet is style.css; DESIGN.md records visual constraints and verified UI changes.

## v24.8 — Portrait control recovery (20 Nov 2026)
A presentation-only repair for portrait phones. The title menu uses the dynamic viewport and can scroll vertically when the full rail does not fit, while reserving a safe-area lane for the existing Settings, Character and Opening buttons. In-run bottom controls clear the gesture/navigation inset and retain 44px touch targets. Short portrait screens tighten spacing without hiding menu actions. No gameplay mechanics, handlers, save formats, or backend wiring changed. The service-worker cache was advanced to v24.8.

## Verification boundary
Source changes are committed. A real device/browser screenshot and physical-device layout check are still required; never substitute a fabricated screenshot.
