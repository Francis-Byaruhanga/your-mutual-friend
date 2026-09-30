import { con } from '../ussd/reply.js';
import type { StateDefinition, StepResult } from '../ussd/router.js';
import { invalidSelection, mainMenu } from '../ussd/screens.js';

export const SIGNUP_FIRST_STATE = 'signup.cover';
export const CLAIM_FIRST_STATE = 'claim.confirm';
export const DETAILS_FIRST_STATE = 'details.view';

/**
 * Step 1 of the journey. Option 1 signs up, option 2 raises a claim and option 3
 * shows the customer's existing cover. Each option hands straight over to the
 * first screen of its flow, so the customer never sees a blank hop.
 */
export function handleRoot(input: string): StepResult {
  switch (input) {
    case '':
      return { reply: con(mainMenu(), 'welcomeMenu') };
    case '1':
      return { reply: con('', 'signUpSelected'), nextState: SIGNUP_FIRST_STATE, redirect: true };
    case '2':
      return { reply: con('', 'claimSelected'), nextState: CLAIM_FIRST_STATE, redirect: true };
    case '3':
      return { reply: con('', 'detailsSelected'), nextState: DETAILS_FIRST_STATE, redirect: true };
    default:
      return { reply: con(`${invalidSelection()}\n\n${mainMenu()}`, 'welcomeMenuInvalid') };
  }
}

export const rootStep: StateDefinition = {
  hop: 'welcomeMenu',
  backable: false,
  handle: ({ input }) => handleRoot(input),
};
