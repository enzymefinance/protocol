import type { AddressLike } from '@enzymefinance/ethers';
import type { ComptrollerLib, ExternalPositionManager, VotiumClaimParam } from '@enzymefinance/protocol';
import {
  ConvexVotingPositionActionId,
  convexVotingPositionClaimRewardsArgs,
  convexVotingPositionDelegateArgs,
  convexVotingPositionLockArgs,
  ExternalPositionType,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';
import { BigNumber } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export function createConvexVotingPosition({
  signer,
  comptrollerProxy,
  externalPositionManager,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
}) {
  return createExternalPosition({
    comptrollerProxy,
    externalPositionManager,
    externalPositionTypeId: ExternalPositionType.ConvexVotingPosition,
    signer,
  });
}

export function convexVotingPositionClaimRewards({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  claimLockerRewards,
  extraRewardTokens,
  votiumClaims,
  unstakeCvxCrv,
  allTokensToTransfer,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  claimLockerRewards: boolean;
  extraRewardTokens: AddressLike[];
  votiumClaims: VotiumClaimParam[];
  unstakeCvxCrv: boolean;
  allTokensToTransfer: AddressLike[];
}) {
  const actionArgs = convexVotingPositionClaimRewardsArgs({
    allTokensToTransfer,
    claimLockerRewards,
    extraRewardTokens,
    unstakeCvxCrv,
    votiumClaims,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: ConvexVotingPositionActionId.ClaimRewards,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function convexVotingPositionDelegate({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  delegatee,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  delegatee: AddressLike;
}) {
  const actionArgs = convexVotingPositionDelegateArgs({
    delegatee,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: ConvexVotingPositionActionId.Delegate,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function convexVotingPositionLock({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  amount,
  spendRatio = BigNumber.from(0),
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  amount: BigNumberish;
  spendRatio?: BigNumberish;
}) {
  const actionArgs = convexVotingPositionLockArgs({
    amount,
    spendRatio,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: ConvexVotingPositionActionId.Lock,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function convexVotingPositionRelock({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
}) {
  return callOnExternalPosition({
    actionArgs: '0x',
    actionId: ConvexVotingPositionActionId.Relock,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function convexVotingPositionWithdraw({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
}) {
  return callOnExternalPosition({
    actionArgs: '0x',
    actionId: ConvexVotingPositionActionId.Withdraw,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}
