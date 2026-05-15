# 05 — Payments (T-Bank Internet Acquiring)

## Purpose

This file defines the complete payment integration using T-Bank Internet Acquiring via iframe-based payment form. Payments handle male user subscriptions (30-day recurring access). No Stripe — T-Bank exclusively.

> **MANDATORY OBSERVABILITY (payments):** Payments are business-critical. Silent payment failures = revenue loss + support escalations. Per [14-sentry-observability.md](14-sentry-observability.md), every T-Bank API call and webhook handler MUST report to Sentry on failure, **regardless of HTTP status**:
> * `flow=payments.init` — `Init` API call failure. Severity: error. Alert: > 5 in 5 min → page on-call.
> * `flow=payments.webhook` with `reason=signature` — invalid HMAC. Severity: error. Possible fraud signal.
> * `flow=payments.webhook` with `reason=conflict` — idempotency conflict. Severity: warning.
> * `flow=payments.rebill`, `attempt=<n>` — recurring rebill failure. Severity: error.
>
> Tag events with `provider_payment_id` (the T-Bank `PaymentId`). **Never** include PAN, CVV, cardholder name, email, or full card data — these are not in our possession by design, and request bodies MUST still be defensively scrubbed before any capture. Sample rate for `flow=payments.*` traces is forced to **1.0** even in production (see `tracesSampler` in 14-sentry-observability.md).

---

## Requirement: T-Bank Integration Script

### Scenario: Payment script is loaded

**Given** the subscription page `/subscription`
**When** the page renders
**Then** the T-Bank integration script MUST be loaded before `</body>`:

```html
<script
  src="https://integrationjs.t-static.ru/integration.js"
  onload="onPaymentIntegrationLoad()"
  async
></script>
```

> **Decision:** The script MUST be loaded from the CDN URL. It MUST NOT be bundled or copied into the project. This ensures automatic updates and security patches.

### Scenario: Integration is initialized

**Given** the script has loaded
**When** `onPaymentIntegrationLoad()` fires
**Then** `PaymentIntegration.init()` is called with configuration:

```javascript
function onPaymentIntegrationLoad() {
  PaymentIntegration.init({
    terminalKey: window.__TBANK_CONFIG__.terminalKey,
    product: 'eacq',
    features: {
      iframe: {},        // Payment form in iframe
      addcardIframe: {}  // Card binding for recurrent payments
    }
  }).then(() => {
    console.log('T-Bank integration ready')
  }).catch(console.error)
}
```

### CSP Configuration

The `frame-src` directive MUST include `*.tbank.ru`:

```
frame-src *.tbank.ru;
```

---

## Requirement: Initiate Payment (Backend)

### Scenario: Backend initiates a payment

**Given** an authenticated male user on `/subscription`
**When** they click "Subscribe" (or "Renew")
**Then** a Server Action calls the T-Bank Init API from the backend:

```typescript
// lib/tbank/client.ts
const TBANK_API = 'https://securepay.tinkoff.ru/v2/Init'

interface InitPaymentParams {
  orderId: string
  customerKey: string   // user ID for recurrent payments
  description: string
  notificationURL: string
  successURL: string
  failURL: string
}

const SUBSCRIPTION_PRICE_KOPECKS = 100000 // 1000 RUB

async function initiatePayment(params: InitPaymentParams) {
  const body = {
    TerminalKey: process.env.TBANK_TERMINAL_KEY!,
    Amount: 100000,                    // 1000 RUB in kopecks
    OrderId: params.orderId,
    CustomerKey: params.customerKey,   // enables recurrent payments
    Recurrent: 'Y',                    // parent payment flag for card-on-file
    Description: params.description,
    NotificationURL: params.notificationURL,
    SuccessURL: params.successURL,
    FailURL: params.failURL,
    PayType: 'O',                      // one-stage payment
    Language: 'ru',
  }

  body.Token = generateToken(body) // request signature

  const response = await fetch(TBANK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.TBANK_API_TOKEN}`,
    },
    body: JSON.stringify(body),
  })

  return response.json()
  // Returns: { Success, ErrorCode, ErrorMessage, PaymentId, PaymentURL }
}
```

> **Decision:** The payment amount MUST come from the backend, never from the frontend. The frontend NEVER sends the amount — it is determined server-side to prevent tampering.

### Token Generation (Request Signature)

```typescript
function generateToken(params: Record<string, any>): string {
  const sorted = Object.keys(params)
    .filter(k => k !== 'Token')
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key]
      return acc
    }, {} as Record<string, any>)

  const concatenated = Object.values(sorted).join('')
  return crypto.createHash('sha256')
    .update(concatenated + process.env.TBANK_API_TOKEN)
    .digest('hex')
}
```

### Scenario: Payment initiation succeeds

**Given** the T-Bank Init API returns `Success: true`
**When** the response is received
**Then** the backend returns `{ paymentId, paymentURL }` to the frontend
**And** the frontend opens the iframe payment form using the returned `PaymentURL`

### Scenario: Payment initiation fails

**Given** the T-Bank Init API returns `Success: false`
**When** the response is received
**Then** the backend logs the error (ErrorCode, ErrorMessage)
**And** the frontend displays a user-friendly error toast

---

## Requirement: Iframe Payment Form

### Scenario: Payment form opens in iframe

**Given** a successful payment initiation with `PaymentURL`
**When** the frontend receives it
**Then** it opens the iframe payment form:

```typescript
// features/subscription/components/PaymentIframe.tsx
'use client'

