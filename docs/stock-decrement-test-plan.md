# Stock Decrement Test Plan

## What the code claims vs what actually happens

The security audit listed "Atomic stock decrement — Supabase RPC + optimistic-lock fallback" as **confirmed working**. The route code (`app/api/checkout/route.ts:285`) supports this with the comment "Atomic stock update using database-level decrement."

This is **inaccurate**. `decrement_stock` is referenced in the route but defined in **no migration, no seed file, and no other file in the codebase**. The RPC call always fails with a "function not found" error, and every checkout silently falls through to the optimistic lock path. The "atomic RPC" branch is dead code.

---

## Implementation as it actually runs

```
1. Fetch all products in one query (stock snapshot captured here)
2. Pre-flight loop: check each item's stock against snapshot
   → if insufficient: 400 immediately, nothing written
3. Create order row
4. Per-item loop:
   a. Call supabase.rpc('decrement_stock', ...) ← always fails (function not found)
   b. Fallback: UPDATE products SET stock = snapshot_stock - quantity
                WHERE id = product_id AND stock = snapshot_stock  ← optimistic lock
      → if 0 rows affected (stock changed since snapshot): rollback order, 500
5. Create Razorpay order
   → if Razorpay fails: delete order + attempt stock restore from snapshot
```

---

## Bugs and gaps found during analysis

### Bug 1 — `decrement_stock` RPC does not exist
**Location**: `app/api/checkout/route.ts:285`

The RPC function has no migration. The route always hits the fallback. The audit finding should be corrected: only the optimistic lock path is active.

### Bug 2 — Multi-item cart rollback is incomplete
**Location**: `app/api/checkout/route.ts:299-307`

The per-item loop decrements stock one item at a time. If item 1 succeeds and item 2's optimistic lock fails, the rollback deletes the order but **does not restore item 1's stock**. Stock is permanently lost for item 1.

```
Item 1: optimistic lock → success (stock: 10 → 8)
Item 2: optimistic lock → 0 rows (stock changed by concurrent request) → rollback
Rollback: order deleted ✓  |  item 1 stock restored? ✗
Result: stock for item 1 is now 8 instead of 10, order doesn't exist
```

### Bug 3 — Razorpay failure stock restore uses stale snapshot
**Location**: `app/api/checkout/route.ts:402-410`

If Razorpay order creation fails, the restore sets `stock = product.stock + item.quantity` where `product.stock` is the value read at line 63 — before any decrements. If a concurrent request decremented stock between the initial fetch and this restore, the restore overwrites the current correct stock value with a stale one.

```
Initial fetch: stock = 10
This request decrements to 8.
Concurrent request decrements to 6.
Razorpay fails → restore: stock = 10 + 2 = 12 ✗  (should be 8, undoing only this request's decrement)
```

### Gap 4 — Pre-flight check uses stale snapshot
**Location**: `app/api/checkout/route.ts:96`

Stock is checked against a snapshot taken at the start of the request. Two concurrent requests for the same product can both pass the pre-flight check using the same stock value. The optimistic lock catches one of them and triggers a rollback, so overselling is prevented — but the rollback at that point is incomplete (Bug 2).

---

## Test cases

**Test file**: `tests/stock-decrement.test.ts`
**Method**: Direct handler import + `vi.mock()` (same pattern as `tests/payment-verify.test.ts`)

All Supabase calls are mocked. Shiprocket and Razorpay are also mocked so tests are isolated to the stock decrement logic. A valid `checkoutSchema`-compliant request body is constructed once as a fixture and reused.

---

### A. Pre-flight stock check (no DB writes occur)

| # | Scenario | Mock: products fetch | Expected |
|---|---|---|---|
| A1 | Product not found in DB | `products = []` | 400 "No products found" |
| A2 | Single product missing from result set | `products` list omits one item from cart | 400 "Product not found: \<id\>" |
| A3 | Stock < quantity | `stock = 1`, quantity = 5 | 400 "Insufficient stock..." |
| A4 | Stock = 0 | `stock = 0` | 400 |
| A5 | Stock exactly equals quantity | `stock = 5`, quantity = 5 | passes pre-flight, proceeds to write |

Verify for A1–A4: `supabase.rpc` and `supabase.from('products').update` are **never called** — the route exits before the decrement loop.

---

### B. RPC always fails — fallback is always taken

| # | Scenario | Mock: rpc | Expected |
|---|---|---|---|
| B1 | RPC returns error (simulating "function not found") | `rpc: mockRejectedValue({ message: "Could not find the function..." })` | Fallback optimistic lock is attempted |
| B2 | RPC returns success | `rpc: mockResolvedValue({ data: null, error: null })` | Fallback is **not** attempted; proceeds to order item creation |

B2 documents the intended future behaviour once the RPC migration is created. B1 documents current reality.

> **Finding note**: B1 is the only path that currently executes in production. The plan to implement `decrement_stock` should be tracked separately.

---

### C. Optimistic lock — fallback path

| # | Scenario | Mock: products update | Expected |
|---|---|---|---|
| C1 | Lock succeeds (1 row affected) | `update → { data: [{}], error: null }` | Proceeds to order item creation |
| C2 | Lock fails — stock changed since snapshot (0 rows) | `update → { data: [], error: null }` (no error, but empty result treated as conflict) | 500; order deleted (verify rollback mock called) |
| C3 | Lock returns DB error | `update → { data: null, error: { message: "..." } }` | 500; order deleted |

For C2 and C3, verify that `supabase.from('orders').delete().eq('id', orderData.id)` is called exactly once.

---

### D. Multi-item rollback gap (Bug 2)

