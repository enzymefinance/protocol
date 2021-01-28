import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function alphaHomoraV1LendArgs({
  outgoingWethAmount,
  minIncomingIbethAmount,
}: {
  outgoingWethAmount: BigNumberish;
  minIncomingIbethAmount: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [outgoingWethAmount, minIncomingIbethAmount]);
}

export function alphaHomoraV1RedeemArgs({
  outgoingIbethAmount,
  minIncomingWethAmount,
}: {
  outgoingIbethAmount: BigNumberish;
  minIncomingWethAmount: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [outgoingIbethAmount, minIncomingWethAmount]);
}
