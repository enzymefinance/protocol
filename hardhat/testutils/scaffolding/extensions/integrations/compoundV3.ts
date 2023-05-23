import type { AddressLike } from '@enzymefinance/ethers';
import type { CompoundV3Adapter, ComptrollerLib, IntegrationManager } from '@enzymefinance/protocol';
import {
  callOnIntegrationArgs,
  claimRewardsSelector,
  compoundV3ClaimRewardsArgs,
  compoundV3LendArgs,
  compoundV3RedeemArgs,
  IntegrationManagerActionId,
  lendSelector,
  redeemSelector,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';

export async function compoundV3Claim({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  cTokens,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundV3Adapter;
  cTokens: AddressLike[];
}) {
  const claimArgs = compoundV3ClaimRewardsArgs({
    cTokens,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: compoundAdapter,
    encodedCallArgs: claimArgs,
    selector: claimRewardsSelector,
  });

  const claimRewardsTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return claimRewardsTx;
}

export async function compoundV3Lend({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  cToken,
  tokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundV3Adapter;
  cToken: AddressLike;
  tokenAmount: BigNumberish;
}) {
  const lendArgs = compoundV3LendArgs({
    cToken,
    outgoingAssetAmount: tokenAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: compoundAdapter,
    encodedCallArgs: lendArgs,
    selector: lendSelector,
  });

  const lendTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return lendTx;
}

export async function compoundV3Redeem({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  compoundAdapter,
  cToken,
  cTokenAmount,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  compoundAdapter: CompoundV3Adapter;
  cToken: AddressLike;
  cTokenAmount: BigNumberish;
}) {
  const redeemArgs = compoundV3RedeemArgs({
    cToken,
    outgoingAssetAmount: cTokenAmount,
  });

  const callArgs = callOnIntegrationArgs({
    adapter: compoundAdapter,
    encodedCallArgs: redeemArgs,
    selector: redeemSelector,
  });

  const redeemTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);

  return redeemTx;
}