| # | Scenario | Expected (current) | Expected (after fix) |
|---|---|---|---|
| D1 | 2-item cart: item 1 lock succeeds, item 2 lock fails | Order deleted; item 1 stock **not restored** — stock = 8 | Order deleted; item 1 stock restored — stock = 10 |
| D2 | 3-item cart: items 1 & 2 succeed, item 3 fails | Order deleted; stocks for items 1 & 2 not restored | All stocks restored |

These tests intentionally document the **current broken behaviour** to establish a baseline. They should be marked `it.fails` or have an explicit comment that they are expected to fail until Bug 2 is fixed. They serve as regression anchors.

Mock setup for D1:
```ts
// First call to update (item 1): resolves with 1 row
mockProductUpdate.mockResolvedValueOnce({ data: [{}], error: null });
// Second call to update (item 2): resolves with 0 rows → triggers rollback
mockProductUpdate.mockResolvedValueOnce({ data: [], error: null });
```

---

### E. Razorpay failure — stock restore correctness (Bug 3)

| # | Scenario | Expected (current) | Expected (after fix) |
|---|---|---|---|
| E1 | All locks succeed, Razorpay fails | Restore sets `stock = snapshot + qty` — could overwrite concurrent decrements | Restore uses an atomic `stock = stock + qty` increment, not a snapshot value |
| E2 | Razorpay fails for multi-item cart | Each item's restore attempted; any Supabase error is swallowed | Same; errors logged |

Mock setup for E1:
```ts
mockRazorpayOrderCreate.mockRejectedValue(new Error("Razorpay down"));
// Capture what value the restore UPDATE was called with
// Assert it uses product.stock + qty (current bug) vs an atomic increment (after fix)
```

---

### F. Shipping verification (mocked Shiprocket)

These tests exist in the checkout route but are relevant context for the stock decrement tests since shipping verification happens before the stock decrement loop. A failed shipping verification should short-circuit before any stock writes.

| # | Scenario | Expected |
|---|---|---|
| F1 | Shiprocket login throws | 502; no stock writes |
| F2 | Courier not in available list | 400; no stock writes |
| F3 | Courier rate mismatch > ₹1 | 409; no stock writes |

Verify for F1–F3: `supabase.rpc` and `supabase.from('products').update` are **never called**.

---

### G. Server-side price integrity

| # | Scenario | Expected |
|---|---|---|
| G1 | Client submits `total_amount` that differs from server-calculated total | Server uses its own calculated total — client value is ignored |
| G2 | Client submits a `price` in cart_items that differs from DB price | Server fetches product from DB and uses `product.price`, not `item.price` |

These verify that the checkout cannot be exploited by manipulating client-side prices.

---

## Mock strategy

Same pattern as `tests/payment-verify.test.ts`: module-level `vi.fn()` instances, single `vi.mock()` factory, `beforeEach` reset.

```ts
const mockRpc = vi.fn();
const mockProductsFetch = vi.fn();
const mockProductUpdate = vi.fn();
const mockOrderInsert = vi.fn();
const mockOrderDelete = vi.fn();
const mockOrderItemInsert = vi.fn();
const mockRazorpayOrderCreate = vi.fn();

vi.mock("@/utils/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "products") return {
        select: () => ({ in: () => mockProductsFetch() }),
        update: () => ({ eq: () => ({ eq: () => mockProductUpdate() }) }),
      };
      if (table === "orders") return {
        insert: () => ({ select: () => ({ single: () => mockOrderInsert() }) }),
        delete: () => ({ eq: () => mockOrderDelete() }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
      if (table === "order_items") return {
        insert: () => Promise.resolve({ error: null }),
      };
    },
    rpc: mockRpc,
  }),
}));

vi.mock("razorpay", () => ({
  default: vi.fn(() => ({
    orders: { create: mockRazorpayOrderCreate },
  })),
}));

vi.mock("@/utils/shiprocket", () => ({
  default: {
    login: vi.fn().mockResolvedValue("mock-token"),
  },
}));

// Mock Shiprocket serviceability fetch
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  json: () => Promise.resolve({
    data: {
      available_courier_companies: [{
        courier_company_id: 1,
        rate: 100,
      }],
    },
  }),
}));

beforeEach(() => {
  mockRpc.mockReset();
  mockProductsFetch.mockReset();
  mockProductUpdate.mockReset();
  mockOrderInsert.mockReset();
  mockOrderDelete.mockReset();
  mockRazorpayOrderCreate.mockReset();

  // Default happy-path stubs (override per test as needed)
  mockRpc.mockRejectedValue({ message: "function decrement_stock not found" }); // current reality
  mockProductsFetch.mockResolvedValue({ data: [{ id: "prod-1", name: "Manure", price: 500, stock: 10, weight: 2 }], error: null });
  mockProductUpdate.mockResolvedValue({ data: [{}], error: null });
  mockOrderInsert.mockResolvedValue({ data: { id: "order-1", guest_email: "x@x.com", total_amount: 600 }, error: null });
  mockRazorpayOrderCreate.mockResolvedValue({ id: "order_razorpay123", amount: 60000 });
});
```

---

## Summary of findings

| Finding | Type | Status |
|---|---|---|
| `decrement_stock` RPC not defined in any migration | **Bug** | Dead code — fallback always used; RPC migration needs to be created |
| Audit incorrectly listed RPC as "confirmed working" | **Audit correction** | Update `docs/security-audit.md` |
| Multi-item rollback does not restore partially decremented stock | **Bug** | Unresolved |
| Razorpay failure restore uses stale snapshot value | **Bug** | Unresolved |
| Pre-flight stock check uses stale snapshot (concurrent bypass) | **Gap** | Partially mitigated by optimistic lock; full mitigation requires the RPC with a `WHERE stock >= quantity` guard |
