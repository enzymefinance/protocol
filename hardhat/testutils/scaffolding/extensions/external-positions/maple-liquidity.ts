import type { AddressLike } from '@enzymefinance/ethers';
import type { ComptrollerLib, ExternalPositionManager, MapleLiquidityPositionLib } from '@enzymefinance/protocol';
import {
  ExternalPositionType,
  ITestMapleV2Pool,
  ITestMapleV2PoolManager,
  ITestMapleV2WithdrawalManager,
  ITestStandardToken,
  MapleLiquidityPositionActionId,
  mapleLiquidityPositionCancelRedeemV2Args,
  mapleLiquidityPositionClaimRewardsV1Args,
  mapleLiquidityPositionLendV2Args,
  mapleLiquidityPositionRedeemV2Args,
  mapleLiquidityPositionRequestRedeemV2Args,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import { setAccountBalance } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';
import { BigNumber, utils } from 'ethers';

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

// V2

export async function mapleLiquidityPositionCalcPoolV2TokenBalance({
  mapleLiquidityPosition,
  poolV2Address,
}: {
  mapleLiquidityPosition: MapleLiquidityPositionLib;
  poolV2Address: AddressLike;
}) {
  const poolV2 = new ITestMapleV2Pool(poolV2Address, provider);
  const poolManager = new ITestMapleV2PoolManager(await poolV2.manager(), provider);
  const withdrawalManager = new ITestMapleV2WithdrawalManager(await poolManager.withdrawalManager(), provider);

  const poolV2Token = new ITestStandardToken(poolV2Address, provider);
  const positionBalance = await poolV2Token.balanceOf(mapleLiquidityPosition);
  const escrowedBalance = await withdrawalManager.lockedShares(mapleLiquidityPosition);

  return positionBalance.add(escrowedBalance);
}

export async function mapleLiquidityPositionCancelRedeemV2({
  comptrollerProxy,
  externalPositionManager,
  signer,
  pool,
  poolTokenAmount,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  pool: AddressLike;
  poolTokenAmount: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = mapleLiquidityPositionCancelRedeemV2Args({
    pool,
    poolTokenAmount,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.CancelRedeemV2,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mapleLiquidityPositionLendV2({
  comptrollerProxy,
  externalPositionManager,
  signer,
  liquidityAssetAmount,
  pool,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  pool: AddressLike;
  liquidityAssetAmount: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = mapleLiquidityPositionLendV2Args({
    liquidityAssetAmount,
    pool,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.LendV2,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mapleLiquidityPositionRedeemV2({
  comptrollerProxy,
  externalPositionManager,
  signer,
  poolTokenAmount,
  pool,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  pool: AddressLike;
  poolTokenAmount: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = mapleLiquidityPositionRedeemV2Args({
    poolTokenAmount,
    pool,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.RedeemV2,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function mapleLiquidityPositionRequestRedeemV2({
  comptrollerProxy,
  externalPositionManager,
  signer,
  pool,
  poolTokenAmount,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  pool: AddressLike;
  poolTokenAmount: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = mapleLiquidityPositionRequestRedeemV2Args({
    pool,
    poolTokenAmount,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.RequestRedeemV2,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

// V1

export async function mapleLiquidityPositionClaimRewardsV1({
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
  const actionArgs = mapleLiquidityPositionClaimRewardsV1Args({
    rewardsContract,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: MapleLiquidityPositionActionId.ClaimRewardsV1,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function simulateMapleV1Lend({
  mapleLiquidityPosition,
  poolV1,
  poolV1TokenAmount,
}: {
  mapleLiquidityPosition: AddressLike;
  poolV1TokenAmount: BigNumberish;
  poolV1: AddressLike;
}) {
  await setAccountBalance({
    account: mapleLiquidityPosition,
    amount: poolV1TokenAmount,
    provider,
    token: poolV1,
  });

  const arraySlot = BigNumber.from(utils.solidityKeccak256(['uint256'], [0]));
  const elementSlot = arraySlot.add(0).toHexString();

  await provider.send('hardhat_setStorageAt', [
    mapleLiquidityPosition,
    '0x0',
    utils.hexlify(utils.zeroPad('0x01', 32)),
  ]);

  await provider.send('hardhat_setStorageAt', [
    mapleLiquidityPosition,
    elementSlot,
    utils.hexlify(utils.zeroPad(poolV1.toString(), 32)),
  ]);
}
