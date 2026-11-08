# Incident Runbook — 24-7 Pay / YOUPI PG

**Product:** 24-7 Pay / YOUPI PG — Self-Hosted White-Label UPI Payment Gateway  
**Version:** 1.0  
**Date:** 2026-11-08  
**Audience:** SRE, DevOps, On-call Engineer  
**Classification:** Internal — Contains operational procedures (no secrets)

---

## 1. Purpose

This runbook provides standard operating procedures for responding to incidents in the 24-7 Pay payment gateway. It covers detection, triage, mitigation, resolution, and post-incident review for the payment API, checkout frontend, and shared infrastructure.

---

## 2. Severity Levels

| Severity | Definition | Response Time | Escalation |
|---|---|---|---|
| **SEV-1** | Payment processing down; no callbacks processed; financial transactions at risk | 15 min | Page on-call + Engineering Manager |
| **SEV-2** | Degraded payment flow; high error rate; partial callback failure | 30 min | On-call engineer |
| **SEV-3** | Non-payment feature broken; admin console issue; performance degradation | 1 hour | On-call engineer |
| **SEV-4** | Cosmetic issue; documentation gap; low-impact bug | Next business day | Create ticket |

---

## 3. On-Call Contacts

| Role | Contact | Escalation Path |
|---|---|---|
| Primary On-Call | [PagerDuty / Slack] | SEV-1 → SEV-4 |
| Secondary On-Call | [PagerDuty / Slack] | If primary unresponsive 15 min |
| Engineering Lead | [Slack / Email] | SEV-1 escalation |
| Security Lead | [Slack / Email] | Security incidents |
| Infrastructure Lead | [Slack / Email] | Infrastructure/DNS incidents |

---

## 4. Incident Detection & Monitoring

### 4.1 Health Checks

| Endpoint | Method | Expected | Alert Threshold |
|---|---|---|---|
| `/health` | GET | 200 OK | >30s response or non-200 |
| `/api/v1/health` | GET | 200 OK | >30s response or non-200 |
| SSE broadcast | EventStream | Connected | Disconnected >5 min |

### 4.2 Key Metrics to Monitor

| Metric | Warning | Critical |
|---|---|---|
| Payment creation error rate | >5% | >10% |
| Callback delivery failure rate | >5% | >10% |
| API P95 latency | >500ms | >1s |
| Queue backlog | >100 | >500 |
| CPU utilization | >70% | >90% |
| Memory utilization | >75% | >90% |

### 4.3 Alert Channels

- **PagerDuty:** SEV-1, SEV-2
- **Slack #alerts:** All severities
- **Email:** SEV-3, SEV-4 summary

---

## 5. Incident Response Procedure

### 5.1 SEV-1: Payment Processing Down

**Symptoms:** All payment creation fails; callbacks not processed; webhook delivery failing.

**Immediate Actions (0–15 min):**

1. **Declare incident** — Create incident channel, notify on-call + engineering lead.
2. **Verify scope** — Check `/health` and `/api/v1/health` endpoints.
3. **Check infrastructure** — Verify server is running, database accessible, DNS resolving.
4. **Rollback if deployment-related** — If incident started after a deploy, revert to previous version.
5. **Communicate** — Post initial update to status page / Slack.

**Investigation (15–60 min):**

6. **Check logs** — `apps/payment-api/src/index.js` error output, server stdout/stderr.
7. **Check database** — SQLite file locks, WAL mode, connection exhaustion.
8. **Check callback outbox** — `callback_outbox` table for stuck deliveries.
9. **Check webhook secrets** — Merchant webhook secrets valid, not rotated unexpectedly.

**Resolution (60+ min):**

10. **Apply fix** — Code fix, config change, or infrastructure change.
11. **Verify** — Health checks pass, test payment flows end-to-end.
12. **Restore full traffic** — Confirm all merchants can create payments and receive callbacks.

**Post-incident:**

13. **Write postmortem** — Document root cause, timeline, action items.
14. **Update runbook** — Add new failure mode if applicable.

### 5.2 SEV-2: Degraded Payment Flow

**Symptoms:** Elevated error rate on payment creation or callback verification; some transactions succeed, some fail.

**Immediate Actions:**

1. **Check rate limiting** — `rate-limit` middleware may be blocking legitimate merchants.
2. **Check callback outbox** — `callback_delivery_attempts` for retry exhaustion.
3. **Check webhook URL validity** — Merchant webhook URLs may be unreachable.

**Resolution:**

4. **Adjust rate limits** — Temporarily increase `RATE_LIMIT_MAX` if legitimate traffic is blocked.
5. **Replay failed callbacks** — Use event replay endpoint for stuck webhook deliveries.
6. **Notify affected merchants** — If specific merchants impacted, contact them directly.

