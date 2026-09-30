import request from 'supertest';
import { type App, createApp } from '../src/app.js';
import type { Policy } from '../src/domain/policy.js';
import { createSessionStore } from '../src/ussd/session.js';

export const TEST_PHONE = '256700000001';
export const FIXED_NOW = new Date('2026-03-15T09:30:00.000Z');

export interface HopResult {
  readonly body: string;
  readonly hop: string;
}

/**
 * A thin driver around the real Express app that speaks the exact wire format
 * Africa's Talking uses, so tests exercise the same code path the sandbox does.
 */
export class UssdHarness {
  private accumulated = '';

  constructor(
    private readonly app: App,
    private readonly clock: { current: Date },
    readonly sessionId = 'test-session',
    readonly phoneNumber = TEST_PHONE,
  ) {}

  static create(phoneNumber = TEST_PHONE, now: Date = FIXED_NOW): UssdHarness {
    const clock = { current: now };
    const app = createApp({ store: createSessionStore(), now: () => clock.current });
    return new UssdHarness(app, clock, 'test-session', phoneNumber);
  }

  /** Moves the app's clock forward, for exercising tenure and date logic. */
  travelTo(when: Date): this {
    this.clock.current = when;
    return this.start();
  }

  /** Starts a brand new session, as if the customer had just dialled the code. */
  start(): this {
    this.accumulated = '';
    return this;
  }

  /** Feeds one customer input, appended to the history exactly as AT does. */
  async send(input: string): Promise<HopResult> {
    this.accumulated = this.accumulated === '' ? input : `${this.accumulated}*${input}`;
    return this.post(this.accumulated);
  }

  /** Sends an input on a brand new session, skipping the initial empty hop. */
  async dial(input: string): Promise<HopResult> {
    this.accumulated = input;
    return this.post(input);
  }

  /**
   * Re-sends the accumulated text unchanged, which is how a real handset sees a
   * screen redisplay. It is not the same as sending an empty input.
   */
  async refresh(): Promise<HopResult> {
    return this.post(this.accumulated);
  }

  private async post(text: string): Promise<HopResult> {
    const response = await request(this.app.app).post('/ussd').type('form').send({
      sessionId: this.sessionId,
      serviceCode: '123',
      phoneNumber: this.phoneNumber,
      networkCode: '64101',
      text,
    });

    const body: string = response.text;
    if (body.startsWith('END ')) {
      this.accumulated = '';
    }
    return { body, hop: response.headers['at-ussd-hop-metadata'] ?? '' };
  }

  policies(): Policy[] {
    return this.app.repositories.policies.findAllByPhone(this.phoneNumber);
  }

  activePolicy(): Policy | undefined {
    return this.app.repositories.policies.findActiveByPhone(this.phoneNumber);
  }
}

export function createHarness(phoneNumber = TEST_PHONE, now: Date = FIXED_NOW): UssdHarness {
  return UssdHarness.create(phoneNumber, now);
}

/** Drives a complete sign up and returns the final screen. */
export async function signUp(
  harness: UssdHarness,
  options: {
    tier?: '1' | '2' | '3';
    firstName?: string;
    surname?: string;
    dateOfBirth?: string;
    pin?: string;
  } = {},
): Promise<HopResult> {
  const {
    tier = '1',
    firstName = 'John',
    surname = 'Doe',
    dateOfBirth = '05.10.1988',
    pin = '1234',
  } = options;

  harness.start();
  await harness.send('');
  await harness.send('1');
  await harness.send(tier);
  await harness.send(firstName);
  await harness.send(surname);
  await harness.send('1');
  await harness.send(dateOfBirth);
  await harness.send('1');
  return harness.send(pin);
}
