# Sanbookpay master payment stack

The API lives in `apps/master-payment-api`, the merchant portal in `apps/master-merchant-portal`, and the Android library in `packages/master-android-sdk`. This stack runs separately from the existing Sanbookpay services.

## Local development

1. Copy `.env.master.example` to `.env.master`. Set unique JWT, token and bank webhook secrets of at least 32 random bytes, a fixture password, and matching Turnstile test credentials if you want to exercise registration.
2. Run `docker compose --env-file .env.master -f docker-compose.master.yml up --build -d`.
3. Run `docker compose --env-file .env.master -f docker-compose.master.yml exec api npm run seed`. Keep the returned API key on the game server or in your local test environment.
4. Open the merchant portal at http://localhost:3200 and sign in with the seed email and password. The API is available on http://localhost:3100. MongoDB and Redis are private to the Compose network.

The fixture VPA is synthetic. Use it only for local tests with signed fixture webhooks. For deployment, configure a TLS ingress, use secure portal cookies, map each approved receiving VPA to its merchant email in `MASTER_APPROVED_UPI_OWNERS`, configure trusted proxy addresses and bank callback allowlists, and provide a dedicated secret for each trust boundary.

## Payment integration

1. The game server calls `POST /api/payment-sessions` using the merchant API key, supplying the game order ID, integer amount in paise and registered Android certificate SHA-256.
2. Pass the scoped session token to the game app. Android sends that token with device headers, fetches the assigned UPI URI, and opens an installed UPI handler using Activity Result APIs.
3. A verified bank webhook confirms the expected VPA, amount, currency and transaction reference. Android polls verification after the handoff and receives a short-lived payment grant only once the backend has confirmation.
4. The game server redeems the grant using its merchant API key. Record a pending redemption attempt durably before the call and credit the player's balance once per order in the game's own database. If the response is lost, query the authenticated order endpoint and reconcile its recorded redemption.

## Smoke and load checks

Run these from an isolated development stack. The smoke test creates a synthetic order and posts a signed fixture confirmation. The load script creates separate synthetic orders and measures request outcomes without sending bank confirmations.

```sh
docker compose --env-file .env.master -f docker-compose.master.yml exec -e SMOKE_MERCHANT_API_KEY api node smoke.mjs
docker compose --env-file .env.master -f docker-compose.master.yml exec -e SMOKE_MERCHANT_API_KEY api node load.mjs
```

Set `SMOKE_MERCHANT_API_KEY` in the calling shell first. Also set and pass `SMOKE_APP_SIGNATURE` if you changed the default fixture fingerprint. The load script schedules up to 1,000 requests to the routing endpoint over one minute and reports status counts and p95 latency. For the full load run, set RATE_LIMIT_MAX=1500 in the isolated fixture configuration before starting and seeding the stack. One fixture VPA will saturate quickly. An acceptance run for 1,000 successful routes needs a separately provisioned synthetic pool large enough to satisfy the routing constraints.
