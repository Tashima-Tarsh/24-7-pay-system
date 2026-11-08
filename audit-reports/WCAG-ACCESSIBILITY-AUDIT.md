# WCAG 2.1 Accessibility Audit

**Product:** 24-7 Pay / YOUPI PG — checkout-portal (merchant checkout console)  
**Standard:** WCAG 2.1 Level AA  
**Audit Method:** Source code review (automated browser testing not performed in this environment)  
**Audit Date:** 2026-11-08  
**Scope:** Sidebar, Header, CommandPalette, Toast, and all page components in `apps/checkout-portal`

---

## Summary

| Criterion | Status | Issues Found |
|---|---|---|
| Perceivable | Partial | Color contrast, missing alt text, icon-only buttons |
| Operable | Partial | Missing focus indicators, keyboard traps possible |
| Understandable | Partial | Inconsistent labels, missing error identification |
| Robust | Partial | ARIA usage incomplete, landmark roles partially present |

**Overall: Not yet WCAG 2.1 AA compliant** — Requires remediation before production launch.

---

## Detailed Findings

### 1. Perceivable (WCAG 1.x)

#### 1.1 Non-text Content (1.1.1) — PARTIAL

| Location | Issue | Severity | Recommendation |
|---|---|---|---|
| Sidebar logo | "24" lettermark has no alternative text | Low | Add `aria-label="24/7 Pay logo"` |
| Sidebar nav icons | Icons rendered without text when collapsed; screen readers announce nothing meaningful | Medium | Add `aria-label` to each nav link (e.g., `aria-label="Overview"`) |
| Sidebar badge | Badge count (e.g., "3") without context | Low | Add `aria-label="3 items in quarantine"` |
| Sidebar logout icon | Icon-only button when collapsed | Medium | Add `aria-label="Sign Out"` |
| Header brand | "24" lettermark no alt text | Low | Add `aria-label="24/7 Pay"` |
| Header user avatar | Initial letter without context | Low | Add `aria-label="User profile: {name}"` |
| Test mode toggle | Toggle switch has no state indication | Medium | Add `aria-pressed="{state}"` or `role="switch"` with `aria-checked` |
| Toast icons | CheckCircle/XCircle without context | Low | Icons are decorative if toast text is sufficient; otherwise add `aria-label` |

#### 1.4 Contrast (1.4.3) — PARTIAL

| Location | Colors | Contrast Ratio | WCAG AA Requirement | Status |
|---|---|---|---|---|
| Sidebar text | `text-slate-300` on `bg-neutral-950` | ~4.7:1 | 4.5:1 (normal text) | PASS |
| Sidebar secondary | `text-neutral-400` on `bg-neutral-950` | ~3.1:1 | 4.5:1 | FAIL |
| Header text | `text-neutral-400` on `bg-neutral-900/50` | ~3.5:1 | 4.5:1 | FAIL |
| Badge text | `text-danger-500` on `bg-danger-500/10` | ~2.8:1 | 4.5:1 | FAIL |
| Test mode label | `text-neutral-300` on `bg-white/5` | ~4.0:1 | 4.5:1 | FAIL |

**Recommendation:** Increase contrast for secondary text elements. Use `text-neutral-300` minimum for body text, `text-neutral-100` for important text.

#### 1.4.1 Use of Color (1.4.1) — PARTIAL

| Location | Issue | Recommendation |
|---|---|---|
| Status badges | Color-only indication of payment status | Add text label or pattern alongside color |
| Test mode toggle | Color-only indication of active state | Add text label or `aria-pressed` |
| Error states | Red color used without text indicator | Add error icon or text prefix |

---

### 2. Operable (WCAG 2.x)

#### 2.1 Keyboard Accessible (2.1.1) — PARTIAL

