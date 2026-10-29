# Compact website item sheet review — 29 October 2026

The guest product sheet removes the redundant restaurant toolbar, keeps close
available over the photo and after scrolling, and groups quantity and add in its
persistent footer. Product identity, configured portion, price and description
precede choices. Photo-less products reserve close-button space. Sharing remains
available beside the title, with its menu anchored inside the sheet.

Site design remains authoritative for colors, fonts, buttons, options and footer.
The quantity control uses the option surface/text roles. Authored image ratios,
fit and framing remain authoritative; only missing ratios default to 16:9.
Admin's renamed Compact presentation action applies compact geometry without
changing colors, framing, content or fulfillment settings. The existing standard
layout is labelled Full screen on mobile to describe its remaining distinction.
The editor preview cannot mutate the cart. Public quantity, variants, required
choices, stock and note validation keep their current rules.

FR/HE/EN operations updated: website-order-design/item-surface and
guest-ordering/basket. The source inventory also classifies the shared modal,
share control and design normalizer under this presentation feature. Scoped
exact-byte reviews cover only unchanged administrative catalogue, website and
other procedures that share these files.

The isolated preparation lives under output/compact-item-modal. POS and
Backoffice inventories/surfaces retain their exact evidence from Landing develop
359e59e0; they are not revalidated. API changes only synchronize the public help
corpus. Documentation and product publication must be coordinated after develop
verification. The user authorized commits, development deployment and production promotion
on 29 October 2026. Service contracts pin the reviewed immutable Landing commit
before remote CI; production promotes the exact verified development artifacts.

Browser fixtures use synthetic records and in-memory publication. No real order,
restaurant settings, customer, payment or production state is changed.


## Validation

Web: 44 relevant ordering/appearance/color/portion unit cases, lint and TypeScript
pass. Admin: 26 editor/design/color cases, all 8,897 translation keys, lint,
TypeScript and production build pass. Fourteen ordering/combo browser cases and
four gallery/photo-less cases pass in Chromium and WebKit (FR/EN/HE, desktop,
320px, quantity/variant cart snapshots, keyboard focus and sharing).

The editor fixture verifies framing, independent color roles, compact geometry,
draft reload, inert preview and in-memory publication on desktop/RTL mobile.
From Admin run `FOODY_ITEM_MODAL=1 FOODY_WEB_DIR=../foodyweb npx playwright test -c
playwright.website-editor.config.ts item-modal.spec.ts`.

Landing help checks/regressions, lint, TypeScript and production build pass.
All four local help contracts and exact public/embedded corpus equality pass.
API `go test ./internal/support` passes; no Go implementation changes.
On Node 23+, use `NODE_OPTIONS=--no-experimental-strip-types` for browser commands
so Tailwind uses its existing TypeScript config loader. Existing lint warnings
remain outside the edited components. These local checks are followed by PR checks, development verification and
production promotion under the explicit release authorization.
