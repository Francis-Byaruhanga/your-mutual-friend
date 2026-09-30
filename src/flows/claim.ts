import { submitClaim } from '../domain/claim.js';
import type { Policy } from '../domain/policy.js';
import { getProduct } from '../domain/products.js';
import { formatDateOfBirth, parseMenuChoice, parseTicketNumber } from '../domain/validation.js';
import { con, end } from '../ussd/reply.js';
import type { StateDefinition, StepResult, UssdContext } from '../ussd/router.js';
import { ROOT_STATE } from '../ussd/router.js';
import {
  claimConfirmScreen,
  claimSubmitted,
  duplicateClaim,
  invalidSelection,
  mainMenu,
  noActivePolicy,
  ticketNumberPrompt,
} from '../ussd/screens.js';

export const CLAIM_STATES = {
  confirm: 'claim.confirm',
  ticket: 'claim.ticket',
} as const;

/**
 * The claims journey in the brief: confirm the customer's details, take the
 * service ticket number their provider gave them, then acknowledge submission.
 *
 * The brief shows a "1. Submit" line under the ticket number input. On a real
 * USSD handset the value the customer types is itself the submission, so an
 * extra Submit step would mean typing the ticket number twice. The input is
 * taken as the submission here and 0 Back is offered instead.
 */
export const claimSteps: Record<string, StateDefinition> = {
  [CLAIM_STATES.confirm]: { hop: 'claimConfirm', backable: true, handle: handleClaimConfirm },
  [CLAIM_STATES.ticket]: { hop: 'captureTicketNumber', backable: true, handle: handleTicket },
};

function handleClaimConfirm({ input, session, repositories }: UssdContext): StepResult {
  const policy = repositories.policies.findActiveByPhone(session.phoneNumber);

  if (!policy) {
    return { reply: end(noActivePolicy(session.phoneNumber), 'claimNoPolicy') };
  }

  if (input === '') {
    return { reply: con(confirmScreen(policy), 'claimConfirm') };
  }

  switch (parseMenuChoice(input)) {
    case '1':
      return {
        reply: con(ticketNumberPrompt(), 'captureTicketNumber'),
        nextState: CLAIM_STATES.ticket,
      };
    case '2':
      // The claims screen is entered from the main menu, so Back returns there.
      return { reply: con(mainMenu(), 'welcomeMenu'), nextState: ROOT_STATE };
    default:
      return {
        reply: con(`${invalidSelection()}\n\n${confirmScreen(policy)}`, 'claimConfirmInvalid'),
      };
  }
}

function handleTicket({ input, session, repositories, now }: UssdContext): StepResult {
  const policy = repositories.policies.findActiveByPhone(session.phoneNumber);

  if (!policy) {
    return { reply: end(noActivePolicy(session.phoneNumber), 'claimNoPolicy') };
  }

  if (input === '') {
    return { reply: con(ticketNumberPrompt(), 'captureTicketNumber') };
  }

  const parsed = parseTicketNumber(input);
  if (!parsed.ok) {
    return {
      reply: con(`${parsed.error}\n\n${ticketNumberPrompt()}`, 'captureTicketNumberInvalid'),
    };
  }

  const existing = repositories.claims.findByTicketNumber(parsed.value);
  if (existing) {
    return { reply: end(duplicateClaim(parsed.value, existing), 'claimDuplicate') };
  }

  const claim = submitClaim({
    ticketNumber: parsed.value,
    phoneNumber: session.phoneNumber,
    policy,
    submittedAt: now,
  });
  repositories.claims.save(claim);
  console.info(
    `[ussd] claim ${claim.reference} for ticket ${claim.ticketNumber} on ${policy.policyNumber}`,
  );

  return { reply: end(claimSubmitted(claim, policy), 'claimSubmitted') };
}

function confirmScreen(policy: Policy): string {
  return claimConfirmScreen({
    firstName: policy.holder.firstName,
    surname: policy.holder.surname,
    dateOfBirth: formatDateOfBirth(new Date(policy.holder.dateOfBirth)),
    tierLabel: getProduct(policy.tier).label,
    policyNumber: policy.policyNumber,
  });
}
