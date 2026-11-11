---
name: money-status
description: Report what money the company really has, per currency, as pending, settled, reserved, available and profit. Use it for any question about revenue, profit, what can be spent, or a reinvestment.
---

# Money status

Never mix these four: a sale, a pending payment, a settled payment and profit.

Per currency, and separately for services and for commerce, work down this order:

```text
  Settled balance
− supplier obligations            what is owed for orders already taken
− taxes                           tax collected from customers, plus the tax reserve
− refund and dispute reserve      held for as long as customers can still claim
= Available cash
− operating costs                 hosting, tools and subscriptions due, plus the operating buffer
= Confirmed net profit
× reinvestment share              set by the owner
= Approved reinvestment budget
```

Then give one status:

| Status | When |
|---|---|
| Not safe to spend | Revenue is pending, obligations exceed available funds, or reserves are insufficient |
| Limited reinvestment available | Settled profit exists, but only a defined amount may be used |
| Safe to consider upgrade | Reserves and obligations are covered, and the owner may review a specific proposal |

Rules:

- Use the payment provider's records as the reference. Say which records you read and for which period.
- If you cannot see a figure, write "not available". Never estimate it.
- You are not an accountant. Tax and legal questions go to a qualified professional.
