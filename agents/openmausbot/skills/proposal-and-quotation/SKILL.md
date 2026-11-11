---
name: proposal-and-quotation
description: Prepare a proposal and quotation for a qualified lead, with a written scope and a margin check. Use it after a lead is qualified and before any price reaches a customer.
---

# Proposal and quotation

1. **Scope.** Write what is included as deliverables that can be counted, what is excluded, the delivery time, the revision limit, the support terms and the acceptance criteria. Anything not written is not included.
2. **Price.** Take it from the approved price list for the package. For a fixed quote, list the assumptions behind it.
3. **Margin check.** Ask the Finance bot to run `price-floor` logic for services: customer payment, less contractor cost, software cost, advertising cost, refunds, payment fees and estimated delivery time cost (hours multiplied by the owner's delivery time cost rate). If the margin is under the owner's minimum, or the rate is not set, say so plainly in the request.
4. **Payment schedule.** Suggested: a deposit before work starts and the balance before final handover, unless the owner set another schedule.
5. **Discounts.** Never above the owner's maximum, and never offered before the owner approves it.
6. **Ask.** Sending a quotation is Level 2. Use `approval-request` with the full proposal. The customer's agreement is signed by the owner in person.

A request outside the agreed scope becomes a change request with its own price and timeline. Scope never grows silently.
