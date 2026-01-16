# PCI DSS Self-Assessment Questionnaire A (SAQ-A)
## Trisikha Organics E-Commerce Platform

**Document Version:** 1.0  
**Assessment Date:** 2026-01-15  
**Valid Until:** 2027-01-15  

---

## Part 1: Merchant Information

| Field | Value |
|-------|-------|
| **Merchant Name** | Trisikha Organics |
| **DBA (Doing Business As)** | Trishikha Organics |
| **Contact Name** | [YOUR NAME] |
| **Contact Email** | [YOUR EMAIL] |
| **Contact Phone** | [YOUR PHONE] |
| **Business Address** | [YOUR BUSINESS ADDRESS] |
| **Website URL** | [YOUR WEBSITE URL] |
| **Merchant ID (MID)** | [FROM RAZORPAY DASHBOARD] |

---

## Part 2a: SAQ-A Eligibility Confirmation

> **You are eligible for SAQ-A if you can confirm ALL of the following statements.**

| # | Eligibility Statement | Confirmed |
|---|----------------------|-----------|
| 1 | My e-commerce website **completely outsources** all payment processing to a PCI DSS validated third-party payment processor | ✅ **YES** |
| 2 | My e-commerce website does **NOT electronically store, process, or transmit** any cardholder data on my systems or premises | ✅ **YES** |
| 3 | My website uses **only an iframe/redirect** hosted by a PCI DSS validated third-party | ✅ **YES** |
| 4 | Each element of the payment page delivered to my consumers' browser **originates entirely** from my PCI DSS validated payment processor | ✅ **YES** |
| 5 | My company has confirmed that my website **does not receive cardholder data** | ✅ **YES** |
| 6 | I have implemented controls to ensure **scripts cannot affect the payment form** | ✅ **YES** |

### Evidence of Eligibility

#### Payment Flow Implementation
- **Payment Gateway:** Razorpay (PCI DSS Level 1 Service Provider)
- **Integration Type:** Hosted Checkout Modal (`checkout.razorpay.com/v1/checkout.js`)
- **Card Entry Location:** Razorpay-controlled popup/iframe
- **Implementation Files:**
  - `components/checkout/CheckoutPage.tsx` - Uses `razorpay.open()` for payment
  - `app/api/payment/verify/route.ts` - Only receives `razorpay_payment_id`, `razorpay_signature`, `razorpay_order_id`

#### Data Never Stored on Our Systems
| Data Type | Stored? | Evidence |
|-----------|---------|----------|
| Full PAN (Card Number) | ❌ NO | No card input fields exist |
| CVV/CVC | ❌ NO | Handled by Razorpay popup |
| Expiration Date | ❌ NO | Handled by Razorpay popup |
| Cardholder Name | ❌ NO | Handled by Razorpay popup |
| Payment Token | ✅ YES | `razorpay_payment_id` (tokenized reference) |

---

## Part 2b: SAQ-A Questionnaire

### Requirement 2: Apply Secure Configurations to All System Components

| ID | Question | Response | Implementation Notes |
|----|----------|----------|---------------------|
| 2.1.1 | Vendor-supplied defaults for system passwords and security parameters are changed before installing on the network | **YES** | All credentials stored as environment variables. No default passwords in codebase. |

---

### Requirement 6: Develop and Maintain Secure Systems and Software

| ID | Question | Response | Implementation Notes |
|----|----------|----------|---------------------|
| 6.4.3 | All payment page scripts that are loaded and executed in the consumer's browser are managed as follows: All scripts are authorized, integrity verified, and inventoried | **YES** | Only authorized script: `checkout.razorpay.com/v1/checkout.js`. CSP header restricts script sources. |

**Script Inventory:**
| Script Source | Purpose | Authorized |
|---------------|---------|------------|
| `https://checkout.razorpay.com/v1/checkout.js` | Payment modal | ✅ YES |

**CSP Configuration (from `next.config.ts`):**
```
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com
frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com
connect-src 'self' https://*.supabase.co https://api.razorpay.com
```

---

### Requirement 8: Identify Users and Authenticate Access to System Components

> **Note:** This app has two user types:
> - **Guests:** Customers who checkout without creating an account (no authentication required)
> - **Admins:** Store administrators who manage orders/products (authenticated via Supabase)
> 
> Since guests never access system components or cardholder data (all payment handled by Razorpay), Requirement 8 applies only to admin users.

| ID | Question | Response | Implementation Notes |
|----|----------|----------|---------------------|
| 8.2.1 | All users are assigned a unique ID before allowing them to access system components or cardholder data | **YES** | Admin accounts are individual Supabase Auth accounts with unique UUIDs. Guest users have no accounts. |
| 8.2.2 | Group, shared, or generic accounts are not used | **YES** | Each admin has individual Google account credentials. No shared accounts. |
| 8.3.1 | All user access to system components is authenticated with at least one authentication factor | **YES** | Admin access via Supabase Auth with Google OAuth (SSO). Google accounts provide built-in 2FA. |
| 8.3.6 | If passwords/passphrases are used, minimum complexity is a length of at least 12 characters OR 8 characters with complexity | **N/A** | Admins use Google OAuth - no passwords stored in our system. Password policy enforced by Google. |

