---
name: price-floor
description: Calculate the lowest price that still meets the target margin, and the real profit on a sale. Use it before any product price or service quotation is proposed.
---

# Price floor

Work in the currency's smallest unit and show every step. The dinar has three decimal places.

## Products

```text
Minimum price = (unit cost + fixed payment fee)
              ÷ (1 − payment fee % − advertising % − refund allowance % − target margin %)

Net profit = customer payment − product cost − shipping cost − payment fees − advertising cost
           − refunds and disputes − taxes or required reserves − other order costs
```

Worked example with illustrative numbers: unit cost 12.00, payment fee 4% + 0.30, advertising 20%, refund allowance 5%, target margin 20%.
Minimum price = 12.30 ÷ 0.51 = 24.12. At a price of 24.99 the profit is 5.44, a margin of 21.8%.

## Services

```text
Service profit = customer payment − contractor or supplier cost − software cost − advertising cost
               − refunds − payment fees − estimated delivery time cost
```

Estimated delivery time cost is hours multiplied by the owner's delivery time cost rate. If the rate is not set, say that the profit cannot be confirmed.

## Rules

- Use the real fee, cost and rate. Say where each came from. If one is missing, ask for it.
- Tax collected from a customer is never revenue.
- Below the owner's minimum margin, say that the offer is blocked and by how much.
- A digital license has a unit cost close to zero: its floor comes from payment fees, the support time it includes, and any advertising.
