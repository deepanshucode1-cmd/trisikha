# Trisikha Organics E-Commerce Platform

## Overview

**Trisikha** is a full-stack e-commerce platform specializing in organic agricultural products, particularly organic manure and farming solutions. Built with Next.js 15 and React 19, it provides a complete order-to-delivery pipeline with integrated payment processing, shipping logistics, and sophisticated order management.

**Domain**: Sustainable Agriculture / Organic Manure E-Commerce
**Current Branch**: `selling` (active development)
**Tech Stack**: Next.js 15.5.3, TypeScript 5, React 19, Supabase, Razorpay, Shiprocket

---

## Project Structure

```
/app                          # Next.js App Router pages and API routes
├── /api                      # Backend API endpoints
│   ├── /auth                 # Authentication (signup, callback)
│   ├── /checkout             # Order creation & checkout flow
│   ├── /orders               # Order management (cancellation, OTP, retrieval)
│   ├── /payment              # Payment verification
│   ├── /products             # Product listing
│   ├── /seller               # Seller/Admin features (products, Shiprocket)
│   ├── /webhooks             # External webhooks (Razorpay, Shiprocket)
│   └── /track                # Order tracking
├── /products                 # Product catalog pages
├── /cart                     # Shopping cart
├── /checkout                 # Checkout process
├── /payment                  # Payment result pages (success/failed)
├── /login & /register        # Authentication
├── /admin                    # Admin dashboard
├── /seller                   # Seller interface
├── /track                    # Order tracking
├── /cancel-order             # Order cancellation
├── /buy-now                  # Quick purchase
└── /about & /contact         # Information pages

/components                   # Reusable React components
├── /ui                       # UI primitives (Badge, Card)
├── /cart                     # Cart components
├── /checkout                 # Checkout components
└── Layout & feature components (Header, Footer, Products, etc.)

/utils                        # Utilities & helpers
├── /supabase                 # Supabase client (client & server)
├── /store                    # Zustand cart state management
├── retry.ts                  # Retry logic
└── shiprocket.ts             # Shiprocket API wrapper

/supabase                     # Database configuration
├── /migrations               # SQL migrations (21 files)
├── config.toml               # Local dev config
└── seed.sql                  # Database seeding
```

---

## Technology Stack

### Frontend
- **Framework**: Next.js 15.5.3 (React 19.1.0)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4, DaisyUI 5.3.2
- **Icons**: Lucide React
- **State Management**: Zustand 5.0.8 (with localStorage persistence)
- **Image Handling**: browser-image-compression 2.0.2

### Backend
- **Framework**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth

### External Services
- **Payments**: Razorpay
- **Shipping**: Shiprocket
- **Email**: Nodemailer 7.0.12 (Gmail SMTP)

### Development
- **Package Manager**: npm
- **Linting**: ESLint 9
- **Build Tool**: Next.js (SWC)

---

## Security Architecture & Analysis

### Current Security Measures

#### 1. Payment Security
- **HMAC-SHA256 Signature Verification**: All Razorpay webhooks verified using cryptographic signatures
- **Timing-Safe Comparison**: Protection against timing attacks in signature validation
- **Double Verification**: Payment status confirmed with Razorpay API after webhook
- **Idempotency**: Prevents double-processing of payments through conditional DB updates
- **Server-Side Verification**: All payment verification happens server-side, never client-side

#### 2. Authentication & Authorization
- **Supabase Auth**: OAuth-based authentication with secure session management
- **Role-Based Access Control (RBAC)**: Admin/customer roles enforced at database level
- **Server-Side Auth Checks**: Protected routes use Supabase service role key
- **Session Validation**: Auth state verified on protected API routes

#### 3. Order Cancellation Security
- **OTP Verification**: Time-limited (10-minute) one-time passwords for cancellation
- **Email-Based Verification**: OTP sent to order email address
- **Replay Attack Prevention**: OTP expiry prevents reuse
- **Cancellation Windows**: Business logic prevents cancellation after shipping

