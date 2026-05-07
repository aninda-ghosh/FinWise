import { z } from "zod";

export const CurrencyEnum = z.enum([
  "INR", "USD", "SGD", "GBP", "EUR", "AUD", "JPY", "TWD", "HKD", "CAD", "NTD",
]);
export type Currency = z.infer<typeof CurrencyEnum>;

export const SUPPORTED_CURRENCIES: Currency[] = [
  "INR", "USD", "SGD", "GBP", "EUR", "AUD", "JPY", "TWD", "HKD", "CAD", "NTD",
];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  INR: "₹", USD: "$", SGD: "S$", GBP: "£", EUR: "€",
  AUD: "A$", JPY: "¥", TWD: "NT$", HKD: "HK$", CAD: "CA$", NTD: "NT$",
};
