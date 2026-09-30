import type { Claim } from './claim.js';
import type { Policy } from './policy.js';

/**
 * Persistence boundary for the prototype. Everything above this interface is
 * unaware of where policies live, so swapping the in-memory map for SQLite or
 * Postgres later is a matter of supplying another implementation.
 */
export interface PolicyRepository {
  save(policy: Policy): Policy;
  findActiveByPhone(phoneNumber: string): Policy | undefined;
  findByPolicyNumber(policyNumber: string): Policy | undefined;
  findAllByPhone(phoneNumber: string): Policy[];
}

export interface ClaimRepository {
  save(claim: Claim): Claim;
  findByTicketNumber(ticketNumber: string): Claim | undefined;
  listByPhone(phoneNumber: string): Claim[];
}

export class InMemoryPolicyRepository implements PolicyRepository {
  private readonly byPolicyNumber = new Map<string, Policy>();
  private readonly byPhone = new Map<string, Set<string>>();

  save(policy: Policy): Policy {
    this.byPolicyNumber.set(policy.policyNumber, policy);
    const existing = this.byPhone.get(policy.holder.phoneNumber) ?? new Set<string>();
    existing.add(policy.policyNumber);
    this.byPhone.set(policy.holder.phoneNumber, existing);
    return policy;
  }

  findActiveByPhone(phoneNumber: string): Policy | undefined {
    return this.findAllByPhone(phoneNumber).find((policy) => policy.status === 'ACTIVE');
  }

  findByPolicyNumber(policyNumber: string): Policy | undefined {
    return this.byPolicyNumber.get(policyNumber);
  }

  findAllByPhone(phoneNumber: string): Policy[] {
    const keys = this.byPhone.get(phoneNumber);
    if (!keys) {
      return [];
    }
    return [...keys]
      .map((key) => this.byPolicyNumber.get(key))
      .filter((policy): policy is Policy => policy !== undefined);
  }
}

export class InMemoryClaimRepository implements ClaimRepository {
  private readonly byTicketNumber = new Map<string, Claim>();
  private readonly byPhone = new Map<string, Set<string>>();

  save(claim: Claim): Claim {
    this.byTicketNumber.set(claim.ticketNumber, claim);
    const existing = this.byPhone.get(claim.phoneNumber) ?? new Set<string>();
    existing.add(claim.ticketNumber);
    this.byPhone.set(claim.phoneNumber, existing);
    return claim;
  }

  findByTicketNumber(ticketNumber: string): Claim | undefined {
    return this.byTicketNumber.get(ticketNumber);
  }

  listByPhone(phoneNumber: string): Claim[] {
    const keys = this.byPhone.get(phoneNumber);
    if (!keys) {
      return [];
    }
    return [...keys]
      .map((key) => this.byTicketNumber.get(key))
      .filter((claim): claim is Claim => claim !== undefined);
  }
}

export interface Repositories {
  readonly policies: PolicyRepository;
  readonly claims: ClaimRepository;
}

export function createRepositories(): Repositories {
  return {
    policies: new InMemoryPolicyRepository(),
    claims: new InMemoryClaimRepository(),
  };
}
