---
name: 24-7-pay-croftweaver
description: >
  Apply Croftweaver-inspired quality checks to 24/7 Pay every time the
  public site, merchant workspace, platform owner UI, checkout or invitations change.
---

# 24/7 Pay x Croftweaver - persistent project skill

This project-specific skill adapts the open-source [Croftweaver](https://github.com/karero/croftweaver) suite. Consult upstream instructions at the URLs below; do not replace our Node/Render/PostgreSQL architecture with Croftweaver's Astro starter.

## Upstream skills to consult by task

- Design and responsive branding:
  https://github.com/karero/croftweaver/blob/main/skills/website-design-system/SKILL.md
  https://github.com/karero/croftweaver/blob/main/skills/website-brand-kit/SKILL.md
- Human-facing copy and accessible explanations:
  https://github.com/karero/croftweaver/blob/main/skills/copywriting/SKILL.md
  https://github.com/karero/croftweaver/blob/main/skills/website-content-guide/SKILL.md
- Browser checks, quality review, cross-file consistency:
  https://github.com/karero/croftweaver/blob/main/skills/website-qa/SKILL.md
  https://github.com/karero/croftweaver/blob/main/skills/website-review/SKILL.md
  https://github.com/karero/croftweaver/blob/main/skills/double-knuth/SKILL.md
- Marketing truth and search:
  https://github.com/karero/croftweaver/blob/main/skills/facts-check/SKILL.md
  https://github.com/karero/croftweaver/blob/main/skills/website-seo-geo/SKILL.md

## Mandatory workflow

1. Read root AGENTS.md, the relevant UI, the backend route, latest GitHub head, CI, and Render deployment status. Never rely solely on the README for feature availability.
2. Map every visible navigation item and button to a real authorized backend route, then test success, empty, invalid, expired and unauthorized scenarios.
3. Enforce platform-owner cross-merchant visibility vs merchant-owned tenant isolation on the server. URL or frontend manipulation must never expose another tenant.
4. Distinguish confirmed payment, webhook HTTP acknowledgement, supplemental SMS/email observation and bank settlement. Never infer real money from a browser button.
5. Check responsive layout at 360, 768, 1280px; screen-reader labels, keyboard support, contrast, and consistent ivory/forest/copper brand tokens.
6. Run the project regression, PostgreSQL tests, Chromium tests, and a two-pass correctness/completeness review. Fix errors before shipping.
7. Report separately: code committed, CI verified, Render live, provider configured, funds verified. Never claim production money readiness from green CI alone.

For Gmail invitations, ask for the limited Google email identity plus gmail.send permission, encrypt client credentials/refresh tokens at rest, and never place secrets in the browser or repository.

Aim for a saleable operating product through operational reliability, merchant activation, accurate KPIs, backups and measurable transaction success. The requested valuation is a business goal, not something code can certify.

This skill is checked into the repository for future coding sessions. It does not auto-install the entire Croftweaver suite globally or run an agent continuously.
