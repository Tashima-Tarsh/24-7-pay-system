# 12 — DEFECT REGISTER

**Product:** 24-7 Pay / YOUPI PG  
**Audit date:** 2026-11-08  
**All defects below were fixed in this cycle unless marked OPEN.**

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

## FIXED — Sanbook store removal (per product request)

| ID | Severity | Defect | Action |
|---|---|---|---|
| DEF-12 | Low | `Sanbook_Pay_UPI_Payment_Manual.pdf` present | Deleted |
| DEF-13 | Low | `apps/merchant-admin/public/sanbook-pay-admin.{css,js}` | Deleted |
| DEF-14 | Low | `apps/payment-api/src/__tests__/sanbook-pay-production.test.js` | Deleted |
| DEF-15 | Low | `packages/merchant-sdk/src/__tests__/sanbook-pay-sdk.test.js` | Deleted |
| DEF-16 | Low | `scripts/test-all.js` referenced deleted Sanbook tests | Removed entries; renamed runner to YOUPI PG |

## FIXED — Dependency / build

| ID | Severity | Defect | Fix |
|---|---|---|---|
| DEF-17 | Medium | `@tanstack/react-query` imported but not declared in checkout-portal deps | Added to `package.json`, installed |
| DEF-18 | Medium | `@youpi/ui` imported but package declared as `@24-7-pay/ui` | Renamed imports to `@youpi/ui`; added `./utils` export |
| DEF-19 | Medium | `@youpi/ui` `index.ts` used `.tsx`/`.ts` extensions (incompatible with bundler resolution) | Removed extensions from imports |
| DEF-20 | Medium | `packages/ui/tsconfig.json` used NodeNext resolution conflicting with bundler | Reverted to base (consumer-side bundler resolution used) |
| DEF-21 | Low | `Input.tsx` used `cn` without import | Added `import { cn } from './utils/cn'` |

## OPEN — Pre-existing, not fixed in this cycle (out of scope / not reproduced)

| ID | Severity | Defect | Disposition |
|---|---|---|---|
| DEF-22 | Low | `packages/ui` standalone `tsc` fails under NodeNext resolution (pre-existing) | Not fixed; checkout-portal (consumer) builds clean with bundler resolution |
| DEF-23 | Medium | No measured k6 load results | Scripts exist; not executed in this audit |
| DEF-24 | Medium | Backup/restore drill not executed | Scripts/docs present; not executed |
| DEF-25 | Medium | No WCAG accessibility audit | Recommended before launch |
| DEF-26 | Medium | PCI-DSS / RBI UPI regulatory mapping | Not assessed |

## Defect counts

| Category | Count |
|---|---|
| Fixed in this cycle | 21 |
| Open (pre-existing / recommended) | 5 |
| Critical vulnerabilities | 0 |
| High-severity findings | 0 (all high-severity frontend defects fixed) |
