# AGENTS.md — foodyadmin

## Service

Next.js 14 App Router portal for restaurant owners and managers. It manages operations, menus, staff, analytics, billing, settings, and Website V3.

Read `README.md` before editing.

## Conventions

- Use TypeScript, App Router, and Tailwind CSS.
- Centralize API calls and shared response types in `src/lib/api.ts`.
- Preserve JWT and `X-Restaurant-ID` handling in the shared API layer.
- Every restaurant route and request must use the active restaurant ID rather than inferred or stale global state.
- Reuse existing components and page patterns before creating abstractions.
- Keep user-facing copy in the existing i18n system.
- Do not introduce secrets; browser configuration is limited to public environment variables.

## Website V3

- Website V3 lives under `src/app/[restaurantId]/website-v3/`, `src/components/website-v3/`, and `src/lib/website-v3/`.
- Draft state is autosaved separately from published state.
- Every editable field must update local state and the iframe preview from the same normalized payload.
- Existing published page and section IDs must round-trip; temporary IDs are only for unpublished entities.
- Order and catering pages use canonical public aliases while content pages use explicit unique slugs.
- Page-level navigation/footer visibility and appearance overrides must not silently mutate global defaults.
- Preview links must match post-publication routing.
- Preserve legacy draft reconciliation for existing restaurants and test it with historic data shapes.

## Menu Domain

- Items and categories are restaurant-global library entities.
- Menus and groups define customer-facing structure.
- Admin item editors must not assume category membership makes an item visible online.
- Keep modifier delta pricing and absolute variant pricing distinct.

## Validation

During iteration, run focused tests and TypeScript checks for the touched area.

Before push, run:

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Do not overwrite unrelated local changes in this service.

## Important Paths

- API client: `src/lib/api.ts`
- Auth context: `src/lib/auth-context.tsx`
- Website V3 state: `src/lib/website-v3/`
- Website V3 components: `src/components/website-v3/`
- Website V3 route: `src/app/[restaurantId]/website-v3/`
- Menu administration: `src/app/[restaurantId]/menu/`
- Sidebar: `src/components/Sidebar.tsx`
