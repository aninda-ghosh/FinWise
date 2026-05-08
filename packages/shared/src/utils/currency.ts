import type { Currency } from "../schemas/currency.schema";

const localeMap: Record<Currency, { locale: string; opts: Intl.NumberFormatOptions }> = {
  INR: { locale: "en-IN", opts: { style: "currency", currency: "INR", minimumFractionDigits: 0 } },
  USD: { locale: "en-US", opts: { style: "currency", currency: "USD", minimumFractionDigits: 2 } },
  SGD: { locale: "en-SG", opts: { style: "currency", currency: "SGD", minimumFractionDigits: 2 } },
  GBP: { locale: "en-GB", opts: { style: "currency", currency: "GBP", minimumFractionDigits: 2 } },
  EUR: { locale: "en-IE", opts: { style: "currency", currency: "EUR", minimumFractionDigits: 2 } },
  JPY: { locale: "ja-JP", opts: { style: "currency", currency: "JPY", minimumFractionDigits: 0 } },
  NTD: { locale: "zh-TW", opts: { style: "currency", currency: "TWD", minimumFractionDigits: 0 } },
};

// Display an amount in its native currency (e.g. "$1,234.56", "S$1,234", "₹1,23,456")
export function formatCurrency(amount: number, currency: Currency): string {
  const { locale, opts } = localeMap[currency];
  return new Intl.NumberFormat(locale, opts).format(amount);
}

// Always format a value that is already in INR (for totals / net worth)
export function formatINR(amount: number): string {
  return formatCurrency(amount, "INR");
}

// Convert a native-currency amount to INR using the latest rates map
export function convertToINR(
  amount: number,
  currency: Currency,
  rates: Record<string, number> // { USD: 83.5, SGD: 62.0, NTD: 2.6 }
): number {
  if (currency === "INR") return amount;
  const rate = rates[currency];
  if (!rate) throw new Error(`No exchange rate available for ${currency}`);
  return amount * rate;
}

// Convert an INR amount to a target currency using stored rates
export function convertFromINR(
  amountInr: number,
  targetCurrency: Currency,
  rates: Record<string, number>
): number {
  if (targetCurrency === "INR") return amountInr;
  const rate = rates[targetCurrency];
  if (!rate) return amountInr; // fallback: show as-is if rate missing
  return amountInr / rate;
}
