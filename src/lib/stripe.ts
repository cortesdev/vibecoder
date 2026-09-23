import Stripe from "stripe";
import { keySetFor, type StripeMode } from "./env";

export function getStripe(mode: StripeMode): Stripe | null {
  const set = keySetFor(mode);
  if (!set.secretKey) return null;
  return new Stripe(set.secretKey);
}

export const PRO_PRICE_USD = 4900; // one-time, shown on the page and enforced by the Price ID
