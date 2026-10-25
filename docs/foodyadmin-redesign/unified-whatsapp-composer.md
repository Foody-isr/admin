# Unified WhatsApp order messaging

The job is an operational send: a restaurant manager needs to contact the right
customer about a saved order, without confusing editable app text with an approved
Business message. The same composer opens from customer details, Actions and the
orders selection bar. Automatic workflow triggers keep their existing policy.

Design tokens reuse Foody's order workspace: white #FFFFFF surfaces, #1A1A1A text,
#666666 secondary text, #E5E5E5 separators and #167447 for the WhatsApp glyph only.
Semantic variables supply dark mode and focus. The established sans serif carries
14 px message text at 1.75 line height, 14 px section labels and 12 px evidence.
No new font or icon dependency. All alignment follows the reading direction.

```text
Close   Message WhatsApp · order or selection
--------------------------------------------------
Send with                Recipients + current status
Business / app           Customer + actual phone
Message                  Sender + model language
Confirmation             Exact API preview / app editor
Delivery reminder        Attachment preview
Satisfaction / receipt   Acceptance or delivery evidence
--------------------------------------------------
Ready / accepted count             Explicit send
```

The one distinctive element is the quiet conversation preview, with a pale green
message area. Everything around it is plain operational information. The first
layout review rejected two complete composers stacked in one modal and a long
mobile control column: the final mobile layout uses two compact channel options
and a native message picker, keeping the preview and fixed action reachable.

API sends use the existing configured confirmation, reminder and satisfaction
models; arbitrary templates and free text are not new API capabilities. The saved
model controls language and attachments. The app offers editable confirmation,
delivery information and receipt-link text. App drafts are kept per recipient;
changing channel/type/language or closing asks before discarding edited text.

Selection is limited to the current results page (25 orders), clears on filter,
date, restaurant or page changes, and never means all matching orders. One message
is prepared per order; two orders for the same phone can produce two messages, as
stated before dispatch. Missing data, not-due reminders and previous attempts are
visible and excluded. Bulk dispatch requires confirmation of the eligible count.

A lost send response retains the original dispatch ID. Refresh reads its evidence;
it never creates a replacement preview for that attempt. A changed order stops the
remaining queue and requires review. No automatic provider or app fallback. Closing
or losing permission invalidates queued work; an already submitted request cannot
be recalled. Opening the app is recorded only in the current panel as “opened”,
never “sent”. History remains the existing provider-evidence drawer.

Verification uses synthetic Playwright fixtures, phone normalization/scope unit
tests, FR/HE/EN copy and mobile RTL/dark screenshots. No real sends are needed.
The template list now admits orders.manage as a read permission; editing still
requires settings.edit, and tenant membership is still enforced by the API.


Validation (24 October 2026): WhatsApp browser scenarios pass, including separate
app drafts, explicit discard, normalized app handoff, partial bulk eligibility,
changed-order queue stopping, lost-response status refresh, permissions, mobile
Hebrew RTL and English dark mode. Existing order-list/detail regressions pass.
Four composer unit checks pass. Admin lint, TypeScript and build pass with existing
image/hook warnings outside this change. The API build, vet and complete race suite
pass; support-corpus validation passes after regeneration. Landing lint, TypeScript,
build, 44 help tests and the three affected service help contracts pass locally.
No live messages, commits, pushes or deployments were performed. WORKSPACE remains
a local documentation reference; CI readiness requires an authorized immutable
Landing commit. Existing unrelated POS and order edits were preserved.
