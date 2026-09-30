import { end } from '../ussd/reply.js';
import type { StateDefinition, StepResult, UssdContext } from '../ussd/router.js';
import { noActivePolicy, policyDetailsScreen } from '../ussd/screens.js';

export const DETAILS_STATES = {
  view: 'details.view',
} as const;

/**
 * Step 1 option 3: shows the customer's name, date of birth, policy number,
 * policy type and tenure so far. This closes the session, so it is a single END
 * screen with no menu to navigate.
 */
export const detailsSteps: Record<string, StateDefinition> = {
  [DETAILS_STATES.view]: { hop: 'policyDetails', backable: false, handle: handleDetails },
};

function handleDetails({ session, repositories, now }: UssdContext): StepResult {
  const policy = repositories.policies.findActiveByPhone(session.phoneNumber);

  if (!policy) {
    return { reply: end(noActivePolicy(session.phoneNumber), 'detailsNoPolicy') };
  }

  return { reply: end(policyDetailsScreen(policy, now), 'policyDetails') };
}
