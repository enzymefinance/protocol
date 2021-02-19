import { AddressLike } from '@crestproject/crestproject';
import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function aaveLendArgs({
  outgoingToken,
  amount,
  incomingAToken,
}: {
  outgoingToken: AddressLike;
  amount: BigNumberish;
  incomingAToken: AddressLike;
}) {
  return encodeArgs(['address', 'uint256', 'address'], [outgoingToken, amount, incomingAToken]);
}

export function aaveRedeemArgs({
  outgoingAToken,
  amount,
  incomingToken,
}: {
  outgoingAToken: AddressLike;
  amount: BigNumberish;
  incomingToken: AddressLike;
}) {
  return encodeArgs(['address', 'uint256', 'address'], [outgoingAToken, amount, incomingToken]);
}
