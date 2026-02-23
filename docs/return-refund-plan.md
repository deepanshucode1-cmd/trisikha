# Return Refund Processing Plan

## Problem

The cancel route (`app/api/orders/cancel/route.ts`) processes refunds immediately for cancellations, but does not guard against return orders reaching the refund code. Returns require the product to be received at the warehouse and inspected by admin before a refund is issued.

Additionally, the admin has no UI or endpoint to:
- View return orders
- Manually mark returns as received (webhook fallback)
- Inspect products and process refunds with optional deductions and photo evidence

## Return Flow

```
Customer requests return → OTP verified → RETURN_REQUESTED
  → Shiprocket return pickup created → RETURN_PICKUP_SCHEDULED
  → (Webhook: courier picks up) → RETURN_IN_TRANSIT
  → (Webhook OR admin manual) → RETURN_DELIVERED
  → Admin inspects product → Admin processes refund (full or partial)
  → Razorpay refund → RETURN_REFUND_COMPLETED, order_status = RETURNED
```

## Return Status Values (from migration)

| Status | Meaning |
|---|---|
| `NOT_REQUESTED` | Default — no return |
| `RETURN_REQUESTED` | OTP verified, brief state before Shiprocket call |
| `RETURN_PICKUP_SCHEDULED` | Shiprocket return order created, awaiting courier |
| `RETURN_IN_TRANSIT` | Courier picked up from customer (webhook) |
| `RETURN_DELIVERED` | Product received at warehouse (webhook or admin manual) |
| `RETURN_REFUND_INITIATED` | Razorpay refund started |
| `RETURN_REFUND_COMPLETED` | Refund processed successfully |
| `RETURN_CANCELLED` | Return cancelled |
| `RETURN_FAILED` | Shiprocket return creation failed |

## Admin Returns Tab

The admin orders page gets a new **Returns** tab showing all unresolved returns:
- Filter: `return_status NOT IN ('NOT_REQUESTED', 'RETURN_REFUND_COMPLETED', 'RETURN_CANCELLED')`
- This catches everything including orders stuck due to missed webhooks

### Admin Actions

1. **Mark as Received** — available for `RETURN_PICKUP_SCHEDULED` and `RETURN_IN_TRANSIT` orders
   - Webhook fallback: if Shiprocket webhook missed, admin confirms physical receipt
   - Sets `return_status = RETURN_DELIVERED`

2. **Process Refund** — available for `RETURN_DELIVERED` orders
   - Admin selects product condition: `good_condition`, `damaged`, `used`, `missing_parts`
   - If condition is NOT `good_condition`:
     - Admin note: required text explanation
     - Deduction amount: required, must be <= pre-calculated refund amount
     - Photos: mandatory, 1-4 photos of the damaged/used product
   - If condition is `good_condition`: full refund, no photos needed
   - Final refund = `return_refund_amount - deduction_amount`

## Webhook Reliability

Shiprocket webhooks update `return_status` automatically:
- `PICKED UP` → `RETURN_IN_TRANSIT`
- `Delivered` → `RETURN_DELIVERED`

However, webhooks can be missed, delayed, or fail. The admin "Mark as Received" button is the fallback. The admin tab shows ALL unresolved returns regardless of webhook status, so stuck orders are always visible.

## Compliance Notes

### Custom Deductions
- Return/refund policy must be disclosed upfront (product page, checkout, confirmation email)
- Policy should state: shipping costs (both ways) are deducted, and refund may be reduced if product is received in damaged/used condition
- Admin note serves as documentation for why a deduction was applied
- Photos serve as evidence for customer disputes or chargebacks
- Refund email/credit note must itemize: original amount, shipping deductions, condition-based deduction (with reason), and final refund
- DPDP audit log records who processed it, the deduction, and the reason

### Photo Evidence
- Mandatory only when a deduction is applied (condition != good_condition)
- Photos stored in Supabase Storage with signed URLs for admin viewing
- Serves as evidence for: consumer forum disputes, Razorpay chargebacks, internal audit

## Tracking Endpoint

The tracking endpoint (`/api/track`) is extended to show return status when `return_status !== 'NOT_REQUESTED'`:
- Return status with human-readable messages
- Return pickup AWB for customer reference
- Live tracking for return shipment (via return AWB)

### User-Facing Messages

| `return_status` | Message |
|---|---|
| `RETURN_REQUESTED` | "Return request received. Pickup will be scheduled shortly." |
| `RETURN_PICKUP_SCHEDULED` | "Return pickup scheduled. Keep the package ready." |
| `RETURN_IN_TRANSIT` | "Your return is on its way to our warehouse." |
| `RETURN_DELIVERED` | "Return received. Your refund is being processed." |
| `RETURN_REFUND_INITIATED` | "Refund initiated. It typically reflects within 5-7 business days or may be more depending on your bank and payment method." |
| `RETURN_REFUND_COMPLETED` | "Your refund has been processed to your original payment method." |

## New DB Columns

Added to `orders` table:
- `return_admin_note TEXT` — admin's inspection note
- `return_deduction_amount NUMERIC(10,2) DEFAULT 0` — amount deducted for damaged product
- `return_deduction_reason TEXT` — reason for deduction (product condition label)
- `return_inspection_photos TEXT[]` — array of Supabase Storage paths

## Changes Summary

| File | Action |
|---|---|
| `docs/return-refund-plan.md` | Created (this file) |
| `app/api/orders/cancel/route.ts` | Add `return_status = NOT_REQUESTED` guard to refund lock |
| `supabase/migrations/` | New migration for inspection columns |
| `lib/return-inspection-storage.ts` | Photo upload/validation (follows nominee-storage pattern) |
| `app/api/admin/orders/returns/route.ts` | GET — fetch unresolved return orders |
| `app/api/admin/orders/[id]/mark-return-received/route.ts` | POST — admin marks return received |
| `app/api/admin/orders/[id]/process-return-refund/route.ts` | POST — admin processes return refund |
| `app/api/orders/cancel/retry/route.ts` | Remove RETURN_DELIVERED refund block (moved to dedicated endpoint) |
| `lib/validation.ts` | Add return processing schemas |
| `components/ReadyToShipOrders.tsx` | Add Returns tab |
| `app/api/track/route.ts` | Add return status + return AWB tracking |

## Future Enhancements

- **RETURN_FAILED retry**: Admin UI button to retry failed Shiprocket return order creation (currently in retry route, needs UI)
- **Bulk return processing**: Process multiple returns at once
- **Return analytics**: Dashboard showing return rates, common reasons, deduction patterns
- **Automated follow-up**: Email customer if return is stuck in transit for too long
