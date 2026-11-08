# 13 — FIXES AND REGRESSIONS

**Product:** 24-7 Pay / YOUPI PG  
**Cycle:** Single remediation cycle  
**All fixes verified via typecheck + build + test.**

---

## Fixes applied (this cycle)

### Frontend (checkout-portal)
1. `pages/_app.tsx` — `AuthProvider` + `QueryClientProvider` + `AppShell` wrapper.
2. `components/AppShell.tsx` — `{children}` prop (replaced TanStack `<Outlet>`); added `ToastProvider` + `<Toast/>`.
3. `components/Sidebar.tsx` — `next/link` + `useRouter`; logout via `useAuth().logoutAndRedirect`.
4. `components/Header.tsx` — + Create payment button → `/checkout`; null-user guard.
5. `components/CommandPalette.tsx` — `next/router`, valid lucide imports.
6. `pages/login.tsx`, `pages/mfa-challenge.tsx` — `useRouter`/`router.push`.
7. `pages/admin.tsx`, `quarantine.tsx`, `reports.tsx`, `settings.tsx`, `team.tsx`, `webhooks.tsx`, `payments.tsx`, `checkout/[id].tsx` — rewritten with valid JSX; `export default`.
8. `hooks/useAuth.ts` → `useAuth.tsx`; `hooks/useToast.ts` → `useToast.tsx`.
9. New `components/Toast.tsx`, `hooks/useToast.tsx`.
10. `hooks/useApi.ts` — added `api` object (16 methods) + `put`/`del`.
11. `utils/format.ts` — created (`formatCurrency`, `formatDate`, `formatTime`).
12. `package.json` — added `@tanstack/react-query`; import rename `@24-7-pay/ui` → `@youpi/ui`.
13. `packages/ui/src/index.ts` — removed `.tsx`/`.ts` extensions; added `./utils` export.
14. `packages/ui/src/components/Input.tsx` — added `cn` import.

### Repo hygiene
15. Deleted 5 Sanbook store files.
16. `scripts/test-all.js` — removed Sanbook entries; renamed to YOUPI PG.

### Backend
17. No backend source changes required (backend already type-clean + test-green).

---

## Verification results

| Check | Before | After |
|---|---|---|
| `tsc -b --noEmit` (monorepo) | exit 0 (checkout-portal had page errors) | exit 0 (clean) |
| `next build` (checkout-portal) | FAILED (JSX/export errors) | PASS — 16 routes prerendered |
| Full regression suite | 64/66 (2 Sanbook phantom) | 64/64 (Sanbook removed from runner) |
| Critical payment-api tests | 45/45 PASS | 45/45 PASS |

---

## Regressions introduced

None detected. All previously-passing tests remain passing; typecheck and build are clean.

---

## Files changed

- `apps/checkout-portal/pages/_app.tsx` (new, replaces `_app.jsx`)
- `apps/checkout-portal/components/AppShell.tsx`
- `apps/checkout-portal/components/Sidebar.tsx`
- `apps/checkout-portal/components/Header.tsx`
- `apps/checkout-portal/components/CommandPalette.tsx`
- `apps/checkout-portal/components/Toast.tsx` (new)
- `apps/checkout-portal/hooks/useAuth.tsx` (renamed from `.ts`)
- `apps/checkout-portal/hooks/useToast.tsx` (new)
- `apps/checkout-portal/hooks/useApi.ts`
- `apps/checkout-portal/utils/format.ts` (new)
- `apps/checkout-portal/pages/*.tsx` (8 pages converted from `.jsx`)
- `apps/checkout-portal/package.json`
- `scripts/test-all.js`
- `packages/ui/src/index.ts`
- `packages/ui/src/components/Input.tsx`
- Deleted: 5 Sanbook files; `_app.jsx`, `admin.jsx`, `audit.jsx`, `checkout/[id].jsx`, `login.jsx`, `mfa-challenge.jsx`, `overview.jsx`, `payments.jsx`, `quarantine.jsx`, `reports.jsx`, `settings.jsx`, `team.jsx`, `vpa-pool.jsx`, `webhooks.jsx`