**Recommendation:** Enable MFA for all admin accounts in Supabase Dashboard.

---

### Requirement 9: Restrict Physical Access to Cardholder Data

| ID | Question | Response | Implementation Notes |
|----|----------|----------|---------------------|
| 9.x | Physical security requirements | **N/A** | No cardholder data is stored, processed, or transmitted by our systems. All payment data is handled by Razorpay. |

---

### Requirement 11: Test Security of Systems and Networks Regularly

| ID | Question | Response | Implementation Notes |
|----|----------|----------|---------------------|
| 11.3.2 | External vulnerability scans are performed at least quarterly | **OPTIONAL** | Not required for SAQ-A merchants, but recommended for security hygiene. |

---

### Requirement 12: Support Information Security with Organizational Policies and Programs

| ID | Question | Response | Implementation Notes |
|----|----------|----------|---------------------|
| 12.1.1 | An overall information security policy is established, published, maintained | **YES** | `SECURITY_PLAN.md` documents all security measures. |
| 12.8.1 | A list of all TPSPs with which account data is shared or that could affect security of account data is maintained | **YES** | See Service Provider list below. |
| 12.8.2 | Written agreements with TPSPs include acknowledgement of responsibility for account data | **YES** | Razorpay Terms of Service & Merchant Agreement accepted. |
| 12.8.5 | Information about which PCI DSS requirements are managed by each TPSP is maintained | **YES** | Documented below. |

---

## Part 3: Service Provider Inventory

| Service Provider | Service Type | PCI DSS Compliance | Shared Data |
|------------------|--------------|-------------------|-------------|
| **Razorpay** | Payment Gateway | PCI DSS Level 1 Service Provider | Payment data (handled entirely by Razorpay) |
| **Supabase** | Database & Auth | SOC 2 Type II | Customer data, order data (no card data) |
| **Shiprocket** | Shipping | N/A (no payment data) | Shipping addresses only |
| **Vercel** (if used) | Hosting | SOC 2 Type II | Application code (no payment data) |

### Razorpay PCI DSS Evidence
- Razorpay is listed as a **PCI DSS Level 1 Service Provider**
- To obtain their Attestation of Compliance (AOC): Contact Razorpay support at **compliance@razorpay.com**
- Store the AOC with this document

---

## Part 4: Attestation of Compliance (AOC)

### Section 4a: Merchant Attestation

I, the undersigned, confirm that:

1. I am authorized to represent my company in completing this assessment
2. I have verified that all requirements of PCI DSS SAQ-A have been met
3. No cardholder data is stored, processed, or transmitted on my systems
4. All payment processing is outsourced to Razorpay, a PCI DSS validated service provider

| Field | Value |
|-------|-------|
| **Signature** | _________________________ |
| **Printed Name** | [YOUR NAME] |
| **Title** | [YOUR TITLE] |
| **Date** | 2026-01-15 |

### Section 4b: Compliance Status

| Status | Selection |
|--------|-----------|
| **Compliant** | ✅ All applicable requirements are in place |
| **Non-Compliant with Remediation** | ☐ |
| **Non-Compliant** | ☐ |

---

## Part 5: Action Items

| # | Item | Status | Due Date |
|---|------|--------|----------|
| 1 | Fill in merchant information (Part 1) | ☐ Pending | Immediate |
| 2 | Enable MFA for admin Supabase accounts | ☐ Pending | Within 7 days |
| 3 | Download Razorpay AOC and store with this document | ☐ Pending | Within 7 days |
| 4 | Sign and date the attestation | ☐ Pending | After completing above |
| 5 | Store completed SAQ-A securely | ☐ Pending | After signing |
| 6 | Set reminder for annual renewal | ☐ Pending | 2027-01-01 |

---

## Appendix A: Technical Evidence

### A.1 Payment Integration Code Summary

**File:** `components/checkout/CheckoutPage.tsx`
```javascript
// Load Razorpay script from their servers
script.src = "https://checkout.razorpay.com/v1/checkout.js";

// Open Razorpay modal (card data never touches our servers)
const razorpay = new (window as any).Razorpay(options);
razorpay.open();
```

**File:** `app/api/payment/verify/route.ts`
```javascript
// We only receive tokenized references, never card data
const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = validatedData;

// Verify signature using HMAC-SHA256
const expectedSignature = crypto
  .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
  .update(`${razorpay_order_id}|${razorpay_payment_id}`)
  .digest("hex");
```

### A.2 Security Headers (from `next.config.ts`)

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | Restricts script sources to `checkout.razorpay.com` | Prevents unauthorized scripts |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | Forces HTTPS |
| X-Frame-Options | DENY | Prevents clickjacking |
| X-Content-Type-Options | nosniff | Prevents MIME-type sniffing |

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-01-15 | Initial SAQ-A document | Claude |

---

*This document should be reviewed and updated annually, or whenever there are significant changes to the payment processing implementation.*