#### 4. Data Protection
- **Environment Variables**: Sensitive credentials stored in `.env` (not committed)
- **Service Role Keys**: Server-side only, never exposed to client
- **Database-Level Security**: Supabase RLS (Row Level Security) policies
- **Foreign Key Constraints**: Data integrity enforced at database level

#### 5. API Security
- **Server-Side Validation**: All business logic executed server-side
- **Stock Validation**: Prevents overselling through atomic stock decrements
- **Webhook Secret Verification**: All external webhooks validated with secrets

---

### Security Vulnerabilities & Recommendations

#### CRITICAL PRIORITY

##### 1. Missing Rate Limiting
**Risk**: API endpoints vulnerable to brute force, DDoS, and resource exhaustion attacks
**Impact**: High - Could lead to service disruption, OTP brute forcing, payment abuse

**Affected Endpoints**:
- `/api/orders/send-cancel-otp` - OTP generation endpoint (brute force risk)
- `/api/orders/cancel` - Cancellation endpoint (abuse risk)
- `/api/checkout` - Order creation (inventory manipulation)
- `/api/payment/verify` - Payment verification (timing attacks)
- All authentication endpoints

**Recommendations**:
```typescript
// Implement rate limiting with IP-based throttling
// Use libraries like: next-rate-limit, upstash/ratelimit, or express-rate-limit

// Example for OTP endpoint:
// - 3 requests per 10 minutes per IP
// - 5 requests per hour per email address

// Example for checkout:
// - 10 requests per minute per IP
// - 20 requests per hour per user session
```

##### 2. Input Validation & Sanitization
**Risk**: Potential SQL injection, XSS, command injection
**Impact**: High - Could lead to data breach, code execution

**Current Gaps**:
- User-provided addresses not fully sanitized
- Email addresses not validated against RFC 5322
- Phone numbers not validated
- Product SKU/HSN codes not validated against expected formats
- No length limits enforced on text fields

**Recommendations**:
```typescript
// Use validation libraries: zod, joi, or yup

// Example schema for checkout:
const checkoutSchema = z.object({
  email: z.string().email().max(255),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).max(20),
  address: z.object({
    line1: z.string().min(5).max(200).regex(/^[a-zA-Z0-9\s,.-]+$/),
    pincode: z.string().regex(/^[0-9]{6}$/),
    // ... validate all fields
  }),
});

// Sanitize HTML content if displaying user input:
import DOMPurify from 'isomorphic-dompurify';
const clean = DOMPurify.sanitize(userInput);
```

##### 3. Missing CSRF Protection
**Risk**: Cross-Site Request Forgery attacks on state-changing endpoints
**Impact**: Medium-High - Unauthorized actions (order creation, cancellation)

**Affected Endpoints**: All POST/PUT/DELETE endpoints

**Recommendations**:
```typescript
// Implement CSRF tokens for all state-changing operations
// Use libraries like: csrf or next-csrf

// Add SameSite cookie attributes:
// Set-Cookie: session=...; SameSite=Strict; Secure; HttpOnly

// For API routes, use custom headers:
// X-Requested-With: XMLHttpRequest
```

##### 4. Insufficient Authorization Checks
**Risk**: Horizontal privilege escalation
**Impact**: High - Users accessing other users' data

**Current Gaps**:
- `/api/orders/get-order/[order_id]` - No ownership verification
- `/api/track?order_id=<id>` - Order tracking accessible with just ID (UUID guessing)
- Order cancellation might not verify order ownership
- Admin endpoints may lack consistent role checks

**Recommendations**:
```typescript
// Always verify ownership before returning data:
const { data: order } = await supabase
  .from('orders')
  .select('*')
  .eq('id', orderId)
  .or(`user_id.eq.${userId},guest_email.eq.${email}`)
  .single();

if (!order) {
  return res.status(404).json({ error: 'Order not found' });
}

// For admin endpoints, verify role:
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', userId)
  .single();

if (profile?.role !== 'admin') {
  return res.status(403).json({ error: 'Forbidden' });
}
```

