import { utils, Signer, BigNumberish } from 'ethers';
import {
  callOnIntegrationArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  StandardToken,
  SynthetixAdapter,
  synthetixTakeOrderArgs,
  takeOrderSelector,
  VaultLib,
} from '@melonproject/protocol';

export async function synthetixTakeOrder({
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  fundOwner,
  synthetixAdapter,
  outgoingAsset,
  outgoingAssetAmount = utils.parseEther('1'),
  incomingAsset,
  minIncomingAssetAmount = utils.parseEther('1'),
  seedFund = false,
}: {
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  synthetixAdapter: SynthetixAdapter;
  outgoingAsset: StandardToken;
  outgoingAssetAmount?: BigNumberish;
  incomingAsset: StandardToken;
  minIncomingAssetAmount?: BigNumberish;
  seedFund?: boolean;
}) {
  if (seedFund) {
    // Seed the VaultProxy with enough outgoingAsset for the tx
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);
  }

  const takeOrderArgs = synthetixTakeOrderArgs({
    incomingAsset: incomingAsset,
    minIncomingAssetAmount: minIncomingAssetAmount,
    outgoingAsset: outgoingAsset,
    outgoingAssetAmount: outgoingAssetAmount,
  });

  const callArgs = await callOnIntegrationArgs({
    adapter: synthetixAdapter,
    selector: takeOrderSelector,
    encodedCallArgs: takeOrderArgs,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
