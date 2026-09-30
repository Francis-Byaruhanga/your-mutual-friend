/**
 * Drives the USSD journey from the terminal, without the Africa's Talking web
 * simulator. Useful for checking copy and menu flow.
 *
 *   pnpm dev &                             point it at the running server
 *   pnpm simulate                          interactive, prompts for each input
 *   pnpm simulate 1 1 John Doe 1 05.10.1988 1 1234    scripted sign up
 *   pnpm simulate 3                        scripted check details
 */

import type { Server } from 'node:http';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';

const PHONE = process.env.SIMULATE_PHONE ?? '256700000001';
const SESSION = process.env.SIMULATE_SESSION ?? `sim-${Date.now()}`;
const BASE_URL = `http://localhost:${config.PORT}`;

interface Hop {
  readonly body: string;
  readonly hop: string;
  readonly isTerminal: boolean;
}

/** Speaks the exact wire format Africa's Talking uses. */
async function post(text: string): Promise<Hop> {
  const response = await fetch(`${BASE_URL}/ussd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      sessionId: SESSION,
      serviceCode: config.AT_SHORTCODE || '123',
      phoneNumber: PHONE,
      networkCode: '64101',
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Server replied ${response.status}. Is the app running on port ${config.PORT}?`,
    );
  }

  const body = (await response.text()).trim();
  return {
    body,
    hop: response.headers.get('at-ussd-hop-metadata') ?? '',
    isTerminal: body.startsWith('END '),
  };
}

function render({ body, hop, isTerminal }: Hop): void {
  const kind = isTerminal ? 'END' : 'CON';
  stdout.write(`\n\x1b[36m[${hop}] ${kind}\x1b[0m\n${body}\n`);
}

async function runScripted(inputs: readonly string[]): Promise<void> {
  let accumulated = '';
  let hop = await post(accumulated);
  render(hop);

  for (const input of inputs) {
    if (hop.isTerminal) {
      break;
    }
    accumulated = accumulated === '' ? input : `${accumulated}*${input}`;
    hop = await post(accumulated);
    render(hop);
  }
}

async function runInteractive(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    let accumulated = '';
    let hop = await post(accumulated);
    render(hop);

    while (!hop.isTerminal) {
      const answer = (await rl.question('\n> ')).trim();
      if (answer === 'quit' || answer === 'exit') {
        break;
      }
      accumulated = accumulated === '' ? answer : `${accumulated}*${answer}`;
      hop = await post(accumulated);
      render(hop);
    }
  } finally {
    rl.close();
  }
}

/**
 * Uses the dev server if one is listening, otherwise starts a throwaway instance
 * so `pnpm simulate` works on its own.
 */
async function startServerIfNeeded(): Promise<Server | undefined> {
  try {
    const health = await fetch(`${BASE_URL}/health`);
    if (health.ok) {
      return undefined;
    }
  } catch {
    // Nothing is listening, so fall through and start one.
  }

  stdout.write(`\nNo server on ${BASE_URL}, starting a temporary one for this run.\n`);
  const server = createApp().app.listen(config.PORT);
  await new Promise((resolve) => server.once('listening', resolve));
  return server;
}

async function main(): Promise<void> {
  const server = await startServerIfNeeded();
  const inputs = process.argv.slice(2).filter((argument) => argument !== '--');

  try {
    stdout.write('Your Mutual Friend USSD simulator\n');
    stdout.write(`  server  ${BASE_URL}\n`);
    stdout.write(`  phone   ${PHONE}\n`);
    stdout.write(`  session ${SESSION}\n`);

    if (inputs.length > 0) {
      await runScripted(inputs);
    } else {
      await runInteractive();
    }
  } finally {
    server?.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