##### 5. Sensitive Data Exposure
**Risk**: Information leakage through error messages and logs
**Impact**: Medium - Assists attackers in reconnaissance

**Current Gaps**:
- Detailed error messages may leak system information
- Database errors might expose schema details
- API responses may include unnecessary data

**Recommendations**:
```typescript
// Generic error responses for production:
if (process.env.NODE_ENV === 'production') {
  return res.status(500).json({ error: 'Internal server error' });
} else {
  return res.status(500).json({ error: detailedError });
}

// Log full errors server-side but send generic messages to client
console.error('[Order Cancellation Error]', {
  orderId,
  userId,
  error: error.message,
  stack: error.stack,
  timestamp: new Date().toISOString(),
});

// Remove sensitive fields from API responses:
const { password, otp_code, ...safeOrder } = order;
return res.json(safeOrder);
```

#### HIGH PRIORITY

##### 6. Email Security
**Risk**: Email spoofing, credential compromise
**Impact**: Medium - Brand damage, phishing attacks

**Current Gaps**:
- Using Gmail SMTP with app password (single point of failure)
- No SPF, DKIM, DMARC verification mentioned
- Email templates may be vulnerable to HTML injection

**Recommendations**:
```typescript
// Use dedicated email service: SendGrid, AWS SES, Postmark
// Implement email verification for new accounts
// Add SPF, DKIM, DMARC records to DNS
// Sanitize all user data in email templates:

const emailTemplate = `
  <p>Order ID: ${DOMPurify.sanitize(orderId)}</p>
  <p>Customer: ${DOMPurify.sanitize(customerName)}</p>
`;

// Rate limit email sending per user:
// - Max 5 OTP emails per hour per email address
```

##### 7. No Content Security Policy (CSP)
**Risk**: XSS attacks, clickjacking, data injection
**Impact**: Medium - Client-side attacks

**Recommendations**:
```typescript
// Add CSP headers in next.config.ts:
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' checkout.razorpay.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "connect-src 'self' https://*.supabase.co https://api.razorpay.com",
              "frame-src checkout.razorpay.com",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};
```

##### 8. Insufficient Logging & Monitoring
**Risk**: Undetected security incidents, difficult forensics
**Impact**: Medium - Delayed incident response

**Recommendations**:
```typescript
// Implement comprehensive security logging:

// Log all authentication events:
logger.info('User login', { userId, ip, userAgent, timestamp });
logger.warn('Failed login attempt', { email, ip, timestamp });

// Log all payment events:
logger.info('Payment initiated', { orderId, amount, userId, ip });
logger.warn('Payment verification failed', { orderId, reason, ip });

// Log admin actions:
logger.info('Product created', { productId, adminId, timestamp });
logger.info('Order cancelled', { orderId, adminId, reason });

// Log suspicious activities:
logger.warn('Multiple OTP requests', { email, count, timeWindow, ip });
logger.warn('Order access attempt', { orderId, userId, reason: 'unauthorized' });

// Use structured logging: winston, pino, or Next.js logger
// Send logs to monitoring service: Sentry, Datadog, LogRocket
```

##### 9. OTP Security Weaknesses
**Risk**: OTP brute force, timing attacks
**Impact**: Medium - Unauthorized order cancellations

**Current Gaps**:
- No rate limiting on OTP generation
- No account lockout after failed attempts
- OTP may be predictable if using weak random number generation
- No monitoring for OTP abuse patterns

**Recommendations**:
```typescript
// Generate cryptographically secure OTPs:
import crypto from 'crypto';
const otp = crypto.randomInt(100000, 999999).toString();

// Implement attempt limits:
// - Max 3 OTP verification attempts per OTP
// - Lock account for 1 hour after 3 failed attempts
// - Max 5 OTP requests per email per day

// Add OTP attempt tracking:
const { data: order } = await supabase
  .from('orders')
  .select('otp_attempts')
  .eq('id', orderId)
  .single();

if (order.otp_attempts >= 3) {
  return res.status(429).json({
    error: 'Too many attempts. Please request a new OTP.'
  });
}

// Consider adding CAPTCHA for OTP requests
```

