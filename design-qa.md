# Home redesign design QA

final result: passed

## Evidence

- Source specification: `/Users/johnpauldougherty/Downloads/codex-prompt-home-redesign.md`
- Source timer mockup: `/Users/johnpauldougherty/Desktop/Screenshot 2026-08-22 at 12.03.34 AM.png` (892 × 1044)
- Idle implementation: `/Users/johnpauldougherty/.codex/visualizations/2026/08/20/01a01f51-c970-7a72-920b-24886396181c/home-redesign-build/07-final-idle-home.jpg`
- Active implementation: `/Users/johnpauldougherty/.codex/visualizations/2026/08/20/01a01f51-c970-7a72-920b-24886396181c/home-redesign-build/06-final-active-home.jpg`
- Primary viewport: 390 × 844 at DPR 1
- Responsive viewport: 1280 × 900 at DPR 1
- State coverage: idle timer and active timer

The reference is a timer-component specification board rather than a full Home screen. Comparison therefore normalized the timer tile's proportions, hierarchy, states, copy, and interaction model inside the existing conTRACKtor Home layout instead of applying a one-to-one full-screen crop.

## Comparison result

The source and implementation were inspected together at full view. The timer tile remained large enough to compare without a separate focused crop. The implementation preserves the intended dark tile, clock/play state change, prominent job label, elapsed-time indicator, and independent Stop action. It intentionally uses conTRACKtor's existing color, radius, typography, and Feather icon tokens so the new state feels native to the rest of the app.

No P0, P1, or P2 visual discrepancies remain. Long job names truncate to one line, both live indicators are legible, the Stop target remains at least 48 points tall, and the verified mobile viewport has no horizontal overflow.

## Iteration history

1. The first active-timer implementation nested the Stop control inside the tile button, which produced invalid nested-button markup and web hydration errors. The tile was changed to two sibling controls: the main tile action and the Stop action. The follow-up browser check showed correct semantics and no console errors.
2. A compact treatment was evaluated for unusually narrow web viewports, then discarded because the implementation brief explicitly freezes the existing header, Capture Receipt, and Tell conTRACKtor presentation. The final implementation changes only the requested Home surfaces.

## Interaction and accessibility checks

- The idle tile opens Start Work.
- In the live state, the main tile opens Start Work and Stop is a separate sibling button.
- Stop exposes busy and disabled accessibility state while the mutation runs and reports a user-facing error on failure.
- The elapsed label refreshes every 30 seconds.
- The live pulse respects the operating system's reduced-motion preference.
- Active job names use a one-line ellipsis and descriptive accessibility labels.
- The needs-attention line is one tappable signal; the redundant Recent Activity badge is removed.
- The receipt, Tell, and work tiles form one uninterrupted reflex zone before secondary Home content.

The QA preview used a non-persistent mock timer and did not invoke the production Stop mutation or alter production data. Mutation behavior and routing are covered by repository boundary tests.

## Surface review

- Typography: passed
- Spacing and alignment: passed
- Color and contrast: passed
- Icon use: passed
- Copy and hierarchy: passed
- Responsive behavior: passed
- Accessibility semantics and reduced motion: passed
