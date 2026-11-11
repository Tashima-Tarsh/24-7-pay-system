# Checkout Flow State Machine

## Overview

The hosted checkout page (`public/checkout.html` + `public/assets/247-checkout.js`) runs a client-side state machine that drives the payment lifecycle. It loads initial state from `/api/v1/checkout/<paymentId>/state`, subscribes to live updates via SSE (`/api/v1/checkout/<paymentId>/events`), polls every 3 seconds as a fallback, and preserves session state across UPI app handoff.

## States

| State | Description | Terminal? |
| :--- | :--- | :--- |
| `INITIAL` | Page is loading; fetching initial state from the backend | No |
| `ACTIVE` | Payment is payable; QR and/or intent buttons are displayed | No |
| `INTENT_ISSUED` | A UPI intent was launched; awaiting confirmation via SSE/poll | No |
| `COMPLETED` | Payment confirmed as SUCCESS | Yes |
| `FAILED` | Payment failed or expired | Yes |

## Transitions

```
┌─────────┐
│ INITIAL │── fetch /state ──┐
└────┬────┘                │
     │ (payable)           │
     ▼                     │
┌─────────┐                │
│ ACTIVE  │── intent click ─┼─┐
│         │                 │ │
│         │── SSE event     │ │
│         │ status_change   │ │
└────┬────┘                │ │
     │ (SUCCESS)           │ │
     ▼                     │ │
┌─────────┐                │ │
│ COMPLET │◄──────────────┘ │ │
│  ED     │                │ │
└────┬────┘                │ │
     │ (FAILURE/EXPIRY)    │ │
     ▼                     │ │
┌─────────┐                │ │
│ FAILED  │◄──────────────┘ │ │
└────┬────┘                │ │
     │ (refresh/app return)│ │
     └─────────────────────┘ │
     │ (poll 3s fallback)     │
     └────────────────────────┘
```

## Mode Selection: Merchant vs Personal

The checkout UI branches on account type, never inferred from the VPA bank suffix:

```js
const personalUpi = data.upiMode === 'NON_MERCHANT' || data.isMerchantEnabled === false;
const merchantUpi = !personalUpi;
```

| Aspect | MERCHANT account | PERSONAL account |
| :--- | :--- | :--- |
| **Android mobile** | Branded intent buttons (GPay, PhonePe, Paytm, BHIM) via `intent://pay?` | Tappable QR (generic `upi://pay?` link opening the app chooser) |
| **Desktop** | QR code rendered; no intent buttons (desktop cannot open phone UPI apps) | QR code rendered; tappable on mobile only |
| **QR panel** | Hidden on mobile (intents take priority) | Shown (QR doubles as tappable native link) |
| **Intent parameters** | P2P-safe set only when not PSP-signed: `pa`, `pn`, `am`, `cu`, `tr`, `tn` | Same P2P-safe set; `mc`/`tid`/`url`/`mode` never emitted for personal VPAs |

## Session State Preservation During UPI App Handoff

When the user clicks a UPI intent button or taps the QR (personal mode on mobile):

1. `setHandoff(true)` is called — persists `appHandoff` in `sessionStorage`
2. `showReturnControls()` displays "check after UPI" and return-to-checkout UI
3. The page URL stays **static** (`/checkout/<paymentId>`) — it never changes during handoff
4. On return (visibility change / focus / pageshow), `refreshAfterAppReturn()` runs:
   - Calls `refresh()` to fetch authoritative state from `/api/v1/checkout/<paymentId>/state`
   - Calls `connect()` to re-establish the SSE EventSource
   - Shows an "app handoff note" reminding the user that returning is not proof of payment

This survives app crashes, Android Back navigation, and browser tab switching.

## Auto-Polling

- SSE is the primary live-update channel (`/api/v1/checkout/<paymentId>/events`)
- A 3-second polling interval runs as a fallback (`setInterval(refresh, 3000)`)
- After 5 minutes without confirmation, a warning banner appears but polling continues — late confirmations are still detected
- Polling stops only when `terminal` (COMPLETED or FAILED)

## Edge Cases

| Edge Case | Handling |
| :--- | :--- |
| **Payment timeout** | Timer counts down `timeRemainingSeconds`; at 0, calls `refresh()` to check authoritative status; shows warning banner |
| **App crash / kill** | `sessionStorage` preserves `appHandoff`; `refreshAfterAppReturn()` fires on page refocus |
| **Network failure** | `refresh()` catches fetch errors; shows "Connection needs attention" with retry button; SSE `onerror` triggers exponential backoff reconnect (1s → 2s → 4s … capped at 30s) |
| **SSE dropped** | `connect()` closes old EventSource, clears retry timer, reconnects with exponential backoff |
| **404 / missing payment** | Shows "This payment link could not be found" — user must contact the merchant |
| **Stale deep link** | Backend intent links are validated against the canonical P2P query; mismatches fall back to a freshly built intent |
| **5 minutes elapsed** | Warning banner: "No confirmed payment result after 5 minutes. Your original order is still open." Polling continues |

## Code Locations

| File | Responsibility |
| :--- | :--- |
| `public/assets/247-checkout.js:100-160` | Mode detection (personal vs merchant) + QR rendering |
| `public/assets/247-checkout.js:131-207` | Intent link building (P2P-safe parameters) |
| `public/assets/247-checkout.js:220-291` | Poll loop (3s), SSE connect, 5-minute timeout |
| `public/assets/247-checkout.js:259-270` | App handoff state preservation (`refreshAfterAppReturn`) |
| `public/assets/247-checkout.js:234-245` | SSE connection with exponential backoff reconnect |
