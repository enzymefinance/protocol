import type { AddressLike } from '@enzymefinance/ethers';
import type {
  ComptrollerLib,
  CurveExchangeAdapter,
  CurveLiquidityAdapter,
  CurveRedeemType,
  IntegrationManager,
  ITestStandardToken,
} from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  claimRewardsSelector,
  curveClaimRewardsArgs,
  curveLendAndStakeArgs,
  curveLendArgs,
  curveRedeemArgs,
  curveStakeArgs,
  curveTakeOrderArgs,
  curveUnstakeAndRedeemArgs,
  curveUnstakeArgs,
  IntegrationManagerActionId,
  lendAndStakeSelector,
  lendSelector,
  redeemSelector,
  stakeSelector,
  takeOrderSelector,
  unstakeAndRedeemSelector,
  unstakeSelector,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, utils } from 'ethers';

// exchanges

export async function curveTakeOrder({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveExchangeAdapter,
  pool,
  outgoingAsset,
  outgoingAssetAmount = utils.parseEther('1'),
  incomingAsset,
  minIncomingAssetAmount = utils.parseEther('1'),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveExchangeAdapter: CurveExchangeAdapter;
  pool: AddressLike;
  outgoingAsset: ITestStandardToken;
  outgoingAssetAmount?: BigNumberish;
  incomingAsset: ITestStandardToken;
  minIncomingAssetAmount?: BigNumberish;
}) {
  const takeOrderArgs = curveTakeOrderArgs({
    incomingAsset,
    minIncomingAssetAmount,
    outgoingAsset,
    outgoingAssetAmount,
    pool,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: curveExchangeAdapter,
    encodedCallArgs: takeOrderArgs,
    selector: takeOrderSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

// combined liquidity

export function curveClaimRewards({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  curveLiquidityAdapter,
  stakingToken,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  stakingToken: AddressLike;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveClaimRewardsArgs({ stakingToken }),
    selector: claimRewardsSelector,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveLend({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  orderedOutgoingAssetAmounts,
  minIncomingLpTokenAmount = BigNumber.from(1),
  useUnderlyings,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  orderedOutgoingAssetAmounts: BigNumberish[];
  minIncomingLpTokenAmount?: BigNumberish;
  useUnderlyings: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveLendArgs({
      minIncomingLpTokenAmount,
      orderedOutgoingAssetAmounts,
      pool,
      useUnderlyings,
    }),
    selector: lendSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveLendAndStake({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  orderedOutgoingAssetAmounts,
  incomingStakingToken,
  minIncomingStakingTokenAmount = BigNumber.from(1),
  useUnderlyings,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  orderedOutgoingAssetAmounts: BigNumberish[];
  incomingStakingToken: AddressLike;
  minIncomingStakingTokenAmount?: BigNumberish;
  useUnderlyings: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveLendAndStakeArgs({
      incomingStakingToken,
      minIncomingStakingTokenAmount,
      orderedOutgoingAssetAmounts,
      pool,
      useUnderlyings,
    }),
    selector: lendAndStakeSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveRedeem({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  outgoingLpTokenAmount,
  useUnderlyings,
  redeemType,
  incomingAssetData,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  outgoingLpTokenAmount: BigNumberish;
  useUnderlyings: boolean;
  redeemType: CurveRedeemType;
  incomingAssetData: BytesLike;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveRedeemArgs({
      incomingAssetData,
      outgoingLpTokenAmount,
      pool,
      redeemType,
      useUnderlyings,
    }),
    selector: redeemSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveStake({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  incomingStakingToken,
  amount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  incomingStakingToken: AddressLike;
  amount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveStakeArgs({
      amount,
      incomingStakingToken,
      pool,
    }),
    selector: stakeSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveUnstake({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  outgoingStakingToken,
  amount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  outgoingStakingToken: AddressLike;
  amount: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveUnstakeArgs({
      amount,
      outgoingStakingToken,
      pool,
    }),
    selector: unstakeSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function curveUnstakeAndRedeem({
  comptrollerProxy,
  integrationManager,
  signer,
  curveLiquidityAdapter,
  pool,
  outgoingStakingToken,
  outgoingStakingTokenAmount,
  useUnderlyings,
  redeemType,
  incomingAssetData,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  signer: SignerWithAddress;
  curveLiquidityAdapter: CurveLiquidityAdapter;
  pool: AddressLike;
  outgoingStakingToken: ITestStandardToken;
  outgoingStakingTokenAmount: BigNumberish;
  useUnderlyings: boolean;
  redeemType: CurveRedeemType;
  incomingAssetData: BytesLike;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: curveLiquidityAdapter,
    encodedCallArgs: curveUnstakeAndRedeemArgs({
      incomingAssetData,
      outgoingStakingToken,
      outgoingStakingTokenAmount,
      pool,
      redeemType,
      useUnderlyings,
    }),
    selector: unstakeAndRedeemSelector,
  });

  return comptrollerProxy
    .connect(signer)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
