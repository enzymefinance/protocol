import type { AddressLike } from '@enzymefinance/ethers';
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
  stakingContractAddress,
  publicKeys,
  claimType,
}: {
  stakingContractAddress: AddressLike;
  publicKeys: BytesLike[];
  claimType: KilnStakingPositionActionClaimType;
}) {
  return encodeArgs(['address', 'bytes[]', 'uint256'], [stakingContractAddress, publicKeys, claimType]);
}

export function kilnStakingPositionStakeArgs({
  stakingContractAddress,
  amount,
}: {
  stakingContractAddress: AddressLike;
  amount: BigNumberish;
}) {
  return encodeArgs(['address', 'uint256'], [stakingContractAddress, amount]);
}
