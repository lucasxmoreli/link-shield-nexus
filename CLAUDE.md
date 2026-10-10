# CloakerX / link-shield-nexus — Claude context

**Last updated:** 2026-09-17  
**Deadline billing self-serve:** 01/10/2026 · **Lançamento Cauã:** 03–04/10/2026  
**Supabase:** `jhjympznbobcgdltnjfk` · **Stripe:** `acct_1TLTvILZEOji6sEJ`

## Non-negotiables

- **Billing = Stripe USD only.** Cakto was abandoned permanently (2026-09-16). Do not revive Cakto checkout, webhook, offers, or fatia 3b.
- Cakto code lives in `_archive/cakto/` only. Orphan `cakto_*` tables may remain in DB — do not drop without an explicit migration task.
- **This chat/repo = SaaS panel + Edge Functions.** Do **not** edit `motor/server.js` or touch the VPS unless the user explicitly switches tracks.
- Spec before code for risky changes. Prefer fail-closed in Postgres/RLS over UI-only gates.

## Billing model (Spec 2)

| Plan | Included | Hard cap (via packs) | USD/mo |
|------|----------|----------------------|--------|
| BASIC | 8k clicks / 1 domain / 3 campaigns | 18k / 3 / 5 | $57.99 |
| PRO | 20k / 3 / 8 | 40k / 6 / 12 | $96.99 |
| FREEDOM | 100k / 10 / 20 | 150k / 15 / 30 | $234.99 |
| ENTERPRISE | 300k / 20 / ∞ | 400k / 25 / ∞ | $389.99 |

- **No metered overage.** Capacity beyond included quotas = licensed **packs** (clicks / domains / campaigns).
- Plan = Stripe subscription A. Packs = **separate** subscription (`metadata.kind=packs`), charge on buy (`always_invoice`), own cycle, no credit on cancel.
- Catalogs:
  - Test: `supabase/functions/_shared/stripe-catalog.test.json`
  - Live: `supabase/functions/_shared/stripe-catalog.live.json` (created; Spec 2 USD mirrored)
- UI `src/lib/plan-config.ts` still points at **test** price IDs until go-live swap.
- Pack edge picks test vs live by `STRIPE_SECRET_KEY` (`sk_test` vs `sk_live`).
- Webhook + checkout allowlists include **both** test and live Spec 2 price IDs. Legacy live prices remain in webhook maps for existing subs only (blocked from new checkout).

## Key Edge Functions

| Function | Role | JWT |
|----------|------|-----|
| `create-checkout-session` | Plan Checkout only | on |
| `stripe-webhook` | Activate / sync / packs safety | off |
| `manage-subscription-addon` | Buy/cancel packs on packs sub | on |
| `create-portal-session` | Customer portal | on |

Kill switch: `STRIPE_CHECKOUT_DISABLED` must be exactly `"false"` to open checkout/packs.

## Current status (as of live catalog)

**Done**

- Test catalog + E2E FREE → BASIC + pack domain
- Packs separate sub + charge-now
- Live Spec 2 catalog (4 plans + 11 pack prices)
- Code wired for dual test/live IDs; edge deploys updated
- Cakto archived

**Still open before 01/10**

1. ~~Toast checkout: celebrate only when profile is actually ACTIVE~~ (done 2026-09-17)
2. Extra E2E: pack clicks/campaigns; cancel plan must tear down packs
3. ~~SaaS security pass (RLS/activation fail-closed for open signup path)~~ — FREE/INVITED already gated; 2026-09-17 locked client writes on `domains` + `enforce_domain_limit` + packs col protect
4. Go-live checklist: `sk_live` + live `whsec`, swap `plan-config` to live IDs, verify webhook endpoint live
5. Optional: archive/deactivate legacy live prices (not default-of-product blockers)
6. Fabio FREEDOM lifetime — **after** launch, admin path, not mentorado flow
7. Motor P0 / dry-run Cauã — **parallel track** (other chat / VPS); not this repo’s default work

## Go-live (do not do early)

1. Supabase secrets → `STRIPE_SECRET_KEY=sk_live_…`, live `STRIPE_WEBHOOK_SECRET`
2. Stripe Dashboard → webhook live → `…/functions/v1/stripe-webhook`
3. Swap `plan-config.ts` stripePriceIds to live IDs from `stripe-catalog.live.json`
4. Smoke: one real card purchase (refund after) → ACTIVE + pack

## When asked to “update Claude”

Refresh this file + `.cursor/rules/cloakerx-billing.mdc` so future sessions never reintroduce Cakto or metered overage.
