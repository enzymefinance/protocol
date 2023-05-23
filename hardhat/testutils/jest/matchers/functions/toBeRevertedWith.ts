import { matcherHint } from 'jest-matcher-utils';

// NOTE: This is a best effort attempt at extracting the raw revert reason string from an ethers.js error.
// It is not guaranteed to work in all cases but should prevent false positives due to its "strict" behavior of
// requiring a specific prefix (see regex pattern). Ultimately, this is something that needs to be solved in ethers.js.
export function extractRevertReason(error: any): string | undefined {
  const cleaned = String(error?.reason ?? error?.message ?? error ?? '')
    .replace(/^Error: /, '')
    .replace(/^call revert exception; /, '')
    .replace(/^VM Exception while processing transaction: /, '');

  {
    const match = /^reverted with panic code (0x[0-9]{1,2}) \(.*\)$/.exec(cleaned);

    if (match !== null) {
      return `Panic(${match[1]})`;
    }
  }

  {
    const match = /^reverted with reason string '(.*)'$/.exec(cleaned);

    if (match !== null) {
      return `Error(${match[1]})`;
    }
  }

  {
    const match = /^revert with reason "(.*)"$/.exec(cleaned);

    if (match !== null) {
      return `Error(${match[1]})`;
    }
  }

  if (cleaned === 'Transaction reverted without a reason string') {
    return `Error(reverted without a reason string)`;
  }

  if (cleaned === 'Transaction reverted: function call to a non-contract account') {
    return `Error(function call to a non-contract account)`;
  }

  if (typeof error?.reason === 'string') {
    return `Error(${error.reason})`;
  }

  if (error?.reason === null && error?.data === '0x') {
    return `Error(reverted without a reason string)`;
  }

  return undefined;
}

export function toBeRevertedWith(this: jest.MatcherContext, received: any, match: RegExp | string) {
  const reason = extractRevertReason(received);

  if (reason === undefined) {
    throw new Error(`Failed to extract revert reason ${received}`);
  }

  const pass = (reason.match(match) ?? null) !== null;
  const message = () => matcherHint('.toBeRevertedWith', reason, `${match}`, this);

  return { message, pass };
}
