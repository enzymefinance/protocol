import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish } from 'ethers';

import { encodeArgs } from '../encoding';

export enum TheGraphDelegationPositionActionId {
  Delegate = '0',
  Undelegate = '1',
  Withdraw = '2',
}

export function theGraphDelegationPositionDelegateArgs({
  indexer,
  tokens,
}: {
  indexer: AddressLike;
  tokens: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [indexer, tokens]);
}

export function theGraphDelegationPositionUndelegateArgs({
  indexer,
  shares,
}: {
  indexer: AddressLike;
  shares: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [indexer, shares]);
}

export function theGraphDelegationPositionWithdrawArgs({
  indexer,
  nextIndexer,
}: {
  indexer: AddressLike;
  nextIndexer: AddressLike;
}) {
  return encodeArgs(['address', 'address'], [indexer, nextIndexer]);
}
