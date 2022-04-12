import type { AddressLike } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  ExternalPositionType,
  MapleLiquidityPositionActionId,
  mapleLiquidityPositionClaimInterestArgs,
  mapleLiquidityPositionClaimRewardsArgs,
  mapleLiquidityPositionIntendToRedeemArgs,
  mapleLiquidityPositionLendArgs,
  mapleLiquidityPositionRedeemArgs,
  mapleLiquidityPositionStakeArgs,
  mapleLiquidityPositionUnstakeArgs,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export async function createMapleLiquidityPosition({
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
    externalPositionTypeId: ExternalPositionType.MapleLiquidityPosition,
    signer,
  });
}

export async function mapleLiquidityPositionClaimInterest({
  comptrollerProxy,
  externalPositionManager,
  signer,
  pool,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  pool: AddressLike;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = mapleLiquidityPositionClaimInterestArgs({
    pool,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.ClaimInterest,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mapleLiquidityPositionClaimRewards({
  comptrollerProxy,
  externalPositionManager,
  signer,
  rewardsContract,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  rewardsContract: AddressLike;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = mapleLiquidityPositionClaimRewardsArgs({
    rewardsContract,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.ClaimRewards,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mapleLiquidityPositionIntendToRedeem({
  comptrollerProxy,
  externalPositionManager,
  signer,
  pool,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  pool: AddressLike;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = mapleLiquidityPositionIntendToRedeemArgs({
    pool,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.IntendToRedeem,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mapleLiquidityPositionLend({
  comptrollerProxy,
  externalPositionManager,
  signer,
  liquidityAsset,
  liquidityAssetAmount,
  pool,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  liquidityAsset: AddressLike;
  pool: AddressLike;
  liquidityAssetAmount: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = mapleLiquidityPositionLendArgs({
    liquidityAsset,
    liquidityAssetAmount,
    pool,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.Lend,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mapleLiquidityPositionRedeem({
  comptrollerProxy,
  externalPositionManager,
  signer,
  liquidityAsset,
  liquidityAssetAmount,
  pool,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  liquidityAsset: AddressLike;
  pool: AddressLike;
  liquidityAssetAmount: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = mapleLiquidityPositionRedeemArgs({
    liquidityAsset,
    liquidityAssetAmount,
    pool,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.Redeem,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mapleLiquidityPositionStake({
  comptrollerProxy,
  externalPositionManager,
  signer,
  poolTokenAmount,
  pool,
  rewardsContract,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  poolTokenAmount: BigNumberish;
  pool: AddressLike;
  rewardsContract: AddressLike;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = mapleLiquidityPositionStakeArgs({
    pool,
    poolTokenAmount,
    rewardsContract,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.Stake,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mapleLiquidityPositionUnstake({
  comptrollerProxy,
  externalPositionManager,
  signer,
  poolTokenAmount,
  rewardsContract,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  poolTokenAmount: BigNumberish;
  rewardsContract: AddressLike;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = mapleLiquidityPositionUnstakeArgs({
    poolTokenAmount,
    rewardsContract,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.Unstake,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}