##### 10. Dependency Vulnerabilities
**Risk**: Exploitation through vulnerable packages
**Impact**: Varies - Could be critical

**Recommendations**:
```bash
# Run security audits regularly:
npm audit
npm audit fix

# Use automated tools:
npm install -g snyk
snyk test
snyk monitor

# Keep dependencies updated:
npm outdated
npm update

# Use dependabot or renovate for automated updates

# Review security advisories for:
# - razorpay (payment library)
# - nodemailer (email)
# - next.js (framework)
# - react (UI library)
```

#### MEDIUM PRIORITY

##### 11. Session Management
**Risk**: Session hijacking, fixation attacks
**Impact**: Medium

**Recommendations**:
```typescript
// Implement session security best practices:
// - Rotate session tokens after login
// - Set secure session timeouts (15-30 minutes)
// - Invalidate sessions on logout
// - Use httpOnly, secure, sameSite cookies
// - Implement device fingerprinting for high-value actions

// Session cookies configuration:
{
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 60 * 1000, // 30 minutes
}
```

##### 12. File Upload Security
**Risk**: Malicious file uploads (if product images uploaded by sellers)
**Impact**: Medium - Could lead to XSS, RCE

**Recommendations**:
```typescript
// Validate file types:
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
if (!allowedTypes.includes(file.type)) {
  throw new Error('Invalid file type');
}

// Validate file size:
const maxSize = 5 * 1024 * 1024; // 5MB
if (file.size > maxSize) {
  throw new Error('File too large');
}

// Scan files for malware (use third-party service)
// Store files with random names, not user-provided names
// Serve images from different domain (prevents XSS)
// Use Supabase Storage policies to restrict access
```

##### 13. API Endpoint Enumeration
**Risk**: Information disclosure through predictable endpoints
**Impact**: Low-Medium

**Recommendations**:
```typescript
// Return consistent error codes:
// - 404 for both "not found" and "unauthorized" (prevents enumeration)
// - Avoid revealing whether resource exists

// Bad:
if (!order) return 404;
if (!canAccess) return 403; // Reveals order exists

// Good:
if (!order || !canAccess) return 404;
```

##### 14. Missing Security Headers
**Risk**: Various client-side attacks
**Impact**: Medium

**Recommendations**:
```typescript
// Add all security headers:
// - Strict-Transport-Security (HSTS)
// - X-Frame-Options
// - X-Content-Type-Options
// - X-XSS-Protection (legacy browsers)
// - Referrer-Policy
// - Permissions-Policy

// See CSP section above for implementation
```

##### 15. Guest Checkout Security
**Risk**: Abuse through anonymous orders
**Impact**: Medium - Inventory manipulation, fraud

**Recommendations**:
```typescript
// Add anti-abuse measures for guest checkout:
// - Require CAPTCHA for guest orders
// - Rate limit guest orders per IP (2-3 per hour)
// - Require email verification before payment
// - Monitor for patterns (same IP, different emails)
// - Flag suspicious orders for manual review

// Email verification for guest orders:
// 1. Generate verification token
// 2. Send email with verification link
// 3. Allow payment only after verification
// 4. Token expires after 15 minutes
```

---

### Security Best Practices Implementation

#### 1. Environment Variables Management
```bash
# Current setup (good):
# - .env file not committed to git
# - Different keys for different environments

# Improvements needed:
# - Use .env.local for local overrides
# - Use proper secrets management: Vercel Env, AWS Secrets Manager, Vault
# - Rotate secrets regularly (quarterly)
# - Document required env vars in .env.example

# .env.example (create this):
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=your-secret
# ... etc
```

#### 2. Database Security

