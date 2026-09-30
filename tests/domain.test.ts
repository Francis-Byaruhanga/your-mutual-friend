import { describe, expect, it } from 'vitest';
import { calculateTenure, formatAmount, formatPhone, issuePolicy } from '../src/domain/policy.js';
import { getProduct, getProductByMenuKey, PRODUCT_LIST } from '../src/domain/products.js';
import { InMemoryClaimRepository, InMemoryPolicyRepository } from '../src/domain/repository.js';
import {
  ageInYears,
  formatDateOfBirth,
  parseDateOfBirth,
  parseName,
  parseTicketNumber,
} from '../src/domain/validation.js';
import { con, end, sanitise } from '../src/ussd/reply.js';
import { parseText, pruneAbandonedData } from '../src/ussd/router.js';

const NOW = new Date('2026-03-15T09:30:00.000Z');

describe('products', () => {
  it('matches the pricing in the brief', () => {
    expect(getProduct('GOLD').monthlyPremium).toBe(10_000);
    expect(getProduct('GOLD').annualBenefit).toBe(5_000_000);
    expect(getProduct('SILVER').monthlyPremium).toBe(7_500);
    expect(getProduct('SILVER').annualBenefit).toBe(3_500_000);
    expect(getProduct('BRONZE').monthlyPremium).toBe(5_000);
    expect(getProduct('BRONZE').annualBenefit).toBe(2_500_000);
  });

  it('gives each tier a unique menu key', () => {
    const keys = PRODUCT_LIST.map((product) => product.menuKey);
    expect(new Set(keys).size).toBe(3);
  });

  it('looks a product up by menu key', () => {
    expect(getProductByMenuKey('1')?.tier).toBe('GOLD');
    expect(getProductByMenuKey(' 3 ')?.tier).toBe('BRONZE');
    expect(getProductByMenuKey('9')).toBeUndefined();
  });
});

describe('policy', () => {
  const policy = issuePolicy({
    holder: {
      firstName: 'John',
      surname: 'Doe',
      dateOfBirth: '1988-10-05T00:00:00.000Z',
      phoneNumber: '256700000001',
    },
    product: getProduct('GOLD'),
    issuedAt: NOW,
  });

  it('records the first installment against the monthly premium', () => {
    expect(policy.firstInstallment).toBe(10_000);
    expect(policy.installmentsPaid).toBe(1);
    expect(policy.status).toBe('ACTIVE');
  });

  it('generates a policy number in the YMF format', () => {
    expect(policy.policyNumber).toMatch(/^YMF\/2026\/GOLD\/\d{6}$/);
  });

  it('does not repeat policy numbers', () => {
    const numbers = new Set(
      Array.from(
        { length: 200 },
        () =>
          issuePolicy({
            holder: policy.holder,
            product: getProduct('GOLD'),
            issuedAt: NOW,
          }).policyNumber,
      ),
    );
    expect(numbers.size).toBe(200);
  });

  it('reports tenure in days under a month', () => {
    expect(calculateTenure(policy, new Date('2026-03-25T09:30:00.000Z')).label).toBe('10 days');
  });

  it('reports tenure in months over a month', () => {
    expect(calculateTenure(policy, new Date('2026-05-14T09:30:00.000Z')).label).toBe('2 months');
  });

  it('reports a brand new policy as under a month', () => {
    expect(calculateTenure(policy, NOW).label).toBe('Less than 1 month');
  });

  it('strips the leading zero from phone numbers for display', () => {
    expect(formatPhone('0772123456')).toBe('772123456');
    expect(formatPhone('+256772123456')).toBe('772123456');
  });

  it('formats amounts with thousands separators', () => {
    expect(formatAmount(10_000)).toBe('10,000');
    expect(formatAmount(2_500_000)).toBe('2,500,000');
  });
});

describe('validation', () => {
  it('parses a valid date of birth in the National ID format', () => {
    const result = parseDateOfBirth('05.10.1988', NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(formatDateOfBirth(result.value)).toBe('05.10.1988');
    }
  });

  it.each([['05/10/1988'], ['1988-10-05'], ['5.10.1988'], ['05.10.88'], ['abc']])(
    'rejects %s',
    (value) => {
      expect(parseDateOfBirth(value, NOW).ok).toBe(false);
    },
  );

  it.each(['31.02.1990', '01.13.1990', '00.01.1990', '01.00.1990'])(
    'rejects the impossible date %s',
    (value) => {
      const result = parseDateOfBirth(value, NOW);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('does not exist');
      }
    },
  );

  it('accepts a leap day in a leap year', () => {
    expect(parseDateOfBirth('29.02.1996', NOW).ok).toBe(true);
  });

  it('rejects a leap day in a non leap year', () => {
    expect(parseDateOfBirth('29.02.1995', NOW).ok).toBe(false);
  });

  it('enforces the eligible age range', () => {
    expect(parseDateOfBirth('01.01.2015', NOW).ok).toBe(false);
    expect(parseDateOfBirth('01.01.1950', NOW).ok).toBe(false);
    expect(parseDateOfBirth('01.01.1990', NOW).ok).toBe(true);
  });

  it('calculates age around a birthday boundary', () => {
    const beforeBirthday = new Date('2026-06-14T00:00:00.000Z');
    const onBirthday = new Date('2026-06-15T00:00:00.000Z');

    expect(ageInYears(new Date('2008-06-15T00:00:00.000Z'), beforeBirthday)).toBe(17);
    expect(ageInYears(new Date('2008-06-15T00:00:00.000Z'), onBirthday)).toBe(18);
  });

  it('normalises the case of names', () => {
    const result = parseName('jOhN', 'First name');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('John');
    }
  });

  it('rejects names with digits or punctuation', () => {
    expect(parseName('John2', 'First name').ok).toBe(false);
    expect(parseName('J', 'First name').ok).toBe(false);
    expect(parseName('   ', 'First name').ok).toBe(false);
  });

  it('accepts a hyphenated or apostrophised surname', () => {
    expect(parseName("O'Brien", 'Surname').ok).toBe(true);
    expect(parseName('Smith-Jones', 'Surname').ok).toBe(true);
  });

  it('normalises ticket numbers to upper case', () => {
    const result = parseTicketNumber('hosp-kla-4471');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('HOSP-KLA-4471');
    }
  });

  it('rejects ticket numbers outside the allowed length', () => {
    expect(parseTicketNumber('AB1').ok).toBe(false);
    expect(parseTicketNumber('A'.repeat(21)).ok).toBe(false);
    expect(parseTicketNumber('AB123').ok).toBe(true);
  });
});

