# Task 1 Report: Remove Legacy Technical Pages

## Scope

- Added title-based recognition for the legacy `_site` technical page.
- Reconciliation now removes technical pages identified by either slug or normalized title.
- Footer sections remain global `_site` sections and lose page identity when detached.

## TDD Evidence

1. Added a regression test covering a page with `slug: "site"`, `title: "_site"`, and a footer section referencing its ID.
2. Ran the requested command:
   - `npm test -- src/lib/website-v3/__tests__/state.test.ts`
   - Result: unavailable because `foodyadmin/package.json` does not define a `test` script.
3. Ran the focused test with the repository's available TypeScript runner:
   - `../foodyweb/node_modules/.bin/tsx --test src/lib/website-v3/__tests__/state.test.ts`
   - RED: 8 passed, 1 failed; the new test failed because the title-based technical page remained in `pages`.
4. Implemented `isTechnicalSitePage` and applied it to both `technicalPages` and `keptPages`.
5. Re-ran the focused test:
   - GREEN: 9 passed, 0 failed.

## Additional Validation

- `npm run typecheck` — passed.

## Files Included

- `src/lib/website-v3/state.ts`
- `src/lib/website-v3/__tests__/state.test.ts`
- `.superpowers/sdd/2026-07-30-website-v3-navigation-states/task-1-report.md`

The pre-existing change in `src/lib/api.ts` was not modified, staged, reverted, or committed. Other unrelated pre-existing worktree changes were also left untouched.

## Commit

`fix(website-v3): remove legacy technical pages` (hash provided in the task handoff)
