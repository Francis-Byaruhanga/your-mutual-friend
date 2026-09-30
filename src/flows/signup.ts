import { issuePolicy, type Policy } from '../domain/policy.js';
import { getProductByMenuKey, PRODUCT_LIST, type Product } from '../domain/products.js';
import {
  formatDateOfBirth,
  parseDateOfBirth,
  parseMenuChoice,
  parseName,
} from '../domain/validation.js';
import { con, end } from '../ussd/reply.js';
import type { StateDefinition, StepResult, UssdContext } from '../ussd/router.js';
import {
  confirmIdentityScreen,
  coverMenu,
  dateOfBirthPrompt,
  firstNamePrompt,
  invalidCover,
  invalidSelection,
  mobileMoneyPrompt,
  paymentCancelled,
  purchaseConfirmation,
  surnamePrompt,
  verifyPolicyScreen,
} from '../ussd/screens.js';

export const SIGNUP_STATES = {
  cover: 'signup.cover',
  firstName: 'signup.firstName',
  surname: 'signup.surname',
  confirmIdentity: 'signup.confirmIdentity',
  dateOfBirth: 'signup.dateOfBirth',
  verifyPolicy: 'signup.verifyPolicy',
  mobileMoney: 'signup.mobileMoney',
} as const;

/** Every key the sign up flow writes to the session. */
const KEY_TIER = 'tier';
const KEY_FIRST_NAME = 'firstName';
const KEY_SURNAME = 'surname';
const KEY_DOB_ISO = 'dateOfBirthIso';
const KEY_DOB_LABEL = 'dateOfBirthLabel';

/**
 * The customer journey in the brief, in order: cover, name, surname, confirm,
 * date of birth, verify, pay. Each screen is its own state, so Back and session
 * resume both work without replaying the whole path.
 */
export const signupSteps: Record<string, StateDefinition> = {
  [SIGNUP_STATES.cover]: { hop: 'coverSelect', backable: true, handle: handleCover },
  [SIGNUP_STATES.firstName]: { hop: 'captureFirstName', backable: true, handle: handleFirstName },
  [SIGNUP_STATES.surname]: { hop: 'captureSurname', backable: true, handle: handleSurname },
  [SIGNUP_STATES.confirmIdentity]: {
    hop: 'confirmIdentity',
    backable: true,
    handle: handleConfirmIdentity,
  },
  [SIGNUP_STATES.dateOfBirth]: {
    hop: 'captureDateOfBirth',
    backable: true,
    handle: handleDateOfBirth,
  },
  [SIGNUP_STATES.verifyPolicy]: { hop: 'verifyPolicy', backable: true, handle: handleVerifyPolicy },
  [SIGNUP_STATES.mobileMoney]: {
    hop: 'mobileMoneyPin',
    backable: false,
    handle: handleMobileMoney,
  },
};

function handleCover({ input }: UssdContext): StepResult {
  if (input === '') {
    return { reply: con(coverMenu(), 'coverSelect') };
  }

  const product = getProductByMenuKey(parseMenuChoice(input));
  if (!product) {
    return { reply: con(`${invalidCover()}\n\n${coverMenu()}`, 'coverSelectInvalid') };
  }

  return {
    reply: con(firstNamePrompt(), 'captureFirstName'),
    nextState: SIGNUP_STATES.firstName,
    data: { [KEY_TIER]: product.tier },
  };
}

function handleFirstName({ input }: UssdContext): StepResult {
  if (input === '') {
    return { reply: con(firstNamePrompt(), 'captureFirstName') };
  }

  const parsed = parseName(input, 'First name');
  if (!parsed.ok) {
    return {
      reply: con(`${parsed.error}\n\n${firstNamePrompt()}`, 'captureFirstNameInvalid'),
    };
  }

  return {
    reply: con(surnamePrompt(), 'captureSurname'),
    nextState: SIGNUP_STATES.surname,
    data: { [KEY_FIRST_NAME]: parsed.value },
  };
}

function handleSurname({ input, session }: UssdContext): StepResult {
  if (input === '') {
    return { reply: con(surnamePrompt(), 'captureSurname') };
  }

  const parsed = parseName(input, 'Surname');
  if (!parsed.ok) {
    return { reply: con(`${parsed.error}\n\n${surnamePrompt()}`, 'captureSurnameInvalid') };
  }

  return {
    reply: con(
      confirmIdentityScreen({
        firstName: read(session.data, KEY_FIRST_NAME),
        surname: parsed.value,
      }),
      'confirmIdentity',
    ),
    nextState: SIGNUP_STATES.confirmIdentity,
    data: { [KEY_SURNAME]: parsed.value },
  };
}

/** Step 3 of the brief: confirm the name the customer gave us. */
function handleConfirmIdentity({ input, session }: UssdContext): StepResult {
  if (input === '') {
    return { reply: con(identityScreen(session), 'confirmIdentity') };
  }

  switch (parseMenuChoice(input)) {
    case '1':
      return {
        reply: con(dateOfBirthPrompt(), 'captureDateOfBirth'),
        nextState: SIGNUP_STATES.dateOfBirth,
      };
    case '2':
      // Details were wrong, so capture the name again from the start.
      return {
        reply: con(firstNamePrompt(), 'captureFirstName'),
        nextState: SIGNUP_STATES.firstName,
        clearData: [KEY_FIRST_NAME, KEY_SURNAME],
      };
    default:
      return {
        reply: con(`${invalidSelection()}\n\n${identityScreen(session)}`, 'confirmIdentityInvalid'),
      };
  }
}

