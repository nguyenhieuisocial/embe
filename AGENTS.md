# EmBe project instructions

## Product priority

- EmBe is a mobile-first web app, not a desktop website that is later reduced.
- Design, implement, and test in this order: iPhone/iOS Safari, Android mobile, tablet, desktop.
- Before accepting any UX or frontend change, ask: “Can this be used comfortably with one hand on an iPhone?” Fix mobile first when the answer is no.

## Required mobile behavior

- Treat touch as the primary input. Never require hover, precise pointer placement, or desktop-only interaction.
- Respect every iOS safe area, including notch, Dynamic Island, and Home Indicator.
- Use dynamic viewport units with a compatible fallback. Verify virtual-keyboard, scroll, focus, fixed, sticky, and modal behavior on iOS Safari.
- Keep primary actions within thumb reach and interactive targets at least 44 by 44 CSS pixels.
- Prefer app-like flows: persistent bottom navigation, focused full-screen tasks, useful loading/empty/error states, and optimistic updates only when rollback is safe.
- Preserve PWA installability, standalone mode, fast initial load, smooth scrolling, reduced-motion support, and Vietnamese typography.
- Avoid desktop tables on small screens. Convert them to cards, lists, disclosure rows, or a deliberately scrollable data view.
- Desktop is a progressive enhancement of the mobile product.

## Verification gate

- Frontend work is incomplete until automated mobile-shell checks pass.
- For material UI changes, verify at iPhone viewport sizes in portrait first, then Android mobile, tablet, and desktop.
- Test keyboard-only accessibility as a separate compatibility requirement; touch-first does not remove accessibility obligations.

## Optional project-local development tools

- UI UX Pro Max is installed locally at `.agents/skills/ui-ux-pro-max`. When using it, read its `SKILL.md`; query only the relevant UX concern. Its recommendations do not replace EmBe's existing visual direction or accessibility checks. Install provenance is in `docs/development-tools.md`.
- RTK is available at `tools/bin/rtk-0.48.0/rtk.exe`. Use explicitly for compact command summaries, not automatic command rewriting. For failures, exact evidence, full instructions and source review, use the original unfiltered command. Do not install global hooks.
- Adapted from gstack's reuse ladder: prefer the existing helper, standard library, native platform capability, then an installed dependency before adding another tool. This is not a full gstack installation; do not invoke its deploy/browser setup or treat its defaults as permission to expand scope.
