import { config } from '../config.js';
import type { Claim } from '../domain/claim.js';
import { calculateTenure, formatAmount, formatPhone, type Policy } from '../domain/policy.js';
import { getProduct, PRODUCT_LIST } from '../domain/products.js';
import { formatDateOfBirth } from '../domain/validation.js';

/**
 * Every string a customer can see lives here, which keeps the wording consistent
 * and makes a copy review a single file. No parentheses, smart quotes, dashes or
 * currency symbols: telcos cannot render them reliably.
 */

export const BACK_OPTION = '0. Back';
export const CANCEL_OPTION = '0. Cancel';

export function mainMenu(): string {
  return `Welcome to Your Mutual Friend
While in need, your friend indeed

1. Sign Up
2. Claim
3. Check Details`;
}

export function coverMenu(): string {
  const options = PRODUCT_LIST.map(
    (product) =>
      `${product.menuKey}. ${product.label} - Save ${formatAmount(product.monthlyPremium)} per month, enjoy up to ${formatAmount(product.annualBenefit)} UGX in annual benefits`,
  ).join('\n');

  return `Life and Medical Cover for your everyday emergencies

Select a cover:
${options}`;
}

export function firstNamePrompt(): string {
  return `Enter your first name as shown on your National ID

${BACK_OPTION}`;
}

export function surnamePrompt(): string {
  return `Enter your surname as shown on your National ID

${BACK_OPTION}`;
}

export function confirmIdentityScreen(details: { firstName: string; surname: string }): string {
  return `Confirm your details:
Name: ${details.firstName}
Surname: ${details.surname}

1. Correct
2. Incorrect
${BACK_OPTION}`;
}

export function dateOfBirthPrompt(): string {
  return `Enter your date of birth as shown on your National ID ie. 01.01.1999

${BACK_OPTION}`;
}

export function verifyPolicyScreen(summary: {
  firstName: string;
  surname: string;
  dateOfBirth: string;
  tierLabel: string;
  firstInstallment: number;
}): string {
  return `Confirm your policy:
Name: ${summary.firstName}
Surname: ${summary.surname}
Date of Birth: ${summary.dateOfBirth}
Policy Cover: ${summary.tierLabel}
First installment: ${formatAmount(summary.firstInstallment)} UGX

1. Proceed to pay first installment
2. Go Back`;
}

export function mobileMoneyPrompt(amount: number): string {
  return `Mobile Money payment of ${formatAmount(amount)} UGX
Sandbox: enter any 4 digits as your PIN

${CANCEL_OPTION}`;
}

export function paymentCancelled(tierLabel?: string): string {
  const product = tierLabel ? `${tierLabel} ` : '';
  return `Payment cancelled. Your ${product}cover was not activated.
No money has been taken. You can sign up again at any time.`;
}

/**
 * Stands in for the confirmation SMS, which is not wired up yet. The same text
 * is queued for the SMS adapter once credentials and a sender ID exist.
 */
export function purchaseConfirmation(policy: Policy): string {
  const product = getProduct(policy.tier);
  const phone = formatPhone(policy.holder.phoneNumber);

  return `Congratulations! Your Mutual Friend ${product.label} cover is active.

Policy No: ${policy.policyNumber}
Premium: ${formatAmount(product.monthlyPremium)} UGX per month
Cover up to: ${formatAmount(product.annualBenefit)} UGX

Providers near you
Hospitals: Nakasero Hospital, Mengo Hospital, Kampala International Hospital
Pharmacies: City Pharmacy, MediCare Pharmacy
Funeral: Kampala Funeral Services

Terms and conditions: ${config.TERMS_URL}

An SMS with this list will be sent to ${phone}.`;
}

export function invalidSelection(): string {
  return `Invalid selection.
Please choose a number from the menu.`;
}

export function invalidCover(): string {
  return `Invalid selection.
Please choose 1 for Gold, 2 for Silver or 3 for Bronze.`;
}

export function sessionExpired(): string {
  return `Your session has expired. Please start again.

${mainMenu()}`;
}

export function genericError(): string {
  return `Sorry, something went wrong on our side.
Please try again later or call Old Mutual on 0800 219 219.`;
}

export function noActivePolicy(phoneNumber: string): string {
  return `No active policy found on ${formatPhone(phoneNumber)}.

Please dial again and choose Sign Up to get covered.`;
}

export function claimConfirmScreen(summary: {
  firstName: string;
  surname: string;
  dateOfBirth: string;
  tierLabel: string;
  policyNumber: string;
}): string {
  return `Confirm Details
Name: ${summary.firstName}
Surname: ${summary.surname}
Date of Birth: ${summary.dateOfBirth}
Policy Cover: ${summary.tierLabel}
Policy No: ${summary.policyNumber}

1. Continue
2. Go Back`;
}

export function ticketNumberPrompt(): string {
  return `Enter the service ticket number from your hospital, pharmacy or funeral provider

${BACK_OPTION}`;
}

export function claimSubmitted(claim: Claim, policy: Policy): string {
  const product = getProduct(policy.tier);
  return `Congratulations! Your Claim has been submitted and is being processed!

Claim reference: ${claim.reference}
Ticket: ${claim.ticketNumber}
Policy No: ${policy.policyNumber}
Cover: ${product.label}

We will call you on ${formatPhone(claim.phoneNumber)} within 48 hours.
Keep this reference safe.`;
}

export function duplicateClaim(ticketNumber: string, claim: Claim): string {
  return `Ticket ${ticketNumber} was already submitted on your ${getClaimDate(claim)}.
Reference: ${claim.reference}
Please wait for it to be processed.`;
}

function getClaimDate(claim: Claim): string {
  return claim.submittedAt.toISOString().slice(0, 10);
}

export function claimErrorMessage(error: string): string {
  return `${error}.

${ticketNumberPrompt()}`;
}

export function policyDetailsScreen(policy: Policy, now: Date = new Date()): string {
  const product = getProduct(policy.tier);
  const tenure = calculateTenure(policy, now).label;
  const phone = formatPhone(policy.holder.phoneNumber);

  return `Your Policy Details

Name: ${policy.holder.firstName}
Surname: ${policy.holder.surname}
Date of Birth: ${formatDateOfBirth(new Date(policy.holder.dateOfBirth))}
Policy No: ${policy.policyNumber}
Policy Type: ${product.label}
Policy Tenure: ${tenure}
Premium: ${formatAmount(product.monthlyPremium)} UGX per month
Benefit: up to ${formatAmount(product.annualBenefit)} UGX
Status: ${policy.status}

Call Old Mutual on 0800 219 219 to make a claim on ${phone}.`;
}
