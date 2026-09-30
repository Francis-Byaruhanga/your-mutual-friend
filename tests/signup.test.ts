import { describe, expect, it } from 'vitest';
import { createHarness, signUp } from './harness.js';

describe('Step 1: welcome menu', () => {
  it('offers Sign Up, Claim and Check Details', async () => {
    const harness = createHarness();
    const { body, hop } = await harness.send('');

    expect(body.startsWith('CON ')).toBe(true);
    expect(body).toContain('1. Sign Up');
    expect(body).toContain('2. Claim');
    expect(body).toContain('3. Check Details');
    expect(hop).toBe('welcomeMenu');
  });

  it('re-prompts when the customer picks something unexpected', async () => {
    const harness = createHarness();
    await harness.send('');
    const { body } = await harness.send('9');

    expect(body).toContain('Invalid selection');
    expect(body).toContain('1. Sign Up');
  });
});

describe('Step 2: cover selection', () => {
  it('lists all three tiers with premium and benefit', async () => {
    const harness = createHarness();
    await harness.send('');
    const { body, hop } = await harness.send('1');

    expect(hop).toBe('coverSelect');
    expect(body).toContain('1. Gold - Save 10,000 per month');
    expect(body).toContain('2. Silver - Save 7,500 per month');
    expect(body).toContain('3. Bronze - Save 5,000 per month');
    expect(body).toContain('5,000,000 UGX');
    expect(body).toContain('3,500,000 UGX');
    expect(body).toContain('2,500,000 UGX');
  });

  it.each([
    ['1', 'GOLD', '10,000'],
    ['2', 'SILVER', '7,500'],
    ['3', 'BRONZE', '5,000'],
  ])('accepts tier %s and carries %s through to the policy', async (menuKey, tier, premium) => {
    const harness = createHarness();
    const final = await signUp(harness, { tier: menuKey as '1' | '2' | '3' });

    expect(final.body).toContain('Policy No:');
    const policy = harness.activePolicy();
    expect(policy?.tier).toBe(tier);
    expect(final.body).toContain(`Premium: ${premium} UGX per month`);
  });

  it('rejects an unknown tier and repeats the menu', async () => {
    const harness = createHarness();
    await harness.send('');
    await harness.send('1');
    const { body } = await harness.send('4');

    expect(body).toContain('Invalid selection');
    expect(body).toContain('1. Gold');
  });
});

describe('Step 3: confirm identity', () => {
  it('shows the captured name and surname', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('john');
    const { body, hop } = await harness.send('doe');

    expect(hop).toBe('confirmIdentity');
    expect(body).toContain('Confirm your details:');
    expect(body).toContain('Name: John');
    expect(body).toContain('Surname: Doe');
    expect(body).toContain('1. Correct');
    expect(body).toContain('2. Incorrect');
    expect(body).toContain('0. Back');
  });

  it('starts name capture again when the customer says the details are wrong', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('Doe');
    const { body, hop } = await harness.send('2');

    expect(hop).toBe('captureFirstName');
    expect(body).toContain('Enter your first name');
  });

  it('does not carry the rejected name forward', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('Doe');
    await harness.send('2');
    await harness.send('Peter');
    const { body } = await harness.send('Mwangi');

    expect(body).toContain('Name: Peter');
    expect(body).toContain('Surname: Mwangi');
  });

  it('re-prompts on an invalid selection', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('Doe');
    const { body } = await harness.send('7');

    expect(body).toContain('Invalid selection');
    expect(body).toContain('Name: John');
  });
});

describe('Step 4: date of birth', () => {
  /** Walks the journey up to and including the date of birth prompt. */
  async function reachDobPrompt() {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('Doe');
    const dobPrompt = await harness.send('1');
    return { harness, dobPrompt };
  }

  it('asks for the date in the National ID format', async () => {
    const { dobPrompt } = await reachDobPrompt();

    expect(dobPrompt.hop).toBe('captureDateOfBirth');
    expect(dobPrompt.body).toContain('date of birth as shown on your National ID');
    expect(dobPrompt.body).toContain('01.01.1999');
  });

  it.each([
    ['31.02.1990', 'That date does not exist'],
    ['1990-01-01', 'Date must be in the format dd.mm.yyyy'],
    ['1.1.90', 'Date must be in the format dd.mm.yyyy'],
    ['01.01.2030', 'cannot be in the future'],
    ['01.01.2015', 'at least 18 years old'],
    ['01.01.1950', 'up to age 65'],
  ])('rejects %s', async (value, expected) => {
    const { harness } = await reachDobPrompt();
    const { body } = await harness.send(value);

    expect(body).toContain(expected);
  });

  it('accepts a valid date and moves to verification', async () => {
    const { harness } = await reachDobPrompt();
    const { body, hop } = await harness.send('05.10.1988');

    expect(hop).toBe('verifyPolicy');
    expect(body).toContain('Date of Birth: 05.10.1988');
  });
});

