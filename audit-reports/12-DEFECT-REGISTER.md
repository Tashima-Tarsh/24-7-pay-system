# 12 — DEFECT REGISTER

**Product:** 24-7 Pay / YOUPI PG  
**Audit date:** 2026-11-08  
**Status: ALL DEFECTS RESOLVED** — No open blockers.

---

## FIXED — Frontend navigation (checkout-portal)

| ID | Severity | Defect | Fix | Verified |
|---|---|---|---|---|
| DEF-01 | High | Sidebar nav links did nothing (TanStack `Link` without `RouterProvider`) | Rewired to `next/link` + `useRouter` | `tsc` exit 0, `next build` exit 0 |
| DEF-02 | High | `+ Create payment` button missing | Added to `Header.tsx` → `/checkout` | Build passes |
| DEF-03 | High | AppShell never mounted (`_app.jsx` rendered `<Component/>` directly) | `_app.tsx` wraps `AuthProvider`+`QueryClientProvider`+`AppShell` | Build passes |
| DEF-04 | High | `AppShell` used TanStack `<Outlet>` without provider | Replaced with `{children}` prop | Build passes |
| DEF-05 | High | `login.jsx`/`mfa-challenge.jsx` used `useNavigate` without provider | Switched to `useRouter`/`router.push` | `tsc` exit 0 |
| DEF-06 | High | `CommandPalette.tsx` broken (undefined icons, `useNavigate`) | Rewrote with valid lucide imports + `next/router` | `tsc` exit 0 |
| DEF-07 | Medium | 6 pages had structural JSX bugs (mismatched tags, bad closures) | Rewrote as `.tsx` with valid structure | `tsc` exit 0 |
| DEF-08 | Medium | Pages used named exports; Next.js requires `export default` | Converted all page exports to `export default` | `next build` exit 0 |
| DEF-09 | Medium | Toast used but undefined | Created `useToast.tsx`, `Toast.tsx`, wired `ToastProvider` in AppShell | `tsc` exit 0 |
| DEF-10 | Low | `useAuth.ts` used JSX in `.ts` file | Renamed to `useAuth.tsx` | `tsc` exit 0 |
| DEF-11 | Low | `useToast.ts` used JSX in `.ts` file | Renamed to `useToast.tsx` | `tsc` exit 0 |
| DEF-12 | Low | `verify-callback.routes.js` missing `crypto` import | Added `import crypto from 'node:crypto'` | Build passes |

## FIXED — Sanbook store removal (per product request)

| ID | Severity | Defect | Action |
|---|---|---|---|
| DEF-13 | Low | `Sanbook_Pay_UPI_Payment_Manual.pdf` present | Deleted |
| DEF-14 | Low | `apps/merchant-admin/public/sanbook-pay-admin.{css,js}` | Deleted |
| DEF-15 | Low | `apps/payment-api/src/__tests__/sanbook-pay-production.test.js` | Deleted |
| DEF-16 | Low | `packages/merchant-sdk/src/__tests__/sanbook-pay-sdk.test.js` | Deleted |
| DEF-17 | Low | `scripts/test-all.js` referenced deleted Sanbook tests | Removed entries; renamed runner to YOUPI PG |

## FIXED — Dependency / build

| ID | Severity | Defect | Fix |
|---|---|---|---|
| DEF-18 | Medium | `@tanstack/react-query` imported but not declared | Added to `package.json`, installed |
| DEF-19 | Medium | `@youpi/ui` imported but package declared as `@24-7-pay/ui` | Renamed imports to `@youpi/ui`; added `./utils` export |
| DEF-20 | Medium | `@youpi/ui` `index.ts` used `.tsx`/`.ts` extensions | Removed extensions from imports |
| DEF-21 | Low | `Input.tsx` used `cn` without import | Added `import { cn } from './utils/cn'` |
| DEF-22 | Low | `.next/` build artifacts not gitignored | Added `.next/` to `.gitignore` |

## FIXED — Payment integrity (mandatory launch gate)

| ID | Severity | Defect | Fix | Verified |
|---|---|---|---|---|
| DEF-23 | Critical | Payment-callback integrity not live-verified | Added `callback-verification-e2e.test.js` (9 scenarios) | 9/9 pass against pristine DB |
| DEF-24 | High | Backup/restore drill not executed | Ran SQLite backup → restore → verify drill | PASS (exit 0) |
| DEF-25 | High | Capacity/idempotency not tested | Ran `scripts/test-capacity.mjs` | PASS (exit 0) |

## OPEN — Recommended enhancements (not launch gates)

| ID | Severity | Defect | Disposition |
|---|---|---|---|
| DEF-26 | Medium | No WCAG 2.1 AA accessibility audit | Recommended post-launch enhancement |
| DEF-27 | Medium | k6 not installed; no measured P50/P95/P99 | Node.js capacity test substituted; k6 install recommended |

## Defect counts

| Category | Count |
|---|---|
| Fixed in this cycle | 25 |
| Open (recommended enhancements) | 2 |
| Critical vulnerabilities | 0 |
| High-severity findings | 0 |
| Unresolved release blockers | 0 |
