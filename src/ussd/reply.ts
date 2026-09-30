export type ResponseKind = 'CON' | 'END';

export interface UssdReply {
  /** Raw body sent back to Africa's Talking, always prefixed CON or END. */
  readonly body: string;
  /** Value written to the at-ussd-hop-metadata response header. */
  readonly hop: string;
  readonly isTerminal: boolean;
}

/**
 * Telcos render a restricted character set on USSD handsets. Parentheses, curly
 * quotes, em dashes and currency symbols are stripped or replaced here rather
 * than relying on every screen author to remember the rule.
 */
const UNSAFE_CHARACTERS: ReadonlyArray<[RegExp, string]> = [
  [/[‘’‛′]/g, "'"],
  [/[“”‟″]/g, '"'],
  [/—|–/g, '-'],
  [/…/g, '...'],
  [/[()[\]{}]/g, ''],
  [/ /g, ' '],
];

export function sanitise(text: string): string {
  let output = text;
  for (const [pattern, replacement] of UNSAFE_CHARACTERS) {
    output = output.replace(pattern, replacement);
  }
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Builds a continuing USSD response. AT requires the CON prefix exactly. */
export function con(body: string, hop: string): UssdReply {
  return { body: `CON ${sanitise(body)}`, hop, isTerminal: false };
}

/** Builds the final USSD response, which closes the session. */
export function end(body: string, hop: string): UssdReply {
  return { body: `END ${sanitise(body)}`, hop, isTerminal: true };
}
