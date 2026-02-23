# Future Improvements

## Security

### Per-Order OTP Cooldown (OTP Spam Prevention)

**Problem:** The `/api/orders/send-cancel-otp` endpoint rate-limits by IP only. An attacker who knows a valid `orderId + email` can trigger unlimited OTP emails to the victim by rotating IPs or using proxies. This enables email bombing / spam.

**Solution:** Add a per-order OTP cooldown. Before generating a new OTP, check if one was sent recently (e.g., within the last 60 seconds). Reject with "Please wait before requesting another OTP."

**Implementation:**
- Use the existing `otp_expires_at` column: if `otp_expires_at` exists and `(otp_expires_at - 9 minutes) > now`, an OTP was sent less than 60 seconds ago (since OTP validity is 10 minutes)
- Alternatively, add an `otp_sent_at` timestamp column for explicit tracking
- Return a generic 429 with remaining cooldown time

**Priority:** Medium — not exploitable for data access, but can harass customers via email flooding.