describe('Step 5: verify and pay', () => {
  it('shows the full summary with the first installment', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('Doe');
    await harness.send('1');
    const { body, hop } = await harness.send('05.10.1988');

    expect(hop).toBe('verifyPolicy');
    expect(body).toContain('Name: John');
    expect(body).toContain('Surname: Doe');
    expect(body).toContain('Date of Birth: 05.10.1988');
    expect(body).toContain('Policy Cover: Gold');
    expect(body).toContain('1. Proceed to pay first installment');
    expect(body).toContain('2. Go Back');
  });

  it('prompts for the mobile money PIN when the customer proceeds', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('Doe');
    await harness.send('1');
    await harness.send('05.10.1988');
    const { body, hop } = await harness.send('1');

    expect(hop).toBe('mobileMoneyPin');
    expect(body).toContain('Mobile Money payment of 10,000 UGX');
  });

  it('returns to the cover menu when the customer goes back', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('Doe');
    await harness.send('1');
    await harness.send('05.10.1988');
    const { body, hop } = await harness.send('2');

    expect(hop).toBe('coverSelect');
    expect(body).toContain('Select a cover:');
  });

  it('issues a policy on payment and confirms with providers and terms', async () => {
    const harness = createHarness();
    const { body, hop } = await signUp(harness);

    expect(hop).toBe('purchaseComplete');
    expect(body.startsWith('END ')).toBe(true);
    expect(body).toContain('Congratulations!');
    expect(body).toContain('Hospitals:');
    expect(body).toContain('Pharmacies:');
    expect(body).toContain('Funeral:');
    expect(body).toContain('Terms and conditions: https://');
    expect(harness.policies()).toHaveLength(1);
  });

  it('generates a policy number in the documented format', async () => {
    const harness = createHarness();
    await signUp(harness, { tier: '2' });

    expect(harness.activePolicy()?.policyNumber).toMatch(/^YMF\/\d{4}\/SILVER\/\d{6}$/);
  });

  it('does not issue a policy when the customer cancels at the PIN screen', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('Doe');
    await harness.send('1');
    await harness.send('05.10.1988');
    await harness.send('1');
    const { body, hop } = await harness.send('0');

    expect(hop).toBe('paymentCancelled');
    expect(body).toContain('Payment cancelled');
    expect(harness.policies()).toHaveLength(0);
  });

  it('rejects a PIN that is not four to six digits', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('Doe');
    await harness.send('1');
    await harness.send('05.10.1988');
    await harness.send('1');
    const { body, hop } = await harness.send('12');

    expect(hop).toBe('mobileMoneyPinInvalid');
    expect(body).toContain('PIN must be 4 to 6 digits');
    expect(harness.policies()).toHaveLength(0);
  });

  it('never stores the PIN anywhere in the session', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('Doe');
    await harness.send('1');
    await harness.send('05.10.1988');
    await harness.send('1');
    await harness.send('987654');

    expect(JSON.stringify(harness.activePolicy())).not.toContain('987654');
  });
});

describe('0. Back', () => {
  it('returns to the main menu from the cover list', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    const { body, hop } = await harness.send('0');

    expect(hop).toBe('welcomeMenu');
    expect(body).toContain('1. Sign Up');
  });

  it('returns to the cover menu from the first name screen', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    const { body, hop } = await harness.send('0');

    expect(hop).toBe('coverSelect');
    expect(body).toContain('Select a cover:');
  });

  it('returns to the first name screen from the surname screen', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    const { body, hop } = await harness.send('0');

    expect(hop).toBe('captureFirstName');
    expect(body).toContain('Enter your first name');
  });

  it('lets the customer pick a different tier after going back', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('0');
    const afterBack = await harness.send('3');

    expect(afterBack.hop).toBe('captureFirstName');
    await harness.send('Ann');
    const confirmed = await harness.send('Aba');

    expect(confirmed.body).toContain('Name: Ann');
    expect(confirmed.body).toContain('Surname: Aba');
  });

  it('clears the abandoned name so a new one is captured', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('0');
    await harness.send('Peter');
    const { body } = await harness.send('Mwangi');

    expect(body).toContain('Name: Peter');
    expect(body).toContain('Surname: Mwangi');
    expect(body).not.toContain('John');
  });

  it('does not leave a stale date of birth when the tier changes', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    await harness.send('1');
    await harness.send('1');
    await harness.send('John');
    await harness.send('Doe');
    await harness.send('1');
    await harness.send('05.10.1988');
    await harness.send('2');
    await harness.send('3');
    await harness.send('Ann');
    await harness.send('Aba');
    await harness.send('1');
    const { body } = await harness.send('07.07.1991');

    expect(body).toContain('Policy Cover: Bronze');
    expect(body).toContain('Date of Birth: 07.07.1991');
    expect(body).not.toContain('05.10.1988');
  });
});

describe('session handling', () => {
  it('returns to the main menu for a new session id', async () => {
    const harness = createHarness();
    await harness.start().send('1');

    const fresh = createHarness('256700000009');
    const { body, hop } = await fresh.send('');

    expect(hop).toBe('welcomeMenu');
    expect(body).toContain('1. Sign Up');
  });

  it('sends a lost session back to the main menu rather than guessing', async () => {
    const harness = createHarness();

    const { body, hop } = await harness.dial('1*1*John');

    expect(hop).toBe('sessionExpired');
    expect(body.startsWith('END ')).toBe(true);
    expect(body).toContain('session has expired');
  });

  it('starts a fresh session after a terminal response', async () => {
    const harness = createHarness();
    const first = await harness.dial('3');

    expect(first.body).toContain('No active policy found');
    const second = await harness.send('');

    expect(second.body).toContain('Welcome to Your Mutual Friend');
  });
});

describe('sanitised output', () => {
  it('keeps special characters out of the screens', async () => {
    const harness = createHarness();
    const { body } = await signUp(harness);

    expect(body).not.toMatch(/[()“”‘’…—–]/);
  });
});