import { useEffect, useRef } from 'react'

export function PaymentIframe({ paymentUrl }: { paymentUrl: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!paymentUrl) return

    const initIframe = async () => {
      const integration = await (window as any).PaymentIntegration
      const iframeIntegration = await integration.iframe.get('main-integration')
      await iframeIntegration.connect(iframeRef.current!)
    }

    initIframe()
  }, [paymentUrl])

  return (
    <iframe
      ref={iframeRef}
      src={paymentUrl}
      id="payment-form-iframe"
      className="w-full h-[600px] border-0"
      title="Payment Form"
    />
  )
}
```

> **Decision:** The `config` approach for connecting the iframe integration relies on the global configuration object passed to `PaymentIntegration.init()`. The integration name for iframe is `"main-integration"`.

---

## Requirement: Payment Webhook

### Scenario: T-Bank sends payment status update

**Given** a payment status change (success, failure, refund)
**When** T-Bank POSTs to `TBANK_NOTIFICATION_URL`
**Then** the Route Handler `/api/webhooks/tbank` processes it:

```typescript
// app/api/webhooks/tbank/route.ts
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()

  // Verify the notification (check TerminalKey, validate signature)
  if (!verifyTbankSignature(body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const { OrderId, Status, PaymentId, Amount, CardId, RebillId } = body

  switch (Status) {
    case 'CONFIRMED':
      // Payment successful — activate subscription
      await activateSubscription(OrderId, PaymentId, RebillId)
      break
    case 'REJECTED':
      // Payment failed — notify user
      await handlePaymentFailure(OrderId)
      break
    case 'REFUNDED':
      // Payment refunded
      await handleRefund(OrderId)
      break
  }

  return NextResponse.json({ code: 0 })
}
```

### Subscription Activation

```typescript
async function activateSubscription(orderId: string, paymentId: string, rebillId?: string) {
  const subscription = await getSubscriptionByOrderId(orderId)

  await supabaseAdmin
    .from('subscriptions')
    .upsert({
      user_id: subscription.userId,
      tbank_payment_id: paymentId.toString(),
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
    })
}
```

---

## Requirement: Recurring Payments

### Scenario: Subscription renews automatically

**Given** a user with an active subscription and saved card (RebillId from initial payment)
**When** 30 days have passed since `current_period_start`
**Then** a Vercel Cron Job (daily) checks for subscriptions nearing expiration
**And** calls T-Bank Init API with `CustomerKey` and no `Recurrent` flag (using the saved card)
**And** if payment succeeds: extends `current_period_end` by 30 days
**And** if payment fails: sets `status = 'expired'`, user returns to free tier

### Scenario: User cancels subscription

**Given** a user with an active subscription
**When** they click "Cancel subscription" in settings
**Then** `subscriptions.cancel_at_period_end = true`
**And** no further automatic renewal is attempted
**And** the user retains premium access until `current_period_end`
**And** after expiration, the user returns to free tier

### Recurrent Payment Initiation

```typescript
async function initiateRecurrentPayment(customerKey: string, orderId: string) {
  const body = {
    TerminalKey: process.env.TBANK_TERMINAL_KEY!,
    Amount: SUBSCRIPTION_PRICE_KOPECKS,
    OrderId: orderId,
    CustomerKey: customerKey,
    // Recurrent: 'Y' — NOT set for subsequent payments; uses saved card
    Description: 'Monthly subscription renewal — NikahHelp',
    NotificationURL: process.env.TBANK_NOTIFICATION_URL!,
    PayType: 'O',
    Language: 'ru',
  }

  body.Token = generateToken(body)

  const response = await fetch(TBANK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.TBANK_API_TOKEN}`,
    },
    body: JSON.stringify(body),
  })

  return response.json()
}
```

---

## Requirement: Subscription UI

### Scenario: Male user visits subscription page

**Given** a male user on the free tier
**When** they visit `/subscription`
**Then** the page displays:
- Current tier: Free (3 likes total — chats open automatically on mutual match)
- Premium benefits: Unlimited likes (and therefore unlimited matches/chats)
- Price: read from `pricing_plans` row `subscription_monthly` (currently 1000 RUB / 30 days)
- "Subscribe" button → initiates T-Bank payment flow
- "Cancel subscription" button (if active)

### Scenario: Female user visits subscription page

**Given** a female user on `/subscription`
**When** the page loads
**Then** it displays: "All features are free for women."

---

## Requirement: Payment Security

- Payment amount MUST be determined server-side, NEVER from frontend
- Webhook signature MUST be verified on every notification
- All payment API calls MUST originate from the backend (Route Handler or Inngest)
- The T-Bank API token MUST NEVER be exposed to the client
- Order IDs MUST be unique and non-sequential (UUID v4)
- Idempotency: each `OrderId` is used exactly once

---

## Cross-References

- [00 — Overview & Architecture Principles](./00-overview.md)
- [02 — Database Schema & RLS](./02-database.md)
- [03 — Profiles, Feed & Matching](./03-profiles-feed.md)
- [07 — Infrastructure, Testing & i18n](./07-infrastructure.md)
