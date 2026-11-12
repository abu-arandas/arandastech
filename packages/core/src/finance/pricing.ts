import { assertMinor, shareOf } from '../lib/money';

/** What a sale costs, with every share in basis points (1% is 100). Amounts are whole minor units. */
export interface PriceInputs {
  /** Product plus shipping plus other costs of one order. */
  unitCostMinor: number;
  fixedFeeMinor: number;
  feeBps: number;
  advertisingBps: number;
  refundBps: number;
}

export interface SaleProfit {
  price: number;
  unitCost: number;
  fee: number;
  advertising: number;
  refundAllowance: number;
  profit: number;
  /** Net margin in basis points, rounded down. */
  marginBps: number;
}

/**
 * The lowest price that still meets the target margin (blueprint 6.1):
 *   (unit cost + fixed fee) / (1 - fee % - advertising % - refund allowance % - target margin %)
 * rounded up to a whole minor unit. Returns null when the shares leave nothing to divide by.
 */
export function minimumPrice(inputs: PriceInputs, targetMarginBps: number): number | null {
  const remaining = 10_000 - inputs.feeBps - inputs.advertisingBps - inputs.refundBps - targetMarginBps;
  if (remaining <= 0) return null;
  return Math.ceil(((assertMinor(inputs.unitCostMinor) + assertMinor(inputs.fixedFeeMinor)) * 10_000) / remaining);
}

/** The real profit on one sale at a given price. */
export function saleProfit(priceMinor: number, inputs: PriceInputs): SaleProfit {
  const price = assertMinor(priceMinor, 'price');
  const fee = shareOf(price, inputs.feeBps) + inputs.fixedFeeMinor;
  const advertising = shareOf(price, inputs.advertisingBps);
  const refundAllowance = shareOf(price, inputs.refundBps);
  const profit = price - inputs.unitCostMinor - fee - advertising - refundAllowance;
  return { price, unitCost: inputs.unitCostMinor, fee, advertising, refundAllowance, profit, marginBps: price > 0 ? Math.floor((profit * 10_000) / price) : 0 };
}

/**
 * Service profit (blueprint 6.1). Delivery time is costed at the owner's rate. When the rate is not set the profit
 * cannot be confirmed, and the result says so instead of pretending the time was free.
 */
export function serviceProfit(input: {
  paymentMinor: number;
  contractorMinor: number;
  softwareMinor: number;
  advertisingMinor: number;
  refundsMinor: number;
  feesMinor: number;
  deliveryHours: number;
  hourlyRateMinor: number | null;
}): { profit: number | null; marginBps: number | null; deliveryCost: number | null; confirmed: boolean } {
  if (input.hourlyRateMinor === null) return { profit: null, marginBps: null, deliveryCost: null, confirmed: false };
  const deliveryCost = Math.round(input.deliveryHours * input.hourlyRateMinor);
  const profit = input.paymentMinor - input.contractorMinor - input.softwareMinor - input.advertisingMinor - input.refundsMinor - input.feesMinor - deliveryCost;
  return { profit, marginBps: input.paymentMinor > 0 ? Math.floor((profit * 10_000) / input.paymentMinor) : 0, deliveryCost, confirmed: true };
}
