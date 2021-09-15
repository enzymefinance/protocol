import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  addTrackedAssetsArgs,
  addTrackedAssetsSelector,
  callOnIntegrationArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  removeTrackedAssetsArgs,
  removeTrackedAssetsSelector,
  TrackedAssetsAdapter,
} from '@enzymefinance/protocol';

export function addTrackedAssets({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  trackedAssetsAdapter,
  incomingAssets,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  trackedAssetsAdapter: TrackedAssetsAdapter;
  incomingAssets: AddressLike[];
}) {
  const args = addTrackedAssetsArgs(incomingAssets);
  const callArgs = callOnIntegrationArgs({
    adapter: trackedAssetsAdapter,
    selector: addTrackedAssetsSelector,
    encodedCallArgs: args,
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}

export function removeTrackedAssets({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  trackedAssetsAdapter,
  spendAssets,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: SignerWithAddress;
  trackedAssetsAdapter: TrackedAssetsAdapter;
  spendAssets: AddressLike[];
}) {
  const callArgs = callOnIntegrationArgs({
    adapter: trackedAssetsAdapter,
    selector: removeTrackedAssetsSelector,
    encodedCallArgs: removeTrackedAssetsArgs(spendAssets),
  });

  return comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, IntegrationManagerActionId.CallOnIntegration, callArgs);
}
