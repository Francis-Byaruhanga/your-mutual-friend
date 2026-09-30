import { describe, expect, it } from 'vitest';
import { createHarness, signUp } from './harness.js';

describe('Step 1 option 3: check details', () => {
  it('tells a customer with no policy how to get covered', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    const { body, hop } = await harness.send('3');

    expect(hop).toBe('detailsNoPolicy');
    expect(body.startsWith('END ')).toBe(true);
    expect(body).toContain('No active policy found');
    expect(body).toContain('Sign Up');
  });

  it('shows name, date of birth, policy number, type and tenure', async () => {
    const harness = createHarness();
    await signUp(harness);
    harness.start();
    await harness.send('');
    const { body, hop } = await harness.send('3');

    expect(hop).toBe('policyDetails');
    expect(body).toContain('Name: John');
    expect(body).toContain('Surname: Doe');
    expect(body).toContain('Date of Birth: 05.10.1988');
    expect(body).toMatch(/Policy No: YMF\/\d{4}\/GOLD\/\d{6}/);
    expect(body).toContain('Policy Type: Gold');
    expect(body).toContain('Policy Tenure: Less than 1 month');
    expect(body).toContain('Status: ACTIVE');
  });

  it('reports the benefit ceiling for the tier', async () => {
    const harness = createHarness();
    await signUp(harness, { tier: '3' });
    harness.start();
    await harness.send('');
    const { body } = await harness.send('3');

    expect(body).toContain('Policy Type: Bronze');
    expect(body).toContain('Benefit: up to 2,500,000 UGX');
  });

  it('shows a day count for a policy less than a month old', async () => {
    const harness = createHarness();
    await signUp(harness);
    harness.travelTo(new Date('2026-03-25T09:30:00.000Z'));
    const { body } = await harness.dial('3');

    expect(body).toContain('Policy Tenure: 10 days');
  });

  it('shows a month count for a policy over a month old', async () => {
    const harness = createHarness();
    await signUp(harness);
    harness.travelTo(new Date('2026-05-14T09:30:00.000Z'));
    const { body } = await harness.dial('3');

    expect(body).toContain('Policy Tenure: 2 months');
  });
});

describe('Step 1 option 2: claim', () => {
  it('tells a customer with no policy to sign up first', async () => {
    const harness = createHarness();
    harness.start();
    await harness.send('');
    const { body, hop } = await harness.send('2');

    expect(hop).toBe('claimNoPolicy');
    expect(body).toContain('No active policy found');
  });

  it('confirms the customer details before asking for a ticket', async () => {
    const harness = createHarness();
    await signUp(harness, { firstName: 'Mary', surname: 'Nambowa' });
    harness.start();
    await harness.send('');
    const { body, hop } = await harness.send('2');

    expect(hop).toBe('claimConfirm');
    expect(body).toContain('Confirm Details');
    expect(body).toContain('Name: Mary');
    expect(body).toContain('Surname: Nambowa');
    expect(body).toContain('Date of Birth: 05.10.1988');
    expect(body).toContain('Policy Cover: Gold');
    expect(body).toContain('1. Continue');
  });

  it('asks for the service ticket number after confirming', async () => {
    const harness = createHarness();
    await signUp(harness);
    harness.start();
    await harness.send('');
    await harness.send('2');
    const { body, hop } = await harness.send('1');

    expect(hop).toBe('captureTicketNumber');
    expect(body).toContain('service ticket number');
  });

  it('acknowledges the submission with a reference', async () => {
    const harness = createHarness();
    await signUp(harness);
    harness.start();
    await harness.send('');
    await harness.send('2');
    await harness.send('1');
    const { body, hop } = await harness.send('HOSP-KLA-4471');

    expect(hop).toBe('claimSubmitted');
    expect(body.startsWith('END ')).toBe(true);
    expect(body).toContain('Congratulations! Your Claim has been submitted');
    expect(body).toContain('Ticket: HOSP-KLA-4471');
    expect(body).toMatch(/Claim reference: CLM\/\d{4}\/\d{6}/);
  });

  it('rejects a ticket number that is too short', async () => {
    const harness = createHarness();
    await signUp(harness);
    harness.start();
    await harness.send('');
    await harness.send('2');
    await harness.send('1');
    const { body, hop } = await harness.send('AB1');

    expect(hop).toBe('captureTicketNumberInvalid');
    expect(body).toContain('5 to 20 letters or digits');
  });

  it('flags a ticket number that has already been submitted', async () => {
    const harness = createHarness();
    await signUp(harness);
    harness.start();
    await harness.send('');
    await harness.send('2');
    await harness.send('1');
    await harness.send('HOSP-KLA-4471');

    harness.start();
    await harness.send('');
    await harness.send('2');
    await harness.send('1');
    const { body, hop } = await harness.send('HOSP-KLA-4471');

    expect(hop).toBe('claimDuplicate');
    expect(body).toContain('already submitted');
  });

  it('returns to the main menu when the customer goes back from confirm', async () => {
    const harness = createHarness();
    await signUp(harness);
    harness.start();
    await harness.send('');
    await harness.send('2');
    const { body, hop } = await harness.send('2');

    expect(hop).toBe('welcomeMenu');
    expect(body).toContain('Welcome to Your Mutual Friend');
  });

  it('goes back to the claim confirmation from the ticket screen', async () => {
    const harness = createHarness();
    await signUp(harness);
    harness.start();
    await harness.send('');
    await harness.send('2');
    await harness.send('1');
    const { body, hop } = await harness.send('0');

    expect(hop).toBe('claimConfirm');
    expect(body).toContain('Confirm Details');
  });
});
