# Return Requests

## Overview

Returns are handled through the same `POST /api/orders/cancel` + OTP flow as cancellations,
but are triggered only when the order is in a post-pickup state (`PICKED_UP` or `DELIVERED`).
The distinction is detected automatically from `order_status` — the UI and API branch
accordingly without any extra user input.

---

## Eligible States

| `order_status` | Can request return? | Return window |
|---|---|---|
| `CHECKED_OUT` | No — not confirmed yet | — |
| `CONFIRMED` | No — use cancellation instead | — |
| `PICKED_UP` | Yes | No time limit |
| `SHIPPED` | No — in transit, cannot cancel or return | — |
| `DELIVERED` | Yes | **Within 48 hours of delivery** (`delivered_at`) |
| `CANCELLED` | No | — |
| `RETURN_REQUESTED` | No — already requested | — |

---

## Full Flow

```
User on /cancel-order
        │
        ▼
Step 1  Enter Order ID + Email
        │
        ▼
POST /api/orders/send-cancel-otp
 ├─ Detects isReturn (order_status PICKED_UP / DELIVERED)
 ├─ Calls getReturnShippingRate() from Shiprocket (live API; falls back to ₹80)
 ├─ Calculates estimatedRefund = total_amount - forwardShipping - returnShipping
 ├─ Generates OTP (crypto.randomInt, 10-min expiry)
 ├─ Emails OTP with refund breakdown to customer
 └─ Returns { isReturn, originalAmount, forwardShippingCost,
              returnShippingCost, estimatedRefund }
        │
        ▼
Step 2  OTP + Refund Breakdown displayed to user (amber banner)
        User enters OTP and optional reason
        │
        ▼
POST /api/orders/cancel
 ├─ Rate limit + OTP verification (timingSafeEqual)
 ├─ Checks return window for DELIVERED orders (48 h from delivered_at)
 ├─ On OTP pass → sets order_status = RETURN_REQUESTED
 ├─ Re-fetches fresh order
 ├─ Calls getReturnShippingRate() again (live rate at time of confirmation)
 ├─ Creates reverse shipment via createReturnOrder() on Shiprocket
 ├─ Sets return_status = RETURN_PICKUP_SCHEDULED
 ├─ Stores return_refund_amount, return_pickup_awb, etc.
 ├─ Sends confirmation email with final refund amount
 └─ Returns { success, isReturn, refundAmount, originalAmount,
              forwardShippingCost, returnShippingCost, shippingDeduction }
        │
        ▼
Step 3  DONE — shows final refund breakdown
```

---

## Refund Calculation

```
refundAmount = max(0, total_amount - forwardShippingCost - returnShippingCost)
```

- **`forwardShippingCost`** — the original shipping charge stored on the order (`shipping_cost`)
- **`returnShippingCost`** — fetched live from Shiprocket's rate API using the customer's
  pincode → warehouse pincode route; falls back to ₹80 if the API call fails
- The final amount can never go below ₹0

The live Shiprocket call happens **twice**: once in `send-cancel-otp` (to show the estimate)
and once in `cancel` (to use the rate at the moment of actual confirmation). If the rate
changes between the two calls, the confirmed amount takes precedence and is what the
customer actually receives.

---

## Return Window (DELIVERED orders)

- 48 hours from `delivered_at` (set by the Shiprocket delivery webhook)
- `updated_at` is explicitly **not** used as a fallback — it changes on every field mutation
  (OTP sends, status transitions, etc.) and would produce an incorrect window start time
- If `delivered_at` is missing for a `DELIVERED` order (data gap from a missed webhook):
  the window check is skipped and the return is **allowed** (`return_window_unknown` is
  logged for ops to investigate)
- `PICKED_UP` orders have **no time limit** — the customer can request a return at any time

---

## DB Columns Involved

| Column | Set when |
|---|---|
| `order_status` | `RETURN_REQUESTED` on OTP verify; stays until admin processes |
| `return_status` | `RETURN_REQUESTED` → `RETURN_PICKUP_SCHEDULED` → `RETURN_FAILED` |
| `return_reason` | Stored from the user's optional reason text |
| `return_requested_at` | Timestamp of OTP verification |
| `return_order_id` | Shiprocket return order ID |
| `return_shipment_id` | Shiprocket return shipment ID |
| `return_pickup_awb` | AWB code for the reverse shipment |
| `return_refund_amount` | Final calculated refund (after both shipping deductions) |
| `return_pickup_scheduled_at` | Timestamp of successful Shiprocket return order creation |

---

## Current UI Behaviour

| Step | What the user sees |
|---|---|
| Step 1 (FORM) | Order ID + Email fields; no refund preview |
| Step 2 (OTP) | Amber banner with estimated refund breakdown (order total, −forward shipping, −return shipping, = estimated refund) |
| Step 3 (DONE) | Final confirmed refund amount + note that it processes after pickup |

---

## TODO — Show Refund Amount Before OTP is Sent

**Priority: High (customer experience)**

Currently, the refund breakdown is only shown **after** the OTP has already been dispatched
(Step 2). The customer cannot see what they will receive before committing to the flow.

A customer who sees a ₹20 refund on a ₹250 order (because both shipping legs eat most of
the value) might not have initiated the return at all — but at this point they've already
triggered an OTP email and may feel obligated to continue.

### What needs to be built

1. **New API endpoint** — `POST /api/orders/return-estimate`
   - Accepts `{ orderId, emailOrPhone }`
   - Validates identity (email must match order)
   - Checks eligibility (order_status must be PICKED_UP or DELIVERED)
   - Checks return window (48 h for DELIVERED, none for PICKED_UP)
   - Calls `getReturnShippingRate()` to get live return cost
   - Returns `{ eligible, originalAmount, forwardShippingCost, returnShippingCost, estimatedRefund, windowExpiresAt? }`
   - Does **not** generate an OTP or send any email

2. **UI change** — Add a preview step (or inline callout) on Step 1
   - After the user enters Order ID + Email and clicks a "Check Refund" button (or on
     email field blur with a valid order ID), call the estimate endpoint
   - Show the refund breakdown inline before they click "Send Verification Code"
   - If `estimatedRefund` is very low (e.g. < 10% of `originalAmount`), surface a stronger
     warning: *"After shipping deductions, your refund will be approximately ₹X. Are you
     sure you want to proceed?"*
   - If not eligible (window expired, wrong status), show the reason immediately without
     wasting an OTP

### Why the estimate may differ from the confirmed amount

The return shipping rate is fetched live from Shiprocket's API. Rates can change between
the estimate call and the final confirmation call (e.g. courier partner changes, fuel
surcharge updates). The estimate should be labelled **"Estimated Refund"** and the
confirmation step should show **"Confirmed Refund"** with a note that the final amount
is recalculated at the time of pickup scheduling.

---

## Error States

| Condition | Response |
|---|---|
| Shiprocket return order creation fails | `return_status = RETURN_FAILED`; admin retries via `/api/orders/cancel/retry` |
| Confirmation email fails | Logged; does not block the return — pickup is still scheduled |
| `delivered_at` missing for DELIVERED order | `return_window_unknown` logged; return allowed (fail open) |
| Return already requested | 200 with `{ message: "Return already requested", returnStatus }` |
| Window expired (> 48 h after `delivered_at`) | 400 with descriptive error |
