# Sanbookpay — Android UPI Compatibility Test Matrix & Checklist (Phase 14)

**Repository:** https://github.com/Tashima-Tarsh/Sanbookpay
**Branch:** `feat/sanbookpay-upi-intent-universal-engine`
**APK:** `apps/android-bridge/app/build/outputs/apk/debug/app-debug.apk`
**Payment API:** `http://localhost:6100`

---

## Test Environment

- **SDK:** Android SDK at `D:\Android\Sdk` (cmdline-tools, platform-tools, build-tools 34.0.0, platform android-34)
- **Java:** JDK 17 at `C:\Program Files\Java\jdk-17`
- **Gradle:** 8.10.2 at `D:\Gradle`
- **APK Build:** `./gradlew assembleDebug` → `app-debug.apk` (7.5MB)
- **Install:** `adb install -r app-debug.apk`

---

## UPI App Compatibility Matrix (18 Target Apps)

| # | UPI App | Package Name (est.) | Generic upi://pay | App-Specific Adapter | Discovery | Launch | Amount Preservation | VPA Correctness | Return Data | Cancellation | Duplicate Prevention | Network Recovery | Backend Notification | Measured Latency | Status |
|---|---------|---------------------|-------------------|---------------------|-----------|--------|---------------------|-----------------|-------------|--------------|---------------------|------------------|---------------------|------------------|--------|
| 1 | Google Pay | com.google.android.apps.nbu.paisa.user | ✅ | No | | | | | | | | | | | PENDING |
| 2 | PhonePe | com.phonepe.app | ✅ | No | | | | | | | | | | | PENDING |
| 3 | BHIM | com.npci.upi.app | ✅ | No | | | | | | | | | | | PENDING |
| 4 | Paytm | com.paytm.personalfirstapp | ✅ | No | | | | | | | | | | | PENDING |
| 5 | Slice | com.sliceit.slice | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 6 | Airtel Thanks | com.airtel.awareness | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 7 | JioFinance | com.jio.myjio | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 8 | JioPay | com.ril.jiopay | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 9 | Amazon Pay | in.amazon.mShop.android.shopping | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 10 | CRED | com.cred.club | ✅ | No | | | | | | | | | | | PENDING |
| 11 | WhatsApp Pay | com.whatsapp | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 12 | MobiKwik | com.mobikwik_app | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 13 | Freecharge | com.freecharge.android | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 14 | Samsung Wallet | com.samsung.android.wallet | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 15 | ICICI iMobile | com.icici.imobile | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 16 | SBI YONO | com.sbi.yono | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 17 | HDFC MobileBanking | com.hdfc.banking | ⚠️ | TBD | | | | | | | | | | | PENDING |
| 18 | Axis Mobile | com.axisbank.mobile | ⚠️ | TBD | | | | | | | | | | | PENDING |

**Legend:**
- ✅ = Confirmed compatible with generic `upi://pay` intent
- ⚠️ = Provider-specific behavior undocumented; generic UPI preserved, limitation reported
- ❌ = Not compatible (not expected for any app)

**Key Principle:** Generic `upi://pay` capability discovery is the default for ALL apps. App-specific adapters are used ONLY where officially documented and justified. No app-specific package hardcoding unless justified.

---

## Per-App Test Checklist

For each app, execute and record:

### 1. Installed App Discovery
- [ ] App is installed on device
- [ ] `discoverCompatibleUpiApps()` returns the app
- [ ] `isPackageVisible(packageName)` returns true
- [ ] App appears in `queryIntentActivities` for `upi://pay`

### 2. Generic UPI Launch
- [ ] `createPaymentIntent()` builds valid `upi://pay` URI
- [ ] URI contains correct `pa` (VPA), `pn` (payee name), `am` (amount), `cu` (INR), `tr` (transaction ref), `tn` (note)
- [ ] `launchPayment()` opens the app via `StartActivityForResult`
- [ ] No app-specific package hardcoding used

### 3. Payment Amount Preservation
- [ ] Amount in URI matches checkout amount (INR, converted to rupees)
- [ ] No amount truncation or rounding errors
- [ ] Paise conversion correct (100.00 INR = 10000 paise)