### 5.3 SEV-3: Non-Payment Feature Broken

**Symptoms:** Admin console, reports, settings, or team management not functioning.

**Response:**

1. **Identify affected feature** — Check specific page/routes returning errors.
2. **Apply fix or workaround** — Deploy fix or disable broken feature gracefully.
3. **Document** — Track in issue tracker for next sprint.

### 5.4 SEV-4: Cosmetic / Low Impact

**Response:**

1. **Create ticket** — In issue tracker.
2. **Address in next sprint** — No immediate action required.

---

## 6. Common Failure Modes & Remediation

### 6.1 Rate Limiting (100 req / 15 min per IP)

**Symptoms:** `429 Too Many Requests` on payment creation.

**Remediation:**
- Temporarily increase `RATE_LIMIT_MAX` env var.
- Restart server to reset in-memory rate limiter.
- Add merchant-specific rate limit bypass for high-volume merchants.

### 6.2 Callback Outbox Stuck

**Symptoms:** Webhook deliveries not going out; `callback_delivery_attempts` growing.

**Remediation:**
- Check `webhookRetryRunning` flag — should not be stuck `true`.
- Manually trigger retry via `/api/v1/webhooks/retry` endpoint.
- Verify merchant webhook URLs are reachable (not blocked by SSRF protection).

### 6.3 Database Lock / WAL Issues

**Symptoms:** `database is locked` errors; slow query performance.

**Remediation:**
- Check for long-running transactions.
- Verify WAL mode is enabled (`PRAGMA journal_mode=wal`).
- Restart server to clear stale locks.
- For Postgres: check connection pool, run `VACUUM ANALYZE`.

### 6.4 SSRF Protection Blocking Webhooks

**Symptoms:** Webhook delivery to private/internal URLs fails.

**Remediation:**
- Verify webhook URL is public and reachable.
- Set `YOUPI_ALLOW_PRIVATE_WEBHOOKS=true` only for trusted internal URLs.
- Review `validateOutboundWebhookUrl` logic.

### 6.5 Session Slot Exhaustion

**Symptoms:** New payment sessions rejected; merchants at concurrency limit.

**Remediation:**
- Check `SLOT_OCCUPYING_STATES` (ACTIVE, PROCESSING).
- Wait for sessions to complete or expire (default 300s active window).
- Check queue promotion logic (`handleSlotFreedAndPromote`).

### 6.6 Payment Confirmation Failure

**Symptoms:** Authentic callbacks rejected; payments stuck in `VERIFY_PENDING`.

**Remediation:**
- Verify merchant webhook secret matches callback signature.
- Check `AttributionEngine` matching (amount + UTR + merchant).
- Review `PaymentVerificationPipeline` logs.
- Ensure `PAID_VERIFIED` → `SUCCESS` transition is allowed.

---

## 7. Communication Templates

### 7.1 SEV-1 Initial Notification

```
[SEV-1] 24-7 Pay Payment Processing Degraded

Status: Investigating
Impact: Payment creation and callback processing affected
Time: <UTC timestamp>
On-call: <name>
Channel: #incident-<id>

We are aware of an issue affecting payment processing. Our team is investigating. 
We will provide updates every 15 minutes.
```

### 7.2 SEV-1 Resolution Notification

```
[SEV-1 RESOLVED] 24-7 Pay Payment Processing Restored

Status: Resolved
Impact: None remaining
Time: <UTC timestamp>
Duration: <X minutes>
Root cause: <brief summary>
Action items: <link to postmortem>

Payment processing has been restored. All transactions are processing normally. 
A postmortem will be published within 24 hours.
```

---

## 8. Post-Incident Review

### 8.1 Postmortem Template

| Field | Content |
|---|---|
| Incident ID | |
| Severity | |
| Start time | |
| End time | |
| Duration | |
| Root cause | |
| Trigger | |
| Customer impact | |
| Detection method | |
| Response timeline | |
| What went well | |
| What went wrong | |
| Action items | |

### 8.2 Action Item Tracking

All action items must be:
- Assigned to an owner
- Given a due date
- Tracked to closure in the issue tracker

---

## 9. Runbook Maintenance

- Review quarterly or after any SEV-1 incident
- Update when new features or infrastructure changes are deployed
- Test annually with a game-day exercise

---

## 10. Emergency Contacts

| Role | Name | Phone | Slack | Email |
|---|---|---|---|---|
| Primary On-Call | | | | |
| Secondary On-Call | | | | |
| Engineering Lead | | | | |
| Security Lead | | | | |
| Infrastructure Lead | | | | |
| Vendor Support (Render) | | | | |
