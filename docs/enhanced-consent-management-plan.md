# Data Collection Notice — DPDP Rules 2025 Compliance

## Context

Trishikha Organics collects personal data (email, phone, name, address) at checkout to fulfill orders. Currently, there is **no data collection notice displayed** — this violates Rule 3 (Notice).

However, **no consent is required** for order processing. Placing an order is a voluntary act, and fulfilling it is a "legitimate use" under Section 7 of the DPDP Act 2023.

Note: Cookies are only used for admin authentication, not for guest tracking. The existing `CookieConsent.tsx` banner is not relevant to guest DPDP compliance.

### Legal Framework
- **Section 7 (Legitimate Uses)**: Processing personal data to fulfill an order the user voluntarily placed does NOT require consent. The act of placing the order itself implies the user wants it fulfilled.
- **Rule 3 (Notice)**: Even for legitimate uses, you MUST **display** an itemized notice — what data is collected, why, who processes it, user rights, grievance officer contact. No acknowledgment or checkbox required — just display it.
- **Section 6 / Rule 4 (Consent)**: Only applies to processing that goes **beyond** order fulfillment (e.g., marketing emails). Not applicable to order data.
- **Section 15**: Penalties up to ₹250 crore for non-compliance.

### Key Design Decision
- **Order processing** = Section 7 legitimate use → **NO consent, NO checkbox, NO acknowledgment** needed.
- **Data collection notice** at checkout = Rule 3 → **display-only** informational card. No gating of Place Order.
- **Marketing communications** = would require explicit consent (Rule 4) — **out of scope** for this plan. Can be added later if needed.

### What This Plan Does NOT Include
- No consent collection, storage, or withdrawal (no consent is being obtained)
- No admin consent records tab (nothing to track)
- No marketing consent checkbox (out of scope — add when marketing emails are planned)
- No changes to checkout validation schema (no new fields)

---

## Step 1: Data Collection Notice Component

**File**: `components/checkout/DataCollectionNotice.tsx`

This is a **display-only** Rule 3 notice shown at checkout above the Place Order button. No checkbox, no gating — just information.

### Layered Notice Approach (Rule 3 best practice)

**Layer 1 — Always visible (collapsed state):**
A brief summary shown by default:

```
"We collect your name, email, phone, and address to fulfill your order.
 Data stored with Supabase and shared with Razorpay (payment) & Shiprocket (shipping).
 View full details ▼"
```

**Layer 2 — Expandable (full notice):**
Shown when user clicks "View full details":

```
Title: "Data Collection Notice"

"By placing this order, Trishikha Organics will collect and process
 the following personal data for order fulfillment under Section 7
 of the DPDP Act 2023 (legitimate use):"

DATA WE COLLECT:
  - Name, email, phone number — for order processing and communication
  - Shipping and billing address — for delivery and invoicing
  - Payment information — processed by Razorpay (we do not store card details)

HOW YOUR DATA IS USED:
  - Processed solely to fulfill your order
  - Stored securely with Supabase (database hosting)
  - Shared with Shiprocket for shipping and Razorpay for payment
  - Retained for 8 years for tax compliance (Income Tax Act)

YOUR RIGHTS (DPDP Act 2023):
  You have the right to:
  - Access your personal data
  - Correct inaccurate data
  - Request erasure of your data (subject to legal retention requirements)
  - File a grievance with our Grievance Officer
  - Complain to the Data Protection Board of India
  - Nominate another person to exercise these rights on your behalf

  Exercise your rights at: /my-data

GRIEVANCE OFFICER:
  Trishikha Organics
  Email: trishikhaorganic@gmail.com
  Phone: +91 79841 30253
  Response within 90 days (DPDP Rule 14(3))
```

**Layer 3 — Links:**
```
Links: Privacy Policy | My Data | Data Protection Board of India
```

### Language Support
The notice component should support **English** and **Hindi** (toggle in the UI). Rule 3 requires notices to be available in English and relevant languages from the Eighth Schedule of the Indian Constitution. Hindi covers the primary audience; more languages can be added based on user base.

### Props
```
None — this is a stateless display component with no callbacks.
```

### UI
Collapsible card using Tailwind. Layer 1 visible by default, Layer 2 expandable. Same styling as checkout page. No checkbox, no form elements.

---

## Step 2: Checkout Frontend Modifications

**File**: `components/checkout/CheckoutPage.tsx`

Changes:
1. Import and render `DataCollectionNotice` above the Place Order button
2. **No new state** — the notice is display-only
3. **No gating** — Place Order remains gated only by existing `shippingCalculated` check

Location: Insert between the order summary total and the Place Order button.

---

## Step 3: Get-Data & Export-Data — No Changes

Since no consent is being recorded, no changes are needed to:
- `app/api/guest/get-data/route.ts`
- `app/api/guest/export-data/route.ts`

The privacy policy (already published) and the checkout notice (this plan) together satisfy Rule 3.

---

## Files Summary

| Action | File |
|--------|------|
| CREATE | `components/checkout/DataCollectionNotice.tsx` |
| MODIFY | `components/checkout/CheckoutPage.tsx` — render DataCollectionNotice above Place Order |

That's it. Two files.

Reuse from existing codebase:
- Tailwind styling patterns from `CheckoutPage.tsx`

---

## Verification

1. `npm run build` — no type errors
2. **Checkout flow**: verify Data Collection Notice displays above Place Order with layered layout (summary visible, details expandable)
3. **Place Order**: verify it is NOT gated by the notice — existing behavior unchanged
4. **Mobile**: verify notice is responsive and readable on small screens
5. **Links**: verify Privacy Policy and My Data links work

---

## Future Scope (Not Part of This Plan)

When marketing emails are planned, implement:
- `marketing_communications` consent checkbox (opt-in, unchecked by default)
- `consent_records` database table
- `lib/consent.ts` service layer
- Consent withdrawal via `/my-data`
- Withdrawal confirmation email