describe('repositories', () => {
  const policy = issuePolicy({
    holder: {
      firstName: 'John',
      surname: 'Doe',
      dateOfBirth: '1988-10-05T00:00:00.000Z',
      phoneNumber: '256700000001',
    },
    product: getProduct('GOLD'),
    issuedAt: NOW,
  });

  it('finds a policy by phone number and by policy number', () => {
    const repository = new InMemoryPolicyRepository();
    repository.save(policy);

    expect(repository.findActiveByPhone('256700000001')).toEqual(policy);
    expect(repository.findByPolicyNumber(policy.policyNumber)).toEqual(policy);
  });

  it('returns undefined for an unknown phone number', () => {
    const repository = new InMemoryPolicyRepository();

    expect(repository.findActiveByPhone('256700000099')).toBeUndefined();
  });

  it('ignores a cancelled policy when looking for the active one', () => {
    const repository = new InMemoryPolicyRepository();
    repository.save({ ...policy, status: 'CANCELLED' });

    expect(repository.findActiveByPhone('256700000001')).toBeUndefined();
    expect(repository.findAllByPhone('256700000001')).toHaveLength(1);
  });

  it('stores claims by ticket number and by phone', () => {
    const repository = new InMemoryClaimRepository();
    repository.save({
      reference: 'CLM/2026/000001',
      ticketNumber: 'HOSP-1',
      phoneNumber: '256700000001',
      policyNumber: policy.policyNumber,
      submittedAt: NOW,
      status: 'SUBMITTED',
    });

    expect(repository.findByTicketNumber('HOSP-1')?.reference).toBe('CLM/2026/000001');
    expect(repository.listByPhone('256700000001')).toHaveLength(1);
  });
});

describe('reply helpers', () => {
  it('prefixes continuing and terminal responses correctly', () => {
    expect(con('Pick one', 'hop').body).toBe('CON Pick one');
    expect(end('All done', 'hop').body).toBe('END All done');
  });

  it('flags terminal responses', () => {
    expect(con('a', 'h').isTerminal).toBe(false);
    expect(end('a', 'h').isTerminal).toBe(true);
  });

  it('strips characters telcos cannot render', () => {
    const cleaned = sanitise('Cover (Gold) — save 10,000… “now”');

    expect(cleaned).toBe('Cover Gold - save 10,000... "now"');
  });

  it('trims trailing whitespace on every line', () => {
    expect(sanitise('one   \ntwo')).toBe('one\ntwo');
  });
});

describe('input parsing', () => {
  it('splits the accumulated text on asterisks', () => {
    expect(parseText('1*1*John')).toEqual(['1', '1', 'John']);
  });

  it('treats an empty first hop as no input', () => {
    expect(parseText('')).toEqual([]);
  });

  it('drops empty segments from stray asterisks', () => {
    expect(parseText('1**2*')).toEqual(['1', '2']);
  });

  it('trims whitespace around each segment', () => {
    expect(parseText('1 * 1')).toEqual(['1', '1']);
  });
});

describe('abandoned session data', () => {
  it('drops the tier and date of birth when rewinding to the cover menu', () => {
    const pruned = pruneAbandonedData(
      { tier: 'GOLD', firstName: 'John', dateOfBirthIso: 'x', dateOfBirthLabel: '05.10.1988' },
      'signup.cover',
    );

    expect(pruned).toEqual({ firstName: 'John' });
  });

  it('keeps the cover when rewinding only to the first name', () => {
    const pruned = pruneAbandonedData({ tier: 'GOLD', surname: 'Doe' }, 'signup.firstName');

    expect(pruned).toEqual({ tier: 'GOLD' });
  });

  it('clears everything when rewinding to the main menu', () => {
    const pruned = pruneAbandonedData({ tier: 'GOLD', firstName: 'John', surname: 'Doe' }, 'root');

    expect(pruned).toEqual({});
  });
});
