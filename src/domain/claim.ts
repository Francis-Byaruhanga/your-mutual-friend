import { randomInt } from 'node:crypto';
import type { Policy } from './policy.js';
import { formatPhone } from './policy.js';

export type ClaimStatus = 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

export interface Claim {
  readonly reference: string;
  /** The service ticket number supplied by the customer, e.g. HOSP-KLA-4471. */
  readonly ticketNumber: string;
  readonly phoneNumber: string;
  readonly policyNumber: string;
  readonly submittedAt: Date;
  readonly status: ClaimStatus;
}

export function generateClaimReference(submittedAt: Date): string {
  const year = submittedAt.getFullYear();
  return `CLM/${year}/${String(randomInt(1, 1_000_000)).padStart(6, '0')}`;
}

export function submitClaim(input: {
  ticketNumber: string;
  phoneNumber: string;
  policy: Policy;
  submittedAt?: Date;
}): Claim {
  const submittedAt = input.submittedAt ?? new Date();
  return {
    reference: generateClaimReference(submittedAt),
    ticketNumber: input.ticketNumber,
    phoneNumber: input.phoneNumber,
    policyNumber: input.policy.policyNumber,
    submittedAt,
    status: 'SUBMITTED',
  };
}

export function describeClaimRecipient(claim: Claim, policy: Policy): string {
  return `${policy.holder.firstName} ${policy.holder.surname} on ${formatPhone(claim.phoneNumber)}`;
}