/** Step 4 of the brief: date of birth exactly as printed on the National ID. */
function handleDateOfBirth({ input, session, now }: UssdContext): StepResult {
  if (input === '') {
    return { reply: con(dateOfBirthPrompt(), 'captureDateOfBirth') };
  }

  const parsed = parseDateOfBirth(input, now);
  if (!parsed.ok) {
    return { reply: con(`${parsed.error}\n\n${dateOfBirthPrompt()}`, 'captureDateOfBirthInvalid') };
  }

  const label = formatDateOfBirth(parsed.value);
  return {
    reply: con(verifySummary(session, label), 'verifyPolicy'),
    nextState: SIGNUP_STATES.verifyPolicy,
    data: { [KEY_DOB_ISO]: parsed.value.toISOString(), [KEY_DOB_LABEL]: label },
  };
}

/** Step 5 of the brief: the last chance to change anything before paying. */
function handleVerifyPolicy({ input, session }: UssdContext): StepResult {
  if (input === '') {
    return { reply: con(verifySummary(session), 'verifyPolicy') };
  }

  switch (parseMenuChoice(input)) {
    case '1':
      return {
        reply: con(mobileMoneyPrompt(premiumFor(session)), 'mobileMoneyPin'),
        nextState: SIGNUP_STATES.mobileMoney,
      };
    case '2':
      // Back to the cover list, so the customer can change tier or re-check.
      return {
        reply: con(coverMenu(), 'coverSelect'),
        nextState: SIGNUP_STATES.cover,
        clearData: [KEY_DOB_ISO, KEY_DOB_LABEL],
      };
    default:
      return {
        reply: con(`${invalidSelection()}\n\n${verifySummary(session)}`, 'verifyPolicyInvalid'),
      };
  }
}

/**
 * Step 5 continued. The mobile money PIN is simulated: the prototype accepts any
 * four to six digits so the journey can be demonstrated end to end. The digits
 * are never stored, logged or forwarded anywhere. Before launch this screen must
 * be replaced by an Africa's Talking STK push, where the network collects the
 * PIN on the handset and we never see it.
 */
function handleMobileMoney({ input, session, repositories, now }: UssdContext): StepResult {
  if (input === '') {
    return { reply: con(mobileMoneyPrompt(premiumFor(session)), 'mobileMoneyPin') };
  }

  const product = productFor(session);

  if (input === '0') {
    return { reply: end(paymentCancelled(product?.label), 'paymentCancelled') };
  }

  if (!/^\d{4,6}$/.test(input)) {
    return {
      reply: con(
        `PIN must be 4 to 6 digits.\n\n${mobileMoneyPrompt(premiumFor(session))}`,
        'mobileMoneyPinInvalid',
      ),
    };
  }

  const policy = issuePolicyFor(session, product, now);
  repositories.policies.save(policy);
  console.info(
    `[ussd] policy ${policy.policyNumber} issued to ${policy.holder.phoneNumber} on ${policy.tier}`,
  );

  return { reply: end(purchaseConfirmation(policy), 'purchaseComplete') };
}

function identityScreen(session: UssdContext['session']): string {
  return confirmIdentityScreen({
    firstName: read(session.data, KEY_FIRST_NAME),
    surname: read(session.data, KEY_SURNAME),
  });
}

function verifySummary(session: UssdContext['session'], dateOfBirthLabel?: string): string {
  const product = productFor(session);
  return verifyPolicyScreen({
    firstName: read(session.data, KEY_FIRST_NAME),
    surname: read(session.data, KEY_SURNAME),
    dateOfBirth: dateOfBirthLabel ?? read(session.data, KEY_DOB_LABEL),
    tierLabel: product?.label ?? 'Not selected',
    firstInstallment: product?.monthlyPremium ?? 0,
  });
}

function issuePolicyFor(
  session: UssdContext['session'],
  product: Product | undefined,
  now: Date,
): Policy {
  if (!product) {
    throw new Error(`Session ${session.sessionId} reached payment with no cover selected`);
  }
  return issuePolicy({
    holder: {
      firstName: read(session.data, KEY_FIRST_NAME),
      surname: read(session.data, KEY_SURNAME),
      dateOfBirth: read(session.data, KEY_DOB_ISO),
      phoneNumber: session.phoneNumber,
    },
    product,
    issuedAt: now,
  });
}

function productFor(session: UssdContext['session']): Product | undefined {
  const tier = read(session.data, KEY_TIER);
  return PRODUCT_LIST.find((candidate) => candidate.tier === tier);
}

function premiumFor(session: UssdContext['session']): number {
  return productFor(session)?.monthlyPremium ?? 0;
}

function read(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : '';
}
