import type { Contract, ContractFunction } from '@enzymefinance/ethers';
import { matcherHint, printExpected, printReceived } from 'jest-matcher-utils';

import { ensureParameters } from './utils';

export function toHaveBeenCalledOnContract(this: jest.MatcherContext, fn: ContractFunction): jest.CustomMatcherResult;
export function toHaveBeenCalledOnContract(this: jest.MatcherContext, contract: Contract): jest.CustomMatcherResult;

export function toHaveBeenCalledOnContract(
  this: jest.MatcherContext,
  subject: Contract | ContractFunction,
): jest.CustomMatcherResult {
  const invert = this.isNot;

  return ensureParameters(subject, invert, (history, contract, fragment) => {
    const signature = fragment ? contract.abi.getSighash(fragment) : '0x';
    const method = fragment?.format('full');
    const expected = `${method ? method : 'contract'}`;
    const pass = history.calls(contract).some((call) => call.startsWith(signature));

    const message = pass
      ? () =>
          `${matcherHint('.toHaveBeenCalledOnContract', expected, undefined, this)}\n\n` +
          `Expected: ${printExpected('not to have been called')}\n` +
          `Actual: ${printReceived('has been called')}`
      : () =>
          `${matcherHint('.toHaveBeenCalledOnContract', expected, undefined, this)}\n\n` +
          `Expected: ${printExpected('to have been called')}\n` +
          `Actual: ${printReceived('has not been called')}`;

    return { message, pass };
  });
}
