import { AddressLike } from '@enzymefinance/ethers';
import { BigNumberish } from 'ethers';
import { encodeArgs } from '../encoding';

export function idleClaimRewardsArgs({ idleToken }: { idleToken: AddressLike }) {
  return encodeArgs(['address'], [idleToken]);
}

export function idleLendArgs({
  idleToken,
  outgoingUnderlyingAmount,
  minIncomingIdleTokenAmount,
}: {
  idleToken: AddressLike;
  outgoingUnderlyingAmount: BigNumberish;
  minIncomingIdleTokenAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [idleToken, outgoingUnderlyingAmount, minIncomingIdleTokenAmount],
  );
}

export function idleRedeemArgs({
  idleToken,
  outgoingIdleTokenAmount,
  minIncomingUnderlyingAmount,
}: {
  idleToken: AddressLike;
  outgoingIdleTokenAmount: BigNumberish;
  minIncomingUnderlyingAmount: BigNumberish;
}) {
  return encodeArgs(
    ['address', 'uint256', 'uint256'],
    [idleToken, outgoingIdleTokenAmount, minIncomingUnderlyingAmount],
  );
}
