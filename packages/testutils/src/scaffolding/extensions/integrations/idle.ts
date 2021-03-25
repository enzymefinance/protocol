import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  approveAssetsSelector,
  callOnIntegrationArgs,
  claimRewardsAndReinvestSelector,
  claimRewardsAndSwapSelector,
  claimRewardsSelector,
  ComptrollerLib,
  IdleAdapter,
  idleApproveAssetsArgs,
  idleClaimRewardsAndReinvestArgs,
  idleClaimRewardsAndSwapArgs,
  idleClaimRewardsArgs,
  idleLendArgs,
  idleRedeemArgs,
  IntegrationManager,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
  StandardToken,
} from '@enzymefinance/protocol';
import { BigNumber, BigNumberish } from 'ethers';

export async function idleApproveAssets({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  idleAdapter,
  idleToken,
  assets,
  amounts,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  idleAdapter: IdleAdapter;
  idleToken: StandardToken;
  assets: AddressLike[];
  amounts: BigNumberish[];
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    selector: approveAssetsSelector,
    encodedCallArgs: idleApproveAssetsArgs({
      idleToken,
      assets,
      amounts,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function idleClaimRewards({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  idleAdapter,
  idleToken,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  idleAdapter: IdleAdapter;
  idleToken: StandardToken;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    selector: claimRewardsSelector,
    encodedCallArgs: idleClaimRewardsArgs({
      vaultProxy: await comptrollerProxy.getVaultProxy(),
      idleToken,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function idleClaimRewardsAndReinvest({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  idleAdapter,
  idleToken,
  minIncomingIdleTokenAmount = BigNumber.from(1),
  useFullBalances,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  idleAdapter: IdleAdapter;
  idleToken: StandardToken;
  minIncomingIdleTokenAmount?: BigNumberish;
  useFullBalances: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    selector: claimRewardsAndReinvestSelector,
    encodedCallArgs: idleClaimRewardsAndReinvestArgs({
      vaultProxy: await comptrollerProxy.getVaultProxy(),
      idleToken,
      minIncomingIdleTokenAmount,
      useFullBalances,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function idleClaimRewardsAndSwap({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  idleAdapter,
  idleToken,
  incomingAsset,
  minIncomingAssetAmount = BigNumber.from(1),
  useFullBalances,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  idleAdapter: IdleAdapter;
  idleToken: StandardToken;
  incomingAsset: AddressLike;
  minIncomingAssetAmount?: BigNumberish;
  useFullBalances: boolean;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    selector: claimRewardsAndSwapSelector,
    encodedCallArgs: idleClaimRewardsAndSwapArgs({
      vaultProxy: await comptrollerProxy.getVaultProxy(),
      idleToken,
      incomingAsset,
      minIncomingAssetAmount,
      useFullBalances,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function idleLend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  idleAdapter,
  idleToken,
  outgoingUnderlyingAmount,
  minIncomingIdleTokenAmount = BigNumber.from(1),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  idleAdapter: IdleAdapter;
  idleToken: StandardToken;
  outgoingUnderlyingAmount: BigNumberish;
  minIncomingIdleTokenAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    selector: lendSelector,
    encodedCallArgs: idleLendArgs({
      idleToken,
      outgoingUnderlyingAmount,
      minIncomingIdleTokenAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export async function idleRedeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  idleAdapter,
  idleToken,
  outgoingIdleTokenAmount,
  minIncomingUnderlyingAmount = BigNumber.from(1),
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  idleAdapter: IdleAdapter;
  idleToken: StandardToken;
  outgoingIdleTokenAmount: BigNumberish;
  minIncomingUnderlyingAmount?: BigNumberish;
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: idleAdapter,
    selector: redeemSelector,
    encodedCallArgs: idleRedeemArgs({
      idleToken,
      outgoingIdleTokenAmount,
      minIncomingUnderlyingAmount,
    }),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