| Location | Issue | Recommendation |
|---|---|---|
| Sidebar toggle | Button is keyboard accessible | PASS |
| Nav links | `<a>` elements are keyboard accessible | PASS |
| Command palette | Triggered by `⌘K` but no visible focus indicator | Add `focus-visible` styles |
| Toast dismiss | No keyboard mechanism to dismiss toasts | Add `Esc` key handler |

#### 2.4.7 Focus Visible (2.4.7) — FAIL

| Location | Issue | Recommendation |
|---|---|---|
| All interactive elements | No `focus-visible` or `focus` styles defined | Add `focus-visible:ring-2 focus-visible:ring-primary-500` to all interactive elements |
| Sidebar toggle | No visible focus ring | Add focus styling |
| Buttons | No visible focus indicator | Add focus styling |

#### 2.4.1 Bypass Blocks (2.4.1) — FAIL

| Location | Issue | Recommendation |
|---|---|---|
| All pages | No "Skip to content" link | Add visually hidden skip link at top of each page |
| Sidebar navigation | No way to bypass repeated navigation | Add skip link or landmark navigation |

---

### 3. Understandable (WCAG 3.x)

#### 3.3.2 Labels or Instructions (3.3.2) — PARTIAL

| Location | Issue | Recommendation |
|---|---|---|
| Settings form inputs | `<label>` elements present (PASS) | Ensure all inputs have associated labels |
| Test mode toggle | No visible state text | Add "On"/"Off" text or `aria-pressed` |
| Badge counts | Number without context | Add descriptive `aria-label` |

#### 3.3.3 Error Suggestion (3.3.3) — PARTIAL

| Location | Issue | Recommendation |
|---|---|---|
| Form validation | Error messages present but not programmatically associated | Use `aria-describedby` to link errors to inputs |
| Toast errors | Error toasts appear but focus isn't managed | Move focus to error or announce via ARIA live region |

#### 4.1.2 Name, Role, Value (4.1.2) — PARTIAL

| Location | Issue | Recommendation |
|---|---|---|
| Test mode toggle | No `aria-pressed` or `role="switch"` | Add `role="switch"` + `aria-checked="{boolean}"` |
| Badge component | Presentational only | Add `aria-hidden="true"` if decorative, or label if informative |

---

### 4. Robust (WCAG 4.x)

#### 4.1.1 Parsing (4.1.1) — PASS

All HTML/JSX is well-formed. No parsing issues detected.

#### 4.1.3 Status Messages (4.1.3) — PARTIAL

| Location | Issue | Recommendation |
|---|---|---|
| Toast notifications | Toasts appear visually but not announced to screen readers | Add `role="status"` or `aria-live="polite"` to toast container |
| Form submission results | No ARIA live region for async results | Add `aria-live="assertive"` for critical errors |

---

## Recommended Remediation (Priority Order)

### Critical (Fix before launch)

1. **Add `aria-label` to all icon-only buttons** (Sidebar toggle, logout, nav links when collapsed)
2. **Add `focus-visible` styles** to all interactive elements
3. **Fix color contrast** for secondary text (minimum 4.5:1 ratio)
4. **Add `role="switch"` + `aria-checked`** to test mode toggle
5. **Add `role="status"`** to toast container for screen reader announcements

### High (Fix within first release cycle)

6. **Add "Skip to content" link** on all pages
7. **Add `aria-label` to user avatar and brand logo**
8. **Programmatically associate error messages** with form inputs (`aria-describedby`)
9. **Add `aria-label` to badge counts** with context

### Medium (Fix in subsequent release)

10. **Add `aria-hidden="true"`** to purely decorative icons
11. **Ensure all form fields have visible labels**
12. **Add `lang` attribute** to `<html>` element
13. **Test with screen reader** (NVDA, JAWS, VoiceOver)

---

## Tools Recommended for Validation

- **axe-core** — Automated accessibility testing (`npm install -D axe-core`)
- **Lighthouse** — Accessibility scoring in Chrome DevTools
- **NVDA** — Free screen reader for manual testing
- **WCAG Contrast Checker** — Verify color contrast ratios