### 4. Merchant VPA Correctness
- [ ] `pa` parameter matches merchant receiving VPA
- [ ] VPA is valid format (`identifier@bank`)
- [ ] Receiving account resolved from merchant config

### 5. Return to Buyer App
- [ ] Payment completes in UPI app
- [ ] Buyer returns to Sanbookpay checkout
- [ ] Page state restored (checkout session preserved)

### 6. Returned Data Availability
- [ ] Intent extras contain payment status
- [ ] `rawResult` captured (may be null/malformed)
- [ ] `upiTransactionReference` extracted when available
- [ ] `parsedStatus` normalized (SUCCESS/FAILED/PENDING/CANCELLED/UNKNOWN/UNSUPPORTED)

### 7. Cancellation Handling
- [ ] User cancels payment in UPI app
- [ ] `parsedStatus` = CANCELLED
- [ ] `rawResult` = null or empty
- [ ] No duplicate events created
- [ ] Payment status updated to CANCELLED

### 8. Duplicate Callback Prevention
- [ ] Same `idempotencyKey` rejected on second submission
- [ ] Server returns 409 for duplicate
- [ ] No duplicate financial observations

### 9. Network Recovery
- [ ] Device goes offline during payment
- [ ] Device comes back online
- [ ] WorkManager retries submission with exponential backoff
- [ ] Payment eventually submitted to server

### 10. Backend Notification
- [ ] `/api/v1/payments/{id}/client-return` returns 200
- [ ] Event persisted in `callback_outbox`
- [ ] SSE published to checkout/dashboard
- [ ] Status updated to CLIENT_REPORTED_SUCCESS (REPORTED evidence, not bank-verified)

### 11. Measured Return Latency
- [ ] Time from app launch to server receipt recorded
- [ ] Target: < 5 seconds for 95% of returns
- [ ] Latency logged per app

---

## Test Execution Procedure

1. **Install APK:** `adb install -r app-debug.apk`
2. **Configure merchant VPA** in Sanbookpay dashboard
3. **Launch Sanbookpay Bridge app** on device
4. **Pair device** via QR code scanning
5. **Start payment** from checkout portal on device browser
6. **Select UPI app** from "Pay by Any UPI App" grid
7. **Complete payment** in selected UPI app
8. **Return to checkout** and verify status update
9. **Record results** in compatibility matrix
10. **Repeat** for all 18 apps

---

## Acceptance Criteria

| Criterion | Requirement | Status |
|-----------|-------------|--------|
| Generic UPI discovery | All compatible apps discovered via `upi://pay` | PENDING |
| No app-specific hardcoding | Only `UpiIntentAdapter` interface for documented cases | PENDING |
| No accessibility services | No screen scraping or private data extraction | PENDING |
| Buyer-reported ≠ bank-verified | Client-return labeled REPORTED evidence | PENDING |
| No amount-only matching | UTR + account + amount required for correlation | PENDING |
| Slice/Airtel/Jio limitation | Generic UPI preserved, limitation documented | PENDING |
| Encrypted local store | AES256-GCM for pending payments | PENDING |
| WorkManager retry | Exponential backoff, CONNECTED constraint | PENDING |
| Immediate transmission | No 5-second polling wait | PENDING |

---

## Known Limitations (Documented, Not Marked Complete)

- **Slice:** Generic UPI functionality preserved. Provider-specific callback undocumented. Not marked complete on app existence alone.
- **Airtel Thanks:** Generic UPI functionality preserved. Provider-specific callback undocumented. Not marked complete on app existence alone.
- **JioFinance / JioPay:** Generic UPI functionality preserved. Provider-specific callback undocumented. Not marked complete on app existence alone.
- **WhatsApp Pay:** May not support generic `upi://pay` intent. Fallback to generic QR code.
- **Bank apps (ICICI, SBI, HDFC, Axis):** May require app-specific deep links. Generic UPI preserved as fallback.

---

## Evidence Collection

For each app test, capture:
- [ ] Device model and Android version
- [ ] UPI app version
- [ ] Sanbookpay APK version
- [ ] Screenshot of "Pay by Any UPI App" grid
- [ ] Screenshot of payment in progress
- [ ] Screenshot of return status (CLIENT_REPORTED_SUCCESS)
- [ ] Server logs showing event receipt
- [ ] Measured return latency (ms)
