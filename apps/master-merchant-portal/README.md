# Merchant portal

A Next.js 14 App Router app with Tailwind, shadcn-style Radix controls and Recharts. Run `npm ci --workspaces=false`, then `npm run dev` from this folder. The portal listens on port 3100. Use `npm test` and `npm run typecheck` for local checks.

- `API_INTERNAL_URL` points to the private API origin. It defaults to `http://localhost:3000`.
- `CAPTCHA_SITE_KEY` is the public Turnstile site key. Registration requires a configured CAPTCHA.
- `PORTAL_ORIGIN` is the browser-facing portal origin, such as `https://merchant.example.com`. Set it when running behind a proxy.
- Production cookies are secure by default. Use `SESSION_COOKIE_SECURE=false` only in local HTTP environments.
- Only set `PORTAL_TRUSTED_CLIENT_IP_HEADER` when your ingress overwrites the named header and direct access to the portal is blocked. Configure the API to trust only the portal network peer for forwarded IPs. Without that setup the API sees the portal’s source IP.
