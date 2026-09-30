import type { Repositories } from '../domain/repository.js';
import { claimSteps } from '../flows/claim.js';
import { detailsSteps } from '../flows/details.js';
import { rootStep } from '../flows/root.js';
import { SIGNUP_STATES, signupSteps } from '../flows/signup.js';
import type { UssdReply } from './reply.js';
import { end } from './reply.js';
import { genericError, sessionExpired } from './screens.js';
import type { Session, SessionStore } from './session.js';
import { createSessionStore } from './session.js';

/** The payload Africa's Talking sends on every USSD hop, as documented. */
export interface UssdRequestPayload {
  readonly sessionId: string;
  readonly serviceCode: string;
  readonly phoneNumber: string;
  readonly networkCode: string;
  /** Empty on the first hop, then every input joined with *. */
  readonly text: string;
}

export interface UssdContext {
  readonly session: Session;
  /** The segment the customer just typed. Empty when re-rendering a screen. */
  readonly input: string;
  /** Every input so far in this session, oldest first. */
  readonly parts: readonly string[];
  readonly repositories: Repositories;
  readonly now: Date;
}

export interface StepResult {
  readonly reply: UssdReply;
  /** State to move to. Omit to stay put, which is what re-rendering needs. */
  readonly nextState?: string;
  /**
   * Hand the turn to nextState and immediately render its opening screen, rather
   * than showing the placeholder reply. Used when a menu option opens a flow.
   */
  readonly redirect?: boolean;
  /** Flow data to merge into the session. */
  readonly data?: Record<string, unknown>;
  /**
   * Session data keys to drop, for screens that invalidate earlier answers.
   * Runs after the merge, so a key cannot be set and cleared in one step.
   */
  readonly clearData?: readonly string[];
}

export interface StateDefinition {
  /**
   * Value for the at-ussd-hop-metadata header. This names the screen the
   * customer is looking at, which is what makes a journey readable on the AT
   * dashboard, so a step always reports its destination rather than its trigger.
   */
  readonly hop: string;
  /** True when the screen offers "0. Back". */
  readonly backable: boolean;
  handle: (context: UssdContext) => StepResult;
}

export const ROOT_STATE = 'root';

const stateTable: Record<string, StateDefinition> = {
  [ROOT_STATE]: rootStep,
  ...signupSteps,
  ...claimSteps,
  ...detailsSteps,
};

export interface UssdRouterOptions {
  readonly store?: SessionStore;
  readonly repositories: Repositories;
  /** Injectable clock so tenure and policy numbers are deterministic in tests. */
  readonly now?: () => Date;
}

export interface UssdRouter {
  handle(payload: UssdRequestPayload): UssdReply;
  readonly store: SessionStore;
}

