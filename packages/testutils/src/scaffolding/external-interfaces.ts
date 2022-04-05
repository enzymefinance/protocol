import type { AddressLike, Call, Contract, Send } from '@enzymefinance/ethers';
import { contract } from '@enzymefinance/ethers';
import type { BigNumber, BigNumberish, BytesLike } from 'ethers';

// CONVEX

export interface IConvexBaseRewardPool extends Contract<IConvexBaseRewardPool> {
  stakeFor: Send<(forUser: AddressLike, amount: BigNumberish) => boolean>;
}

export const IConvexBaseRewardPool = contract<IConvexBaseRewardPool>()`
  function stakeFor(address, uint256) returns (bool)
`;

export interface IConvexCrvDepositor extends Contract<IConvexCrvDepositor> {
  deposit: Send<(amount: BigNumberish, lock: boolean) => void>;
}

export const IConvexCrvDepositor = contract<IConvexCrvDepositor>()`
  function deposit(uint256, bool)
`;

export interface IConvexCvxLocker extends Contract<IConvexCvxLocker> {
  balanceOf: Call<(account: AddressLike) => BigNumber>;
  checkpointEpoch: Send<() => void>;
  getReward: Send<(account: AddressLike, stake: boolean) => void>;
  lockedBalanceOf: Call<(account: AddressLike) => BigNumber>;
}

export const IConvexCvxLocker = contract<IConvexCvxLocker>()`
  function balanceOf(address) view returns (uint256)
  function checkpointEpoch()
  function getReward(address, bool)
  function lockedBalanceOf(address) view returns (uint256)
`;

export interface IConvexVlCvxExtraRewardDistribution extends Contract<IConvexVlCvxExtraRewardDistribution> {
  addReward: Send<(token: AddressLike, amount: BigNumberish) => void>;
  claimableRewards: Call<(account: AddressLike, token: AddressLike) => BigNumber>;
}

export const IConvexVlCvxExtraRewardDistribution = contract<IConvexVlCvxExtraRewardDistribution>()`
  function claimableRewards(address, address) view returns (uint256)
  function addReward(address, uint256)
`;

// SNAPSHOT

export interface ISnapshotDelegateRegistry extends Contract<ISnapshotDelegateRegistry> {
  delegation: Call<(account: AddressLike, id: BytesLike) => AddressLike>;
}

export const ISnapshotDelegateRegistry = contract<ISnapshotDelegateRegistry>()`
  function delegation(address, bytes32) view returns (address)
`;
