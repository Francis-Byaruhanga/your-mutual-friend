import { randomInt } from 'node:crypto';
import type { Product, Tier } from './products.js';

export type PolicyStatus = 'ACTIVE' | 'CANCELLED';

export interface Policyholder {
  readonly firstName: string;
  readonly surname: string;
  /** ISO date, e.g. 1988-10-05 */
  readonly dateOfBirth: string;
  /** Customer's phone number in the format Africa's Talking sends it. */
  readonly phoneNumber: string;
}

export interface Policy {
  readonly policyNumber: string;
  readonly holder: Policyholder;
  readonly tier: Tier;
  readonly status: PolicyStatus;
  readonly issuedAt: Date;
  /** First premium paid at the point of sale. */
  readonly firstInstallment: number;
  /** Number of installments collected so far. */
  readonly installmentsPaid: number;
}

export const POLICY_NUMBER_PREFIX = 'YMF';

/**
 * Builds a human readable policy number, e.g. YMF/2026/GOLD/014829.
 * The sequence is randomised rather than sequential so that policy numbers are
 * not guessable over an unauthenticated USSD channel.
 */
export function generatePolicyNumber(tier: Tier, issuedAt: Date): string {
  const year = issuedAt.getFullYear();
  const sequence = String(randomInt(1, 1_000_000)).padStart(6, '0');
  return `${POLICY_NUMBER_PREFIX}/${year}/${tier}/${sequence}`;
}

export function issuePolicy(input: {
  holder: Policyholder;
  product: Product;
  issuedAt?: Date;
  policyNumber?: string;
}): Policy {
  const issuedAt = input.issuedAt ?? new Date();
  return {
    policyNumber: input.policyNumber ?? generatePolicyNumber(input.product.tier, issuedAt),
    holder: input.holder,
    tier: input.product.tier,
    status: 'ACTIVE',
    issuedAt,
    firstInstallment: input.product.monthlyPremium,
    installmentsPaid: 1,
  };
}

export interface Tenure {
  readonly days: number;
  readonly months: number;
  /** Pre-formatted for the USSD screen, e.g. "3 months" or "14 days". */
  readonly label: string;
}

/** Months elapsed since a policy was issued, with a day-granular fallback. */
export function calculateTenure(policy: Policy, now: Date = new Date()): Tenure {
  const elapsedMs = now.getTime() - policy.issuedAt.getTime();
  const days = Math.max(0, Math.floor(elapsedMs / 86_400_000));
  const months = Math.floor(days / 30);

  if (months < 1) {
    return { days, months, label: days === 0 ? 'Less than 1 month' : `${days} days` };
  }
  return { days, months, label: `${months} months` };
}

/**
 * Africa’s Talking sends numbers as 07xxxxxxxx, 2567xxxxxxxx or +2567xxxxxxxx.
 * All three render badly on a USSD handset, so everything is normalised to the
 * local 10 digit form.
 */
export function formatPhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '').replace(/^256/, '');
  return digits.replace(/^0+/, '');
}

/** 10000 -> "10,000". USSD terminals handle commas, but not currency symbols. */
export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-US');
}
