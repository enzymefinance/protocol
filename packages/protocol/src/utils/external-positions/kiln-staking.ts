import type { BigNumberish, BytesLike } from 'ethers';

import { encodeArgs } from '../encoding';

export enum KilnStakingPositionActionId {
  Stake = '0',
  ClaimFees = '1',
  WithdrawEth = '2',
}

export enum KilnStakingPositionActionClaimType {
  ExecutionLayer = '0',
  ConsensusLayer = '1',
  All = '2',
}

export function kilnStakingPositionClaimFeesArgs({
  publicKeys,
  claimType,
}: {
  publicKeys: BytesLike[];
  claimType: KilnStakingPositionActionClaimType;
}) {
  return encodeArgs(['bytes[]', 'uint256'], [publicKeys, claimType]);
}

export function kilnStakingPositionStakeArgs({ amount }: { amount: BigNumberish }) {
  return encodeArgs(['uint256'], [amount]);
}
