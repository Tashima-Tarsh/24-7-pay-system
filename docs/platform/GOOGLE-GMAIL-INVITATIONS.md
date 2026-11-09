# Gmail invitation sender — secure owner setup

The **Platform owner → Invitation email** screen can now configure its own Google OAuth Web application and connect a personal Gmail account to send merchant-owner activation invitations.

### One-time setup

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), enable the Gmail API and configure your OAuth consent screen. Add your own Gmail address as a test user while the Google application is in Testing mode.
2. Create an **OAuth 2.0 Client ID → Web application**. Under authorized redirect URIs, enter:
   `https://two4-7-pay-live.onrender.com/api/platform/v1/gmail/callback`
3. Sign in to the 24/7 Pay **platform owner workspace**. Open **Invitation email** and enter your Google Web Client ID and client secret. Select **Save OAuth configuration**. These values are encrypted before being stored in Render PostgreSQL; the secret is not displayed again.
4. Select **Connect my Gmail**, sign in to the sending account, and approve the limited Google permissions. The app requests OpenID + Google account email identity, and the **Gmail send-only** scope. It does not ask to read or modify Gmail messages.
5. Open **Merchants → Add a merchant**. The merchant owner receives an invitation with a one-time activation link. If no sender is configured or delivery fails, the portal displays a private link instead. An invitation must not be marked delivered unless Google accepts the send request.

### Security and limits

- Only `SUPER_ADMIN` can configure or disconnect Gmail. The app uses a random one-time OAuth state with ten-minute expiry.
- OAuth client secrets and refresh tokens are encrypted with the existing Render `ENCRYPTION_MASTER_KEY`. Preserve that key across redeployments. Changing it will make existing stored tokens unreadable.
- The invitation includes a short-lived bearer activation token. Treat invitation links as secrets; send them only to the intended owner.
- Disconnecting deletes the locally stored refresh token. Separately revoke third-party access in Google Account settings if desired.
- Google may require OAuth app verification before public production deployment. While in testing mode, only approved test users may authorize the Gmail app.
- Gmail is used **only for outbound invitations**. Email receipt notifications are *not* bank-confirmed payment evidence. A successful Gmail send does not validate payment or callback delivery.
- The app is on a temporary free Render PostgreSQL plan (known expiration December 8, 2026). Export or migrate records before that date.

### Implementation

Service: `apps/payment-api/src/platform/gmail-invitations.js`. Routes (all owner-only except one-time OAuth callback): `/api/platform/v1/gmail/sender`, `/gmail/client`, `/gmail/connect`, `/gmail/disconnect`, `/gmail/callback`. Regression: `scripts/platform-gmail-invitations.test.js`.

Do not place personal Gmail passwords, app passwords, OAuth client secrets or refresh tokens in GitHub, frontend JavaScript, screenshots, or customer documentation.