**Supabase Row Level Security (RLS) Policies**:
```sql
-- Ensure RLS is enabled on all tables:
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Products: Anyone can read, only admin can modify
CREATE POLICY "Anyone can view products"
  ON products FOR SELECT
  USING (true);

CREATE POLICY "Only admins can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Orders: Users can only see their own orders
CREATE POLICY "Users can view their own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Guest orders: Accessible via order_id + email combo only
-- (Implement this logic in API, not RLS)

-- Order items: Accessible if parent order is accessible
CREATE POLICY "Users can view their order items"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (
        orders.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      )
    )
  );
```

**Database Backup & Recovery**:
```bash
# Automated backups (Supabase provides this)
# Test restore procedures monthly
# Keep backups for 30 days minimum
# Encrypt backups at rest
```

#### 3. Payment Security Checklist

- [x] Server-side payment verification
- [x] Signature validation (HMAC-SHA256)
- [x] Idempotency (prevent double-processing)
- [x] Webhook secret verification
- [ ] PCI DSS compliance review
- [ ] Payment amount validation (client vs server)
- [ ] Currency validation
- [ ] Suspicious payment pattern detection
- [ ] Failed payment attempt monitoring
- [ ] Refund abuse monitoring

**Additional Measures**:
```typescript
// Validate payment amount matches order:
const { data: order } = await supabase
  .from('orders')
  .select('total_amount, currency')
  .eq('id', orderId)
  .single();

if (order.total_amount !== paymentAmount) {
  throw new Error('Payment amount mismatch');
}

// Monitor for suspicious patterns:
// - Multiple failed payments from same IP
// - Payment amounts just below fraud threshold
// - Unusual order volumes from single user
```

#### 4. Incident Response Plan

**Preparation**:
1. Document security contacts
2. Create incident response runbook
3. Set up security monitoring alerts
4. Establish communication channels

**Detection**:
```typescript
// Set up alerts for:
// - Failed authentication attempts (>10 per hour)
// - Payment verification failures (>5 per day)
// - Database errors (>50 per hour)
// - Unusual order cancellation rates
// - Spike in API requests
// - Webhook signature failures

// Use monitoring tools: Sentry, Datadog, CloudWatch
```

**Response Workflow**:
1. Identify and contain incident
2. Preserve evidence (logs, database snapshots)
3. Assess impact (affected users, data)
4. Notify stakeholders (internal team, customers if needed)
5. Remediate vulnerability
6. Post-incident review

**Recovery**:
1. Restore from backups if needed
2. Reset compromised credentials
3. Invalidate affected sessions
4. Deploy security patches

#### 5. Secure Development Workflow

**Pre-commit**:
```bash
# Add pre-commit hooks:
npm install -D husky lint-staged

# .husky/pre-commit:
#!/bin/sh
npm run lint
npm audit
# Run security checks
```

**Code Review Checklist**:
- [ ] Input validation on all user inputs
- [ ] Authorization checks on protected routes
- [ ] No sensitive data in logs
- [ ] Error messages are generic
- [ ] SQL queries use parameterized statements
- [ ] No hardcoded secrets
- [ ] Rate limiting on new endpoints
- [ ] HTTPS enforced

**Testing**:
```typescript
// Add security tests:
// - Test unauthorized access attempts
// - Test SQL injection vectors
// - Test XSS payloads
// - Test CSRF attacks
// - Test rate limiting

describe('Order Security', () => {
  it('should not allow accessing other users orders', async () => {
    const response = await request(app)
      .get('/api/orders/get-order/other-user-order-id')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(404); // Not 403, to prevent enumeration
  });

  it('should prevent OTP brute force', async () => {
    // Attempt multiple wrong OTPs
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/orders/cancel')
        .send({ orderId, otp: 'wrong' });
    }

    const response = await request(app)
      .post('/api/orders/cancel')
      .send({ orderId, otp: 'correct' });

    expect(response.status).toBe(429); // Too many requests
  });
});
```

---

### Compliance & Standards

