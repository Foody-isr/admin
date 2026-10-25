# Modes: supplied Square reference review

Local implementation reviewed on 25 October 2026 against the three supplied
Dashboard captures (Modes list, mode side panel, Open checks editor).

## Measured implementation

The existing Orders Sans assets, neutral theme and 280px navigation rail are
retained. The list uses 32px desktop page gutters, a 48px search field and pill
actions, 64px table rows, 40px mode icons, 20px selection boxes and restrained
one-pixel separators. The profile panel is 464px wide, full-height and undimmed;
it mirrors to the left in Hebrew. Its controls remain reachable on a narrow
viewport. Manage opens the existing full-screen mode editor with a 92px header,
280px rail and independently scrolling content. The selected Open checks rail
entry and home setting use neutral gray surfaces.

Synthetic Playwright captures at a 1440px viewport:

- [Modes list](evidence/modes-square-list-fr.png)
- [Profile panel](evidence/modes-square-preview-fr.png)
- [Open checks](evidence/modes-square-open-checks-fr.png)

The tests assert row/search dimensions, panel geometry, transparent overlay,
keyboard return focus, RTL/narrow overflow, read-only access, staged changes,
failed saves, foreign-device rejection and existing profile assignments.

## Deliberate product differences

- The current API has no mode creation timestamp. The column displays a dash
  with an explanatory tooltip; dates are not invented.
- Assigned-device count is not described as an online/active-device count.
- The subscription upsell in the reference is replaced with actual shared-mode
  guidance. Unsupported Square products and inert navigation are not copied.
- Foody tracks all saved orders, including open checks. The reference's
  no-tracking restriction is not reproduced.
- Foody's Continue and predefined-ticket preferences remain functional. Restaurant
  defaults are separately accessible. These real controls affect content height.
- A new name, created mode or selected deletion stays staged until explicit Save.
  Closing the preview retains the draft; navigation away protects unsaved changes.

These checks establish the stated geometry and workflows, not universal
pixel-equivalence across browsers, operating-system glyph rendering or screens
not supplied in the reference. No production configuration was mutated for the
review. Publication remains separate from the local implementation.
