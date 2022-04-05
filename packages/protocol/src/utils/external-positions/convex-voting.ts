import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish, BytesLike } from 'ethers';

import { encodeArgs } from '../encoding';

export enum ConvexVotingPositionActionId {
  Lock = '0',
  Relock = '1',
  Withdraw = '2',
  ClaimRewards = '3',
  Delegate = '4',
}

export function convexVotingPositionClaimRewardsArgs({
  allTokensToTransfer,
  claimLockerRewards,
  extraRewardTokens,
  votiumClaims,
  unstakeCvxCrv,
}: {
  allTokensToTransfer: AddressLike[];
  claimLockerRewards: boolean;
  extraRewardTokens: AddressLike[];
  votiumClaims: BytesLike[]; // TODO: update this
  unstakeCvxCrv: boolean;
}) {
  return encodeArgs(
    ['address[]', 'bool', 'address[]', 'bytes', 'bool'],
    [allTokensToTransfer, claimLockerRewards, extraRewardTokens, votiumClaims, unstakeCvxCrv],
  );
}

export function convexVotingPositionDelegateArgs({ delegatee }: { delegatee: AddressLike }) {
  return encodeArgs(['address'], [delegatee]);
}

export function convexVotingPositionLockArgs({
  amount,
  spendRatio,
}: {
  amount: BigNumberish;
  spendRatio: BigNumberish;
}) {
  return encodeArgs(['uint256', 'uint256'], [amount, spendRatio]);
}