#### PCI DSS Compliance
**Status**: Partially compliant (using Razorpay as payment processor)

**Requirements**:
- Never store card data (Razorpay handles this) ✓
- Use HTTPS for all payment pages ✓
- Implement access controls ✓
- Maintain audit logs - Needs improvement
- Regularly test security - Needs implementation
- Maintain security policy - Needs documentation

#### GDPR/Data Privacy
**Current Implementation**:
- Guest email addresses collected
- No privacy policy linked
- No cookie consent mechanism
- No data export functionality
- No data deletion functionality

**Required Improvements**:
```typescript
// Add privacy controls:
// - Privacy policy page
// - Terms of service
// - Cookie consent banner
// - User data export API endpoint
// - User data deletion API endpoint (right to be forgotten)
// - Data retention policy

// Example data export:
app.get('/api/user/export-data', authenticate, async (req, res) => {
  const userId = req.user.id;

  const [profile, orders, ...] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId),
    supabase.from('orders').select('*, order_items(*)').eq('user_id', userId),
    // ... other user data
  ]);

  res.json({
    profile,
    orders,
    exportDate: new Date().toISOString(),
  });
});
```

#### OWASP Top 10 Compliance

| Risk | Status | Notes |
|------|--------|-------|
| A01: Broken Access Control | Partial | Needs ownership verification |
| A02: Cryptographic Failures | Good | Using HTTPS, secure algorithms |
| A03: Injection | Partial | Needs input validation |
| A04: Insecure Design | Partial | Needs rate limiting, abuse prevention |
| A05: Security Misconfiguration | Partial | Missing CSP, security headers |
| A06: Vulnerable Components | Unknown | Needs audit |
| A07: Auth Failures | Partial | Using Supabase Auth, needs session hardening |
| A08: Data Integrity Failures | Good | Signature verification in place |
| A09: Logging Failures | Weak | Needs comprehensive logging |
| A10: SSRF | Good | No user-controlled URLs |

---

## Core Features

### Customer Features

#### 1. Product Catalog
- Browse products with details (name, price, images)
- Filter and search functionality
- Product images from Supabase Storage
- SKU, HSN code, dimensions, and weight tracking

#### 2. Shopping Cart
- Add/remove products
- Update quantities
- Persistent cart (localStorage via Zustand)
- Cart summary with total calculation

#### 3. Checkout Flow
- Shipping & billing address collection
- Guest checkout (no login required)
- Stock validation before order creation
- Order items with product snapshots

#### 4. Payment Processing
- Razorpay integration (INR)
- Payment signature verification (HMAC-SHA256)
- Order status updates on successful payment
- Confirmation emails
- Duplicate payment prevention

#### 5. Order Tracking
- Track orders by AWB code
- Real-time updates from Shiprocket
- Shipping status and location
- Historical tracking activities

#### 6. Order Cancellation
- OTP-based verification (10-minute expiry)
- Refund processing via Razorpay
- Handles multiple order stages
- Shiprocket cancellation before refund
- Email notifications
- Retry mechanism for failed cancellations

### Admin/Seller Features

#### 1. Product Management
- Add/edit products
- Stock management
- Upload product images
- SKU, HSN, dimensions, weight configuration

#### 2. Order Management
- View all orders with status
- Orders dashboard
- Track cancellation requests

#### 3. Shipping Integration
- Schedule pickups via Shiprocket
- Generate AWB codes (with retries)
- Create shipping manifests (batch)
- Generate shipping labels
- Estimate shipping costs
- Exponential backoff retry logic

#### 4. Admin Dashboard
- Ready-to-ship orders view
- Order details and management
- Role-based access control

---

## Database Schema

### Tables

#### `profiles`
```sql
- id (uuid) → references auth.users
- role (text) → 'admin' | 'customer'
- created_at (timestamp)
```

#### `products`
```sql
- id (uuid, primary key)
- name, description (text)
- price (numeric)
- stock (integer)
- sku (text, unique)
- hsn (text)
- weight (numeric, kg)
- length, breadth, height (numeric, cm)
- created_at, updated_at (timestamp)
```