export function createUssdRouter(options: UssdRouterOptions): UssdRouter {
  const store = options.store ?? createSessionStore();
  const now = options.now ?? ((): Date => new Date());

  function definitionFor(state: string): StateDefinition | undefined {
    return stateTable[state];
  }

  function startSession(payload: UssdRequestPayload): Session {
    return store.save({
      sessionId: payload.sessionId,
      phoneNumber: payload.phoneNumber,
      networkCode: payload.networkCode,
      serviceCode: payload.serviceCode,
      state: ROOT_STATE,
      data: {},
      lastTouchedAt: now().getTime(),
      history: [],
      stateStack: [],
    });
  }

  function runStep(
    session: Session,
    definition: StateDefinition,
    input: string,
    parts: readonly string[],
  ): StepResult {
    return definition.handle({
      session,
      input,
      parts,
      repositories: options.repositories,
      now: now(),
    });
  }

  return {
    store,

    handle(payload) {
      const parts = parseText(payload.text);
      const input = parts.at(-1) ?? '';
      let session = store.get(payload.sessionId);

      // A session we have never seen, or one lost to a restart, starts over at
      // the root menu. The path cannot be replayed because each step depends on
      // data captured earlier in the journey.
      if (!session) {
        if (parts.length > 1) {
          return end(sessionExpired(), 'sessionExpired');
        }
        session = startSession(payload);
      }

      const definition = definitionFor(session.state);
      if (!definition) {
        console.error(`[ussd] unknown state "${session.state}" for session ${session.sessionId}`);
        return end(genericError(), 'unknownState');
      }

      const rewindTo = definition.backable && input === '0' ? lastState(session) : undefined;

      if (rewindTo !== undefined) {
        const rewindTarget = definitionFor(rewindTo);
        if (rewindTarget) {
          return renderRewound(session, rewindTarget, rewindTo);
        }
      }

      let result: StepResult;
      try {
        result = runStep(session, definition, input, parts);
      } catch (error) {
        console.error(`[ussd] step "${session.state}" failed for ${payload.phoneNumber}`, error);
        return end(genericError(), 'error');
      }

      if (result.reply.isTerminal) {
        store.delete(session.sessionId);
        return result.reply;
      }

      const nextState = result.nextState ?? session.state;
      const advanced = store.update(session.sessionId, {
        state: nextState,
        stateStack: [...session.stateStack, session.state],
        data: mergeData(session.data, result),
        history: [...session.history, input],
      });

      if (result.redirect === true && result.nextState !== undefined) {
        const landing = definitionFor(result.nextState);
        if (!landing) {
          console.error(`[ussd] redirect target "${result.nextState}" is not registered`);
          return end(genericError(), 'error');
        }

        // Render the flow's opening screen with an empty input, letting it move
        // the session on again if the opening screen is itself a choice.
        const opening = runStep(advanced, landing, '', advanced.history);
        if (opening.reply.isTerminal) {
          store.delete(session.sessionId);
          return opening.reply;
        }
        store.update(session.sessionId, {
          state: opening.nextState ?? advanced.state,
          data: { ...advanced.data, ...(opening.data ?? {}) },
        });
        return opening.reply;
      }

      return result.reply;
    },
  };

  /**
   * Back returns the customer to the screen they came from, rendered afresh with
   * an empty input, instead of replaying what they typed. Data that belonged to
   * the abandoned attempt is dropped so the screen is not pre-filled with it.
   */
  function renderRewound(session: Session, target: StateDefinition, rewoundTo: string): UssdReply {
    const rewound: Session = {
      ...session,
      state: rewoundTo,
      stateStack: session.stateStack.slice(0, -1),
      history: session.history.slice(0, -1),
      data: pruneAbandonedData(session.data, rewoundTo),
    };
    store.update(session.sessionId, rewound);

    const rendered = runStep(rewound, target, '', rewound.history);
    store.update(session.sessionId, {
      state: rendered.nextState ?? rewound.state,
      data: mergeData(rewound.data, rendered),
    });

    return rendered.reply;
  }
}

function lastState(session: Session): string | undefined {
  return session.stateStack.length > 0 ? session.stateStack.at(-1) : undefined;
}

/** Merges a step's data over the session, then drops anything it invalidated. */
export function mergeData(
  existing: Record<string, unknown>,
  result: StepResult,
): Record<string, unknown> {
  const merged = { ...existing, ...(result.data ?? {}) };
  for (const key of result.clearData ?? []) {
    delete merged[key];
  }
  return merged;
}

/**
 * Splits Africa's Talking's accumulated input. Empty segments are dropped so a
 * stray asterisk never produces a phantom hop.
 */
export function parseText(text: string): string[] {
  return (text ?? '')
    .split('*')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/**
 * Drops data that only made sense on the screen being abandoned, so returning
 * to the cover menu and picking a different tier does not inherit the previous
 * selection. Name fields are cleared together, because re-entering one part of a
 * name implies the whole name is being redone.
 */
export function pruneAbandonedData(
  data: Record<string, unknown>,
  rewoundTo: string,
): Record<string, unknown> {
  const kept = { ...data };
  const atRoot = rewoundTo === ROOT_STATE;

  if (atRoot || rewoundTo === SIGNUP_STATES.cover) {
    delete kept.tier;
    delete kept.dateOfBirthIso;
    delete kept.dateOfBirthLabel;
  }
  if (atRoot || rewoundTo === SIGNUP_STATES.firstName || rewoundTo === SIGNUP_STATES.surname) {
    delete kept.firstName;
    delete kept.surname;
  }

  return kept;
}
