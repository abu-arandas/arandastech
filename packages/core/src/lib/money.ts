/** Decimal places of each currency in use. The dinar has three: 1 JOD is 1,000 fils. */
export const CURRENCY_EXPONENT: Record<string, number> = { JOD: 3, USD: 2, EUR: 2 };

export interface Money {
  /** Whole number of the currency's smallest unit. */
  amount: number;
  currency: string;
}

export function exponentOf(currency: string): number {
  const exponent = CURRENCY_EXPONENT[currency];
  if (exponent === undefined) throw new Error(`unknown currency ${currency}`);
  return exponent;
}

export function assertMinor(amount: number, what = 'amount'): number {
  if (!Number.isSafeInteger(amount)) throw new Error(`${what} must be a whole number of minor units, got ${amount}`);
  return amount;
}

/** Parses a decimal string such as "24.99" or "12.500" into minor units, without floating point. */
export function toMinor(decimal: string, currency: string): number {
  const exponent = exponentOf(currency);
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(decimal.trim());
  if (!match) throw new Error(`not a decimal amount: ${decimal}`);
  const [, sign, whole = '0', fraction = ''] = match;
  if (fraction.length > exponent) throw new Error(`${currency} has ${exponent} decimal places, got ${decimal}`);
  const minor = Number(whole) * 10 ** exponent + Number(fraction.padEnd(exponent, '0') || '0');
  return assertMinor(sign ? -minor : minor);
}

/** "24.99" for 2499 USD, "12.500" for 12500 JOD. */
export function toDecimal(amount: number, currency: string): string {
  const exponent = exponentOf(currency);
  const sign = amount < 0 ? '-' : '';
  const digits = String(Math.abs(assertMinor(amount))).padStart(exponent + 1, '0');
  return exponent === 0 ? `${sign}${digits}` : `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

export function formatMoney(amount: number, currency: string): string {
  return `${toDecimal(amount, currency)} ${currency}`;
}

/** A share of an amount given in basis points (1% is 100), rounded half up to a whole minor unit. */
export function shareOf(amount: number, basisPoints: number): number {
  return Math.round((assertMinor(amount) * basisPoints) / 10_000);
}