#### `orders`
```sql
- id (uuid, primary key)
- user_id (uuid, nullable) → supports guest checkout
- guest_email, guest_phone (text)
- total_amount, currency (numeric, text)
- payment_id, payment_status (text)
  → 'initiated' | 'paid' | 'failed' | 'refunded'
- razorpay_order_id, refund_id (text)
- refund_status → 'initiated' | 'processing' | 'completed' | 'failed'
- order_status → 'CHECKED_OUT' | 'CONFIRMED' | 'CANCELLATION_REQUESTED' | 'CANCELLED'
- cancellation_status → 'OTP_SENT' | 'CANCELLATION_REQUESTED' | 'CANCELLED'
- shiprocket_order_id, shiprocket_awb_code, shiprocket_status (text)
- shipping_status → 'pending' | 'booked' | 'shipped' | 'delivered' | 'cancelled'
- tracking_url (text)
- shipping_address (name, line1, line2, city, state, pincode, country)
- billing_address (same fields)
- otp_code, otp_expires_at (text, timestamp)
- reason_for_cancellation (text)
- refund_error_code, refund_error_reason, refund_error_description (text)
- created_at, updated_at (timestamp)
```

#### `order_items`
```sql
- id (uuid, primary key)
- order_id (uuid) → references orders (ON DELETE CASCADE)
- product_id (uuid) → references products (ON DELETE SET NULL)
- product_name, sku, hsn (text)
- unit_price, quantity (numeric, integer)
- total_price (generated: unit_price * quantity)
- weight, length, breadth, height (numeric)
- created_at, updated_at (timestamp)
```

---

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `GET /api/auth/callback` - OAuth callback

### Products
- `GET /api/products` - List all products
- `POST /api/seller/products` - Create product
- `GET /api/seller/products` - Get seller's products

### Orders & Checkout
- `POST /api/checkout` - Create order and initiate payment
- `GET /api/orders/get-order/[order_id]` - Fetch order details
- `GET /api/orders/get-order-detail/[id]` - Fetch full order with items
- `GET /api/orders/get-new-orders` - List new orders (admin)
- `GET /api/orders/get-cancellation-failed` - List cancellation failures

### Payment
- `POST /api/payment/verify` - Verify Razorpay payment signature
- `POST /api/webhooks/razorpay/verify` - Razorpay webhook handler
- `POST /api/webhooks/razorpay/refund` - Refund webhook handler

### Order Cancellation
- `POST /api/orders/send-cancel-otp` - Send cancellation OTP
- `POST /api/orders/cancel` - Process cancellation (with refund)
- `POST /api/orders/cancel/retry` - Retry failed cancellations

### Tracking
- `GET /api/track?order_id=<id>` - Get order tracking information

### Shipping (Shiprocket)
- `POST /api/seller/shiprocket/assign-awb` - Assign AWB code (with retries)
- `POST /api/seller/shiprocket/schedule-pickup` - Schedule pickup
- `POST /api/seller/shiprocket/generate-label` - Generate shipping label
- `POST /api/seller/shiprocket/generate-manifest-batch` - Generate manifest
- `POST /api/seller/shiprocket/estimate-shipping` - Estimate shipping cost
- `POST /api/webhooks/shiprocket` - Shiprocket webhook handler

---

## Environment Variables

Required configuration in `.env`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL          # Public Supabase endpoint
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Public API key (rate-limited, RLS enforced)
SUPABASE_SERVICE_ROLE_KEY         # Server-side key (bypass RLS - protect carefully!)

# Razorpay
RAZORPAY_KEY_ID                   # Public key (safe to expose)
RAZORPAY_KEY_SECRET               # Secret key (never expose!)
RAZORPAY_WEBHOOK_SECRET           # Webhook signature secret

