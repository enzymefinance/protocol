import type { AddressLike } from '@enzymefinance/ethers';
import type {
  ComptrollerLib,
  ExternalPositionManager,
  KilnStakingPositionActionClaimType,
} from '@enzymefinance/protocol';
import {
  ExternalPositionType,
  KilnStakingPositionActionId,
  kilnStakingPositionClaimFeesArgs,
  kilnStakingPositionStakeArgs,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export async function createKilnStakingPosition({
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
    externalPositionTypeId: ExternalPositionType.KilnStakingPosition,
    signer,
  });
}

export async function kilnStakingPositionClaimFees({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  stakingContractAddress,
  publicKeys,
  claimType,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  stakingContractAddress: AddressLike;
  publicKeys: BytesLike[];
  claimType: KilnStakingPositionActionClaimType;
}) {
  const actionArgs = kilnStakingPositionClaimFeesArgs({
    stakingContractAddress,
    publicKeys,
    claimType,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: KilnStakingPositionActionId.ClaimFees,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function kilnStakingPositionStake({
  comptrollerProxy,
  externalPositionManager,
  externalPositionProxy,
  signer,
  stakingContractAddress,
  amount,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
  signer: SignerWithAddress;
  stakingContractAddress: AddressLike;
  amount: BigNumberish;
}) {
  const actionArgs = kilnStakingPositionStakeArgs({
    stakingContractAddress,
    amount,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: KilnStakingPositionActionId.Stake,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function kilnStakingPositionWithdrawEth({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  externalPositionProxy: AddressLike;
  signer: SignerWithAddress;
}) {
  const actionArgs = '0x';

  return callOnExternalPosition({
    actionArgs,
    actionId: KilnStakingPositionActionId.WithdrawEth,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}
