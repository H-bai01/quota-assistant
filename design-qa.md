# Design QA — 双服务额度总览

- Source visual truth: user-provided compact and expanded reference screenshots retained outside the repository.
- Implementation evidence: compact and expanded runtime screenshots retained outside the repository.
- Current 0.2.1 viewports: compact `120 × 88`; expanded `488 × 488`.
- Source pixels: compact `200 × 200`; expanded `720 × 720`.
- Archived comparison pixels: compact `152 × 152`; expanded `488 × 488`. The current 0.2.1 compact widget was subsequently reduced to `120 × 88`.
- Density normalization: implementation screenshots were resampled to `200 × 200` and `720 × 720` solely for equal-pixel visual comparison. The runtime screenshots remain unscaled evidence.
- State: authenticated Codex + Claude, Chinese language, always-on-top enabled, real local quota data.

## Full-view comparison evidence

The accepted implementation preserves the source composition: two-row compact summary, blue-to-warm frosted surface, two stacked provider cards, three-column information rhythm, rounded white outlines, provider imagery, large quota numerals, and the four controls at the upper right.

The content intentionally differs from the mock where product truth requires it. Codex no longer invents a 5-hour allowance; its two large values are weekly remaining and reset-credit count. Claude retains 5-hour and weekly values. Subscription dates are shown from the locally confirmed Apple subscription cache.

## Focused-region comparison evidence

- Compact: both provider icons and both percentages are fully visible after the second sizing pass. Baselines and row spacing follow the source hierarchy.
- Header: title, subtitle, refresh, expansion, language, and pin controls align in one row without overlap.
- Provider cards: logos remain sharp at runtime size; large metrics, labels, dividers, reset timing, and dates stay inside the rounded panels.
- Bottom edge: the final expanded capture keeps the Claude card and its text inside the visible window with clear outer padding.

## Findings

No actionable P0, P1, or P2 differences remain.

- [P3] The live macOS translucency is slightly paler than the static reference.
  - Location: outer overview surface.
  - Evidence: the reference has a somewhat stronger blue top and orange lower-right region; the live capture is softer because it uses the existing translucent aurora tokens over the desktop.
  - Impact: minor visual polish only; hierarchy and readability are unaffected.
  - Follow-up: increase the existing aurora opacity slightly after user preference feedback.

- [P3] Copy differs from the concept image.
  - Location: Codex information columns and plan labels.
  - Evidence: the concept assumes a Codex 5-hour window; real data exposes weekly quota and reset credits instead. Renewal dates are displayed separately from the Apple subscription result.
  - Impact: intentional product-correct deviation.
  - Follow-up: none.

## Required fidelity surfaces

- Fonts and typography: system display font, weight hierarchy, tabular numerals, line height, and truncation are visually consistent; no wrapping or clipping remains.
- Spacing and layout rhythm: outer padding, header height, panel gaps, three-column grid, radii, and bottom padding pass at both runtime sizes.
- Colors and visual tokens: existing product aurora palette is reused and matches the reference direction; slight live-translucency difference remains P3.
- Image quality and asset fidelity: existing Codex artwork and the locally installed official Claude app icon are used as raster assets; both render sharply at runtime size.
- Copy and content: labels match the reference structure while reflecting the actual Codex and Claude data model.

## Interaction checks

- Click/keyboard expansion from compact to overview: passed.
- Compact window drag before expansion: passed with pointer-based dragging that takes priority over click expansion.
- Persistent expansion toggle: passed.
- Manual refresh: passed with no error state.
- Chinese/English switching and restoration: passed.
- Always-on-top toggle off/on and restoration: passed.
- Restart at corrected compact size: passed.

## Comparison history

1. First pass — blocked:
   - P1 compact percentage clipping at `104 × 104`.
   - P1 expanded Claude footer clipping at `368 × 368`.
2. Fixes:
   - Recalculated compact/expanded logical sizes to `144` and `480`, including safe insets.
   - Added startup size normalization so saved window state cannot restore obsolete dimensions.
   - Increased expanded bottom breathing room while retaining the source composition.
3. Post-fix evidence:
   - `06-compact-final.png` shows both complete percentages.
   - `10-overview-clean.png` shows both provider panels and all footer copy fully inside the window.

## Implementation checklist

- [x] Dual-provider compact summary.
- [x] Dual-provider expanded overview.
- [x] Truthful Codex weekly-only presentation.
- [x] Claude 5-hour and weekly presentation.
- [x] Refresh, language, expansion, pin interactions.
- [x] Native window sizing and startup normalization.
- [x] Frontend, Rust, and visual QA.
- [x] ChatGPT and Claude Apple subscription date confirmation.
- [x] Cached-date fallback and one-day-before-expiry revalidation behavior.

## Follow-up polish

- Optional: raise aurora saturation/opacity after the user sees the live surface on their wallpaper.
- Optional: map additional backend plan identifiers as they are observed.

final result: passed
