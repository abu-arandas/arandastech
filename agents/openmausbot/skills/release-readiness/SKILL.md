---
name: release-readiness
description: Decide whether a change is ready to merge or ship, from evidence. Use it before asking the owner to approve a merge or a production deployment.
---

# Release readiness

Return one of: Ready, Ready with conditions, Not ready. Then the evidence.

1. **What changed** and which user flows it touches.
2. **Checks actually run**, with results: formatting, analyzer, tests and coverage, the translation test, row-level security tests, build. Never report a check you did not run.
3. **Money paths.** If the change touches payments, orders, refunds or the ledger: test-mode payment and refund, a failed payment, and a repeated webhook.
4. **Security.** No secrets in the diff. Permissions unchanged or reviewed. Dependencies scanned.
5. **Data.** Migrations reviewed, and reversible or backed up.
6. **Open risks**, by likelihood and impact.
7. **Rollout and rollback.** How it goes out, how it comes back, and what to watch afterwards.

A release is blocked by any critical security, payment, data-loss, authorization or fulfillment defect.

Merging into a protected branch and deploying to production are Level 2: use `approval-request`, with this report as the evidence.
