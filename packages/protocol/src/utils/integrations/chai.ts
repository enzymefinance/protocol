import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function chaiLendArgs({
  outgoingDaiAmount,
  expectedIncomingChaiAmount,
}: {
  outgoingDaiAmount: BigNumberish;
  expectedIncomingChaiAmount: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [outgoingDaiAmount, expectedIncomingChaiAmount]);
}

export function chaiRedeemArgs({
  outgoingChaiAmount,
  expectedIncomingDaiAmount,
}: {
  outgoingChaiAmount: BigNumberish;
  expectedIncomingDaiAmount: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [outgoingChaiAmount, expectedIncomingDaiAmount]);
}
