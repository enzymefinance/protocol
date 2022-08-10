import type { AddressLike } from '@enzymefinance/ethers';
import { resolveAddress } from '@enzymefinance/ethers';
import { matcherHint } from 'jest-matcher-utils';

import { forceFail } from '../utils';

export function toMatchAddress(this: jest.MatcherContext, received: AddressLike, expected: AddressLike) {
  const invert = this.isNot;
  let receivedAddress: string;
  let expectedAddress: string;

  try {
    receivedAddress = resolveAddress(received);
  } catch (e) {
    return forceFail(`The received value is not an address: ${e}`, invert);
  }

  try {
    expectedAddress = resolveAddress(expected);
  } catch (e) {
    return forceFail(`The expected value is not an address: ${e}`, invert);
  }

  const pass = receivedAddress === expectedAddress;
  const message = () => matcherHint('.toMatchAddress', receivedAddress, expectedAddress, this);

  return { message, pass };
}