# Shiprocket
SHIPROCKET_EMAIL                  # Account email
SHIPROCKET_PASSWORD               # Account password (consider token-based auth)
STORE_PINCODE                     # Default store location (382721)

# Email
EMAIL_USER                        # Gmail address
EMAIL_PASS                        # Gmail app password (not regular password!)

# Security (add these):
NEXTAUTH_SECRET                   # For session encryption
NEXTAUTH_URL                      # Application URL
NODE_ENV                          # production | development
ALLOWED_ORIGINS                   # CORS allowed origins
```

---

## Security Hardening Roadmap

### Phase 1: Critical (Week 1-2)
1. Implement rate limiting on all endpoints
2. Add input validation and sanitization
3. Fix authorization checks (ownership verification)
4. Add CSRF protection
5. Implement comprehensive logging

### Phase 2: High Priority (Week 3-4)
1. Add security headers (CSP, HSTS, etc.)
2. Implement OTP brute force protection
3. Migrate to dedicated email service
4. Run dependency audit and updates
5. Add suspicious activity monitoring

### Phase 3: Medium Priority (Month 2)
1. Implement session security improvements
2. Add file upload security (if applicable)
3. Implement data export/deletion (GDPR)
4. Add privacy policy and cookie consent
5. Set up automated security scanning

### Phase 4: Ongoing
1. Regular security audits (monthly)
2. Dependency updates (weekly)
3. Penetration testing (quarterly)
4. Incident response drills (quarterly)
5. Security training for team

---

## Getting Started

### Prerequisites
- Node.js (latest LTS)
- npm
- Supabase CLI (for local development)
- Razorpay account
- Shiprocket account
- Gmail account with app password

### Development Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables in `.env`
4. Start Supabase locally: `supabase start`
5. Run migrations: `supabase db reset`
6. Enable RLS policies (see Database Security section)
7. Start development server: `npm run dev`

### Security Checklist Before Deployment
- [ ] All environment variables configured
- [ ] HTTPS enabled (force redirect)
- [ ] Rate limiting implemented
- [ ] Security headers configured
- [ ] RLS policies enabled on all tables
- [ ] Input validation on all endpoints
- [ ] CSRF protection enabled
- [ ] Logging and monitoring set up
- [ ] Secrets rotated from defaults
- [ ] Dependencies audited
- [ ] Error messages sanitized
- [ ] Database backups configured
- [ ] Incident response plan documented

---

## Notable Architectural Decisions

1. **Guest Checkout**: No login required (increases conversion, needs extra abuse prevention)
2. **Zustand for Cart**: Lightweight state with localStorage persistence
3. **Product Snapshots**: Historical product data in `order_items` (prevents order history corruption)
4. **Multiple Status Fields**: Decoupled payment, shipping, order, cancellation states (complex but flexible)
5. **Webhook-First Payments**: Primary confirmation via Razorpay webhooks (more reliable than client-side)
6. **Exponential Backoff Retries**: For Shiprocket integration (handles rate limits)
7. **OTP-Based Cancellation**: Security measure for order cancellations (needs brute force protection)

---

## Project Status & Maturity

**Stage**: Active Development (MVP with core features)

**Security Maturity**: Medium
- Strong foundation with payment verification and auth
- Needs hardening in authorization, rate limiting, and monitoring
- Production-ready for core flows but requires security improvements before public launch

**Completed Features**:
- Product catalog with management
- Shopping cart with persistence
- Checkout flow with address collection
- Razorpay payment integration
- Order tracking via Shiprocket
- Order cancellation with refunds
- Admin dashboard
- Email notifications
- Retry mechanisms for reliability

**Security Improvements Needed** (before production):
1. Rate limiting (CRITICAL)
2. Input validation (CRITICAL)
3. Authorization fixes (CRITICAL)
4. CSRF protection (CRITICAL)
5. Security headers (HIGH)
6. Comprehensive logging (HIGH)
7. OTP brute force protection (HIGH)

---

*Last Updated: 2026-01-07*
*Security Review Status: Initial assessment complete - hardening required*
